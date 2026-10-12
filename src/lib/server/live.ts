import { prisma } from "./db";
import { json } from "./api";
import { hasPremium } from "./plan";
import { accountTypeFor } from "./students";
import { Prisma } from "../../generated/prisma/client";
import { generateLiveCode, isLiveCode, isLiveOpen, liveEndsAt, normalizeLiveCode, rateLimiter } from "../live";

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
