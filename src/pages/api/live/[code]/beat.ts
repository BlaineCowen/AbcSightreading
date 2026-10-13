import type { APIRoute } from "astro";
import { json, readJson } from "../../../../lib/server/api";
import { prisma } from "../../../../lib/server/db";
import { clientKey, limits, noRoom, offAir, roomByCode, roomOnAir, tooMany } from "../../../../lib/server/live";
import { isDeviceKey, isLiveCode, normalizeLiveCode } from "../../../../lib/live";

/**
 * A student's device saying it is there: POST { device, part }, every
 * HEARTBEAT_MS. `device` is a random id the browser made; nothing else about
 * the student is sent or kept. Lets the director's panel count devices. Only
 * while Live is on; a waiting device sends none.
 */

/** More than any choir room holds; stops a script filling the table. */
const MAX_DEVICES = 400;

export const POST: APIRoute = async ({ request, params, clientAddress }) => {
  const code = normalizeLiveCode(params.code ?? "");
  const body = ((await readJson(request)) ?? {}) as { device?: unknown; part?: unknown };
  if (!isLiveCode(code) || !isDeviceKey(body.device)) return json({ error: "Not a device of this room." }, 400);
  if (!limits.beatPerDevice(`${code}:${body.device}`)) return tooMany();
  if (!limits.pollPerAddress(clientKey(request, clientAddress))) return tooMany();
  const s = await roomByCode(code);
  if (!s) return noRoom();
  if (!roomOnAir(s)) return offAir();
  const part = typeof body.part === "string" ? body.part.slice(0, 24) : null;
  const where = { roomId_deviceKey: { roomId: s.id, deviceKey: body.device } };
  // One query for a device already counted, the usual case.
  const { count } = await prisma.liveDevice.updateMany({
    where: { roomId: s.id, deviceKey: body.device },
    data: { part, seenAt: new Date() },
  });
  if (count === 0) {
    if ((await prisma.liveDevice.count({ where: { roomId: s.id } })) >= MAX_DEVICES) {
      return json({ error: "This live room is full." }, 409);
    }
    await prisma.liveDevice.upsert({
      where,
      create: { roomId: s.id, deviceKey: body.device, part },
      update: { part, seenAt: new Date() },
    });
  }
  return json({ ok: true });
};
