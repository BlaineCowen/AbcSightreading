import type { APIRoute } from "astro";
import { currentUser, json } from "../../../../../lib/server/api";
import { prisma } from "../../../../../lib/server/db";
import { limits, noRoom, ownRoom, tooMany } from "../../../../../lib/server/live";
import { playerName, playerTag } from "../../../../../lib/games/game-names";

/**
 * The host's page reading a round's answers, about once a second while they
 * come in: GET ?round=<id> -> { answers: [{ tag, name, fallback, answer }] }. Only
 * the room's own director. The host scores them (game-score.ts). Each is
 * named by its device's tag (game-names.ts playerTag), never its key, with
 * its made-up name (`fallback`), for a name the teacher removes.
 */
export const GET: APIRoute = async ({ request, params, url }) => {
  const user = await currentUser(request);
  if (!user) return json({ error: "Sign in first." }, 401);
  if (!limits.teacher(`answers:${user.id}`)) return tooMany();
  const s = await ownRoom(params.code, user.id);
  if (!s) return noRoom();
  const round = url.searchParams.get("round") ?? "";
  const rows = await prisma.liveGameAnswer.findMany({
    where: { roomId: s.id, round },
    select: { deviceKey: true, name: true, answer: true },
    orderBy: { createdAt: "asc" },
  });
  return json({ answers: rows.map((r) => ({ tag: playerTag(r.deviceKey), name: r.name, fallback: playerName(r.deviceKey), answer: r.answer })) });
};
