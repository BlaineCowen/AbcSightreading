import type { APIRoute } from "astro";
import { currentUser, json } from "../../lib/server/api";
import { FounderError, founderStatus, joinFounders } from "../../lib/server/founders";

/**
 * Founding teachers (src/lib/founders.ts).
 *   GET  -> { ok: true } | { ok: false, reason, step? }   whether this account may join
 *   POST -> { expiresAt, seats }                          join (checked again here)
 */
export const GET: APIRoute = async ({ request }) => {
  const user = await currentUser(request);
  return json(await founderStatus(user?.id ?? null));
};

export const POST: APIRoute = async ({ request }) => {
  const user = await currentUser(request);
  if (!user) return json({ error: "Sign in first." }, 401);
  try {
    return json(await joinFounders(user.id));
  } catch (e) {
    if (e instanceof FounderError) return json({ error: e.message }, e.status);
    throw e;
  }
};
