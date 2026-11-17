import type { APIRoute } from "astro";
import { currentUser, json, readJson } from "../../../lib/server/api";
import { dealRound, gamesEarn, isGame } from "../../../lib/server/ear-games";

/**
 * POST { game, setup, day } - a new ear-training round, dealt by the server
 * (ear-games.ts): { token, seed, setup, points }. Signed in only; someone
 * signed out plays from a seed of their own and earns nothing.
 */
export const POST: APIRoute = async ({ request }) => {
  const user = await currentUser(request);
  if (!user) return json({ error: "Sign in first." }, 401);
  const b = ((await readJson(request)) ?? {}) as Record<string, unknown>;
  if (!isGame(b.game)) return json({ error: "No such game." }, 400);
  const round = dealRound(user.id, b.game, b.setup, b.day);
  return json({ ...round, points: await gamesEarn(user.id).catch(() => false) });
};
