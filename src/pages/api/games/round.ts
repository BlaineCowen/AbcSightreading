import type { APIRoute } from "astro";
import { currentUser, json, readJson } from "../../../lib/server/api";
import { dealRound, earGamesShown, gamesEarn, isGame } from "../../../lib/server/ear-games";
import { assignedSetup } from "../../../lib/server/game-assignments";

/**
 * POST { game, setup, day, assignment? } - a new ear-training round, dealt by the server
 * (ear-games.ts): { token, seed, setup, points }. Signed in only; someone
 * signed out plays from a seed of their own and earns nothing.
 */
export const POST: APIRoute = async ({ request }) => {
  const user = await currentUser(request);
  if (!user) return json({ error: "Sign in first." }, 401);
  if (!earGamesShown(user)) return json({ error: "No such game." }, 404);
  const b = ((await readJson(request)) ?? {}) as Record<string, unknown>;
  if (!isGame(b.game)) return json({ error: "No such game." }, 400);
  // On an assignment the round is dealt from its stored setup, whatever the browser sent.
  let setup = b.setup;
  const ga = typeof b.assignment === "string" ? b.assignment : undefined;
  if (ga) {
    const stored = await assignedSetup(user.id, ga, b.game);
    if (stored === null) return json({ error: "That assignment isn't one of yours." }, 400);
    setup = stored;
  }
  const round = dealRound(user.id, b.game, setup, b.day, ga);
  return json({ ...round, points: await gamesEarn(user.id).catch(() => false) });
};
