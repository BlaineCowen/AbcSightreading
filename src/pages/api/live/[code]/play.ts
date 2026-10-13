import type { APIRoute } from "astro";
import { currentUser, json, readJson } from "../../../../lib/server/api";
import { prisma } from "../../../../lib/server/db";
import { limits, noRoom, offAir, ownRoom, roomOnAir, tooMany } from "../../../../lib/server/live";
import { liveEndsAt, startPlay } from "../../../../lib/live";
import { Prisma } from "../../../../generated/prisma/client";

/**
 * "Start together": POST { start: true, bpm } sets a start a few seconds from
 * now on the server clock, for the version on the page now; every device
 * counts in and runs its cursor from it. POST { start: false } stops it.
 * Answers { play, serverNow }.
 */
export const POST: APIRoute = async ({ request, params }) => {
  const user = await currentUser(request);
  if (!user) return json({ error: "Sign in first." }, 401);
  if (!limits.teacher(`play:${user.id}`)) return tooMany();
  const s = await ownRoom(params.code, user.id);
  if (!s) return noRoom();
  if (!roomOnAir(s)) return offAir();
  const body = ((await readJson(request)) ?? {}) as { start?: unknown; bpm?: unknown };
  const now = Date.now();
  if (body.start !== true) {
    await prisma.liveRoom.update({ where: { id: s.id }, data: { play: Prisma.DbNull } });
    return json({ play: null, serverNow: now });
  }
  if (!s.abc) return json({ error: "Generate an exercise first." }, 400);
  const bpm = Number(body.bpm);
  const settingsBpm = Number((s.settings as { bpm?: unknown } | null)?.bpm);
  const play = startPlay({
    now,
    bpm: Number.isFinite(bpm) && bpm > 0 ? bpm : Number.isFinite(settingsBpm) ? settingsBpm : 90,
    version: s.version,
    id: `${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`,
  });
  await prisma.liveRoom.update({ where: { id: s.id }, data: { play, endsAt: liveEndsAt(s.startedAt, new Date(now)) } });
  return json({ play, serverNow: Date.now() });
};
