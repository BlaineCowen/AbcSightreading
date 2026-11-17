import type { APIRoute } from "astro";
import { currentUser, json, readJson } from "../../../lib/server/api";
import { finishRound } from "../../../lib/server/ear-games";

/**
 * POST { token, answers } - a round played: marked on the server from
 * its token, and awarded if the student's teacher lets games earn
 * (ear-games.ts): { correct, total, marks, award, problem? }.
 */
export const POST: APIRoute = async ({ request }) => {
  const user = await currentUser(request);
  if (!user) return json({ error: "Sign in first." }, 401);
  const b = ((await readJson(request)) ?? {}) as Record<string, unknown>;
  try {
    const done = await finishRound(user.id, b.token, b.answers);
    if (!done) return json({ error: "That round isn't one of yours." }, 400);
    return json(done);
  } catch (e) {
    console.error("ear game", e);
    return json({ error: "Could not count that round." }, 500);
  }
};
