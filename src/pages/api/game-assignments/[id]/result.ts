import type { APIRoute } from "astro";
import { currentUser, json, readJson } from "../../../../lib/server/api";
import { recordGameResult } from "../../../../lib/server/game-assignments";

/**
 * POST { game, score } - a round of Note Rain, the rhythm game or Catch the
 * tune finished on an assignment, as the device reports it (`checked` false).
 * Ear games' rounds are marked on the server instead (/api/games/finish).
 * -> the student's progress on it.
 */
export const POST: APIRoute = async ({ request, params }) => {
  const user = await currentUser(request);
  if (!user) return json({ error: "Sign in first." }, 401);
  const b = ((await readJson(request)) ?? {}) as Record<string, unknown>;
  if (b.game === "solfege" || b.game === "interval") return json({ error: "Ear games are marked when the round finishes." }, 400);
  if (typeof b.game !== "string" || typeof b.score !== "number" || !Number.isFinite(b.score)) return json({ error: "A game and a score." }, 400);
  const p = await recordGameResult(user.id, params.id!, b.game, b.score, { checked: false });
  return p && p !== "again" ? json({ progress: p }) : json({ error: "No such assignment." }, 404);
};
