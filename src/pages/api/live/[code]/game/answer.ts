import type { APIRoute } from "astro";
import { json, readJson } from "../../../../../lib/server/api";
import { prisma } from "../../../../../lib/server/db";
import { clientKey, limits, noRoom, offAir, roomByCode, roomOnAir, tooMany } from "../../../../../lib/server/live";
import { isDeviceKey, isLiveCode, normalizeLiveCode } from "../../../../../lib/live";
import { checkAnswer, type LiveGame } from "../../../../../lib/games/live-game";
import { cleanName, nameKey, nameProblem, playerName, playerTag } from "../../../../../lib/games/game-names";

/**
 * A student's device answering a round of the room's game: POST { device,
 * round, answer, name? }. No account. The name is the one the student typed
 * if it passes the check (game-names.ts nameProblem) and the teacher has not
 * removed it, else the device's made-up one; nothing else about them. Taken while the round is playing or its
 * answers are coming in; sent again, it replaces the device's last answer.
 */
export const POST: APIRoute = async ({ request, params, clientAddress }) => {
  const code = normalizeLiveCode(params.code ?? "");
  const body = ((await readJson(request)) ?? {}) as { device?: unknown; round?: unknown; answer?: unknown; name?: unknown };
  if (!isLiveCode(code) || !isDeviceKey(body.device) || typeof body.round !== "string") return json({ error: "Not an answer for this room." }, 400);
  if (!limits.answerPerDevice(`${code}:${body.device}`)) return tooMany();
  if (!limits.pollPerAddress(clientKey(request, clientAddress))) return tooMany();
  const s = await roomByCode(code);
  if (!s) return noRoom();
  if (!roomOnAir(s)) return offAir();
  const room = await prisma.liveRoom.findUnique({ where: { id: s.id }, select: { page: true, game: true } });
  const game = room?.page === "game" ? (room.game as unknown as LiveGame | null) : null;
  if (!game || game.round !== body.round) return json({ error: "That round is over." }, 409);
  if (game.phase !== "playing" && game.phase !== "answering") return json({ error: "That round is over." }, 409);
  const checked = checkAnswer(game.kind, body.answer);
  if (!checked.ok) return json({ error: checked.error }, 400);
  const typed = typeof body.name === "string" ? cleanName(body.name) : "";
  const name = typed && !nameProblem(typed) && !(game.blocked ?? []).includes(nameKey(typed)) ? typed : playerName(body.device);
  await prisma.liveGameAnswer.upsert({
    where: { roomId_round_deviceKey: { roomId: s.id, round: game.round, deviceKey: body.device } },
    create: { roomId: s.id, round: game.round, deviceKey: body.device, name, answer: checked.value },
    update: { answer: checked.value, name },
  });
  return json({ ok: true, name, tag: playerTag(body.device) });
};
