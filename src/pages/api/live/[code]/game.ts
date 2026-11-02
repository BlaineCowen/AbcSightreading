import type { APIRoute } from "astro";
import { currentUser, json, readJson } from "../../../../lib/server/api";
import { prisma } from "../../../../lib/server/db";
import { limits, noRoom, notifyRoom, offAir, ownRoom, roomOnAir, tooMany } from "../../../../lib/server/live";
import { liveEndsAt } from "../../../../lib/live";
import { checkGame } from "../../../../lib/games/live-game";

/**
 * A class game in the director's live room (Games; src/lib/games/live-game.ts).
 *
 * PUT { game }: the host's page publishes the game's state (lobby, a round
 *   playing, answers coming in, results and the board); the room shows the
 *   game (`page: "game"`), the version goes up and every device is told.
 *   A new game (round number 0, the lobby) clears the last game's answers.
 *   Only while Live is on, and only the room's own director.
 */
export const PUT: APIRoute = async ({ request, params }) => {
  const user = await currentUser(request);
  if (!user) return json({ error: "Sign in first." }, 401);
  if (!limits.teacher(`game:${user.id}`)) return tooMany();
  const s = await ownRoom(params.code, user.id);
  if (!s) return noRoom();
  if (!roomOnAir(s)) return offAir();
  const checked = checkGame(((await readJson(request)) as { game?: unknown } | null)?.game);
  if (!checked.ok) return json({ error: checked.error }, 400);
  const game = checked.value;
  if (game.phase === "lobby" && game.number === 0) await prisma.liveGameAnswer.deleteMany({ where: { roomId: s.id } });
  const updated = await prisma.liveRoom.update({
    where: { id: s.id },
    data: { page: "game", game, version: { increment: 1 }, endsAt: liveEndsAt(s.startedAt, new Date()) },
    select: { version: true },
  });
  await notifyRoom(s.code);
  return json({ version: updated.version });
};
