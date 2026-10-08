import type { APIRoute } from "astro";
import { currentUser, json } from "../../../lib/server/api";
import { dismissGift, pendingGift } from "../../../lib/server/gift";

/**
 * A month of Pro given by hand (src/lib/server/gift.ts).
 *   GET  -> { gift: { grantId, until, plan } | null }   one not yet acknowledged
 *   POST { grantId } -> { ok: true }                      acknowledge it
 */
export const GET: APIRoute = async ({ request }) => {
  const user = await currentUser(request);
  if (!user) return json({ gift: null });
  return json({ gift: await pendingGift(user.id) });
};

export const POST: APIRoute = async ({ request }) => {
  const user = await currentUser(request);
  if (!user) return json({ error: "Sign in first." }, 401);
  const body = await request.json().catch(() => ({}));
  if (typeof body?.grantId !== "string") return json({ error: "Which gift?" }, 400);
  await dismissGift(user.id, body.grantId);
  return json({ ok: true });
};
