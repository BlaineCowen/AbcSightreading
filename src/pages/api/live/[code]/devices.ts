import type { APIRoute } from "astro";
import { currentUser, json } from "../../../../lib/server/api";
import { prisma } from "../../../../lib/server/db";
import { limits, noRoom, ownRoom, roomOnAir, tooMany } from "../../../../lib/server/live";
import { DEVICE_WINDOW_MS, deviceSummary, liveEndsAt, shouldExtend } from "../../../../lib/live";

/**
 * The teacher's panel, every few seconds: how many devices are following and
 * on which parts, { connected, parts, open, version, endsAt }. While the
 * panel is open the room is in use, so this also keeps Live from going off
 * by itself (at most one write a minute).
 */
export const GET: APIRoute = async ({ request, params }) => {
  const user = await currentUser(request);
  if (!user) return json({ error: "Sign in first." }, 401);
  if (!limits.teacher(`devices:${user.id}`)) return tooMany();
  const s = await ownRoom(params.code, user.id);
  if (!s) return noRoom();
  const now = new Date();
  const open = roomOnAir(s);
  let endsAt = s.endsAt;
  if (open && shouldExtend(s.endsAt, s.startedAt, now)) {
    endsAt = liveEndsAt(s.startedAt, now);
    await prisma.liveRoom.update({ where: { id: s.id }, data: { endsAt } });
  }
  const devices = await prisma.liveDevice.findMany({
    where: { roomId: s.id, seenAt: { gt: new Date(now.getTime() - DEVICE_WINDOW_MS) } },
    select: { seenAt: true, part: true },
  });
  return json({ ...deviceSummary(devices, now), open, version: s.version, endsAt: endsAt.getTime() });
};
