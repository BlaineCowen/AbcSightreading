import type { APIRoute } from "astro";
import { currentUser, json } from "../../lib/server/api";
import { claimGeneration, generationStatus } from "../../lib/server/plan";

/**
 * The monthly exercise allowance of a signed-in account (src/lib/plan.ts).
 * Signed out, the page counts in the browser and never calls this.
 *
 * GET  -> { plan, limit, used, remaining, allowed }   (limit null: unlimited)
 * POST -> uses one: { granted, plan, limit, used, remaining, allowed }
 */

export const GET: APIRoute = async ({ request }) => {
  const user = await currentUser(request);
  if (!user) return json({ error: "Sign in first." }, 401);
  return json(await generationStatus(user.id));
};

export const POST: APIRoute = async ({ request }) => {
  const user = await currentUser(request);
  if (!user) return json({ error: "Sign in first." }, 401);
  return json(await claimGeneration(user.id));
};
