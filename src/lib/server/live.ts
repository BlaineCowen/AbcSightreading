import { prisma } from "./db";
import { json } from "./api";
import { hasPremium } from "./plan";
import { accountTypeFor } from "./students";
import { Prisma } from "../../generated/prisma/client";
import { serverEnv } from "./env";
import { generateLiveCode, isLiveCode, isLiveOpen, isLivePlay, liveEndsAt, liveEtag, normalizeLiveCode, rateLimiter } from "../live";

/**
 * Live practice against the database: one room per director, its code for
 * good. The rules are in src/lib/live.ts (unit-tested); the routes are
 * src/pages/api/live/.
 */

/** Who may turn Live on: Pro or Educator, and never a student account. */
export async function mayRunLive(user: { id: string }): Promise<{ ok: true } | { ok: false; response: Response }> {
  if ((await accountTypeFor(user)) === "student") {
    return { ok: false, response: json({ error: "Live practice is run from a teacher's account." }, 403) };
  }
  if (!(await hasPremium(user))) {
    return { ok: false, response: json({ error: "Live practice is part of Pro.", upgrade: true }, 403) };
  }
  return { ok: true };
}

/** A code no room has. Codes are never reused: an old poster must never land in someone else's room. */
async function freshCode(): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const code = generateLiveCode();
    if (!(await prisma.liveRoom.findUnique({ where: { code }, select: { id: true } }))) return code;
  }
  throw new Error("Could not find a free live code.");
}

const ROOM = { code: true, page: true, version: true, startedAt: true, endsAt: true, endedAt: true } as const;
export type RoomShape = Prisma.LiveRoomGetPayload<{ select: typeof ROOM }>;

/** The director's room, if they have made one. */
export function roomOf(teacherId: string) {
  return prisma.liveRoom.findUnique({ where: { teacherId }, select: ROOM });
}

/** The director's room, made (off air) the first time it is asked for: the poster can be printed before Live is ever on. */
export async function ensureRoom(teacherId: string) {
  const room = await roomOf(teacherId);
  if (room) return room;
  try {
    const now = new Date();
    return await prisma.liveRoom.create({ data: { code: await freshCode(), teacherId, endsAt: now, endedAt: now }, select: ROOM });
  } catch {
    // Two first requests at once: the other one made it.
    const made = await roomOf(teacherId);
    if (made) return made;
    throw new Error("Could not make a live room.");
  }
}

/** Live on: the room on air from now, on the page that turned it on. Devices start from a clean count. */
export async function goLive(teacherId: string, page: string) {
  const room = await ensureRoom(teacherId);
  const now = new Date();
  if (isLiveOpen(room, now)) {
    return prisma.liveRoom.update({ where: { teacherId }, data: { page, endsAt: liveEndsAt(room.startedAt, now) }, select: ROOM });
  }
  return prisma.liveRoom.update({
    where: { teacherId },
    data: { page, startedAt: now, endsAt: liveEndsAt(now, now), endedAt: null, play: Prisma.DbNull },
    select: ROOM,
  });
}

/** Live off: the room waits, its address unchanged. */
export function goOffAir(roomId: string) {
  return prisma.liveRoom.update({ where: { id: roomId }, data: { endedAt: new Date(), play: Prisma.DbNull } });
}

/**
 * A new code for the room, off air: the old address and its posters stop
 * working. For a link that has got out of the room.
 */
export async function newRoomCode(teacherId: string) {
  await ensureRoom(teacherId);
  const now = new Date();
  await prisma.liveDevice.deleteMany({ where: { room: { teacherId } } });
  return prisma.liveRoom.update({
    where: { teacherId },
    data: { code: await freshCode(), endedAt: now, play: Prisma.DbNull },
    select: ROOM,
  });
}

/** A room by the code in the address, if it is that director's own. */
export async function ownRoom(code: string | undefined, teacherId: string) {
  const c = normalizeLiveCode(code ?? "");
  if (!isLiveCode(c)) return null;
  const room = await prisma.liveRoom.findUnique({ where: { code: c } });
  return room && room.teacherId === teacherId ? room : null;
}

/**
 * A room's id and air time by its code, remembered for a few seconds by this
 * server instance: every device's heartbeat needs it. Short, because Live
 * going on or off must show quickly; the poll reads the database itself.
 */
const byCode = new Map<string, { id: string; endsAt: Date; endedAt: Date | null; at: number }>();
export async function roomByCode(code: string) {
  const now = Date.now();
  const hit = byCode.get(code);
  if (hit && now - hit.at < 5_000) return hit;
  const room = await prisma.liveRoom.findUnique({ where: { code }, select: { id: true, endsAt: true, endedAt: true } });
  if (!room) return null;
  if (byCode.size > 5000) byCode.clear();
  const entry = { ...room, at: now };
  byCode.set(code, entry);
  return entry;
}

