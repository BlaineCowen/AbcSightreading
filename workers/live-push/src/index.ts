/**
 * Live push: one Durable Object per live room, holding a WebSocket for each
 * student device on it (notes/live-practice.md, "Push"). Vercel stays the
 * truth about a room; whenever the director publishes, starts, stops or goes
 * off air, the site POSTs the room's new state here and the room hands it to
 * every device at once. A device on a socket polls the site only as a safety
 * net, so a class costs a few messages a change instead of a request every
 * 1.5 s per phone.
 *
 *   GET  /rooms/<code>/ws?d=<device>&p=<part>   a device's socket (anyone with the code)
 *   POST /rooms/<code>/publish[?close=1]         the site: send this body to every device
 *   GET  /rooms/<code>/presence                  the site: { devices: [{ device, part }] }
 *
 * The last two need `Authorization: Bearer <PUSH_SECRET>`. Sockets use the
 * hibernation API, so a quiet room costs nothing while it waits, and a
 * device's "ping" is answered without waking the room.
 */
import { DurableObject } from "cloudflare:workers";

export interface Env {
  ROOMS: DurableObjectNamespace<Room>;
  PUSH_SECRET?: string;
}

/** The site's live codes (src/lib/live.ts isLiveCode, isDeviceKey). */
const CODE = /^[2-9]{3}[A-HJKMNP-Z]{3}$/;
const DEVICE = /^[A-Za-z0-9]{12,40}$/;
/** More than any choir room holds, as the site's MAX_DEVICES. */
const MAX_SOCKETS = 400;
/** The largest state the site sends: a score is at most 120 KB. */
const MAX_BODY = 200_000;

const cleanPart = (p: unknown) => (typeof p === "string" && p ? p.slice(0, 24) : null);
type Attachment = { device: string; part: string | null };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const m = /^\/rooms\/([^/]+)\/(ws|publish|presence)$/.exec(url.pathname);
    if (!m || !CODE.test(m[1])) return new Response("Not found", { status: 404 });
    const [, code, what] = m;
    if (what === "ws") {
      if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("Expected a WebSocket", { status: 426 });
    } else if (!env.PUSH_SECRET || request.headers.get("Authorization") !== `Bearer ${env.PUSH_SECRET}`) {
      return new Response("Unauthorized", { status: 401 });
    }
    return env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(request);
  },
};

export class Room extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Keep-alives answered at the edge, never waking the room.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const what = url.pathname.split("/").pop();

    if (what === "ws") {
      const device = url.searchParams.get("d") ?? "";
      if (!DEVICE.test(device)) return new Response("Not a device", { status: 400 });
      // The same device again (a reload, a new network): its old socket goes.
      for (const old of this.ctx.getWebSockets(device)) old.close(4000, "replaced");
      if (this.ctx.getWebSockets().length >= MAX_SOCKETS) return new Response("This live room is full", { status: 409 });
      const [client, server] = Object.values(new WebSocketPair());
      this.ctx.acceptWebSocket(server, [device]);
      server.serializeAttachment({ device, part: cleanPart(url.searchParams.get("p")) } satisfies Attachment);
      return new Response(null, { status: 101, webSocket: client });
    }

    if (what === "publish") {
      const body = await request.text();
      if (body.length > MAX_BODY) return new Response("Too large", { status: 413 });
      const close = url.searchParams.get("close") === "1";
      let sent = 0;
      for (const ws of this.ctx.getWebSockets()) {
        try {
          ws.send(body);
          sent++;
          if (close) ws.close(4001, "gone");
        } catch {
          // a socket closing as we send: it will reconnect and fetch
        }
      }
      return Response.json({ sent });
    }

    const devices = this.ctx
      .getWebSockets()
      .map((ws) => ws.deserializeAttachment() as Attachment | null)
      .filter((a): a is Attachment => !!a);
    return Response.json({ devices });
  }

  /** The only thing a device says: the part it reads now, for the director's count. */
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== "string" || message.length > 200) return;
    let m: { type?: unknown; part?: unknown };
    try {
      m = JSON.parse(message);
    } catch {
      return;
    }
    if (m?.type !== "part") return;
    const a = ws.deserializeAttachment() as Attachment | null;
    if (a) ws.serializeAttachment({ ...a, part: cleanPart(m.part) } satisfies Attachment);
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string) {
    try {
      ws.close(code, reason);
    } catch {
      // already closed
    }
  }

  async webSocketError(ws: WebSocket) {
    try {
      ws.close(1011, "error");
    } catch {
      // already closed
    }
  }
}