export const roomOnAir = (room: { endsAt: Date; endedAt: Date | null }) => isLiveOpen(room, new Date());

/** The name a waiting student is shown ("Waiting for Ms Ruiz"): the director's own account name, nothing else. */
export async function directorName(teacherId: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: teacherId }, select: { name: true } });
  return (user?.name ?? "").trim().slice(0, 60);
}

/**
 * What a device is shown, by the room's code: off air { live: false,
 * director }; on air { live: true, version, play } and, unless `since` is
 * the version it has, the score { abc, settings, page }. The poll's answer
 * and what the push service hands every device are the same thing.
 */
export async function roomState(code: string, since?: number) {
  const light = await prisma.liveRoom.findUnique({
    where: { code },
    select: { version: true, play: true, endsAt: true, endedAt: true, teacherId: true },
  });
  if (!light) return null;
  const open = roomOnAir(light);
  const play = open && isLivePlay(light.play) ? light.play : null;
  const etag = liveEtag({ version: light.version, playId: play?.id ?? null, open });
  if (!open) return { etag, body: { live: false as const, director: await directorName(light.teacherId) } };
  const base = { live: true as const, version: light.version, play };
  if (since === light.version) return { etag, body: base };
  const full = await prisma.liveRoom.findUnique({ where: { code }, select: { abc: true, settings: true, page: true } });
  return { etag, body: { ...base, abc: full?.abc ?? "", settings: full?.settings ?? null, page: full?.page } };
}

// ── Push (workers/live-push) ─────────────────────────────────────────────

/** The push service and the secret it takes from the site; with either missing, devices poll as before. */
const pushConfig = () => {
  const url = serverEnv("LIVE_PUSH_URL");
  const secret = serverEnv("LIVE_PUSH_SECRET");
  return url && secret ? { url: url.replace(/\/$/, ""), secret } : null;
};

/** A call to the push service; never throws and never holds the director's request up for long. */
async function pushCall(path: string, init: RequestInit = {}): Promise<Response | null> {
  const cfg = pushConfig();
  if (!cfg) return null;
  try {
    return await fetch(`${cfg.url}${path}`, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${cfg.secret}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(2000),
    });
  } catch (e) {
    console.error("live push:", path, e);
    return null;
  }
}

/**
 * Tells every device on a socket what the room shows now. Called after each
 * change the director makes (publish, start, stop, Live on or off); devices
 * that missed it catch up on their next safety poll.
 */
export async function notifyRoom(code: string) {
  if (!pushConfig()) return;
  const state = await roomState(code);
  if (state) await pushCall(`/rooms/${code}/publish`, { method: "POST", body: JSON.stringify(state.body) });
}

/** A room's old code after a new one is made: its devices are told it is gone, and their sockets closed. */
export async function notifyGone(code: string) {
  await pushCall(`/rooms/${code}/publish?close=1`, { method: "POST", body: JSON.stringify({ gone: true }) });
}

/** The devices on a socket to a room, for the director's count; none when the service cannot say. */
export async function pushedDevices(code: string): Promise<{ device: string; part: string | null }[]> {
  const res = await pushCall(`/rooms/${code}/presence`);
  if (!res?.ok) return [];
  const data = (await res.json().catch(() => null)) as { devices?: unknown } | null;
  return Array.isArray(data?.devices)
    ? data.devices.filter((d): d is { device: string; part: string | null } => !!d && typeof d.device === "string")
    : [];
}

export const noRoom = () => json({ error: "No live room has that code." }, 404);
export const offAir = () => json({ error: "Live is off.", offAir: true }, 409);

/** The address a request came from, for rate limits only; never stored. */
export function clientKey(request: Request, clientAddress?: string): string {
  const fwd = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || request.headers.get("x-real-ip") || clientAddress || "unknown";
}

/**
 * Rate limits, per server instance. A whole class can sit behind one school
 * address, so the poll is limited per device and only loosely per address;
 * codes that do not exist are limited per address, which is what stops
 * guessing.
 */
export const limits = {
  pollPerDevice: rateLimiter(90, 60_000),
  pollPerAddress: rateLimiter(6000, 60_000),
  missesPerAddress: rateLimiter(30, 60_000),
  beatPerDevice: rateLimiter(12, 60_000),
  teacher: rateLimiter(240, 60_000),
};

export const tooMany = () =>
  new Response(JSON.stringify({ error: "Too many requests. Wait a moment." }), {
    status: 429,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "Retry-After": "10" },
  });
