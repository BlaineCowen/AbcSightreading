import type { APIRoute } from "astro";
import { currentUser, json } from "../../../lib/server/api";
import { BROWSER_COOKIE, FreeMonthError, claimFreeMonth, freeMonthStatus } from "../../../lib/server/free-month";

/**
 * The free month of Pro (src/lib/free-month.ts).
 *   GET  -> { ok: true } | { ok: false, reason, quiet? }   whether this account may claim it
 *   POST { browserId } -> { plan, expiresAt }               claim it (checked again here)
 * The browser is marked with a long-lived cookie when it claims, so a second
 * account in the same browser is refused.
 */
export const GET: APIRoute = async ({ request, clientAddress }) => {
  const user = await currentUser(request);
  if (!user) return json({ ok: false, reason: "Create a free account first.", quiet: true });
  return json(await freeMonthStatus(user.id, request, clientAddress));
};

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const user = await currentUser(request);
  if (!user) return json({ error: "Sign in first." }, 401);
  const body = await request.json().catch(() => ({}));
  try {
    const { mark, ...grant } = await claimFreeMonth(user.id, request, clientAddress, body?.browserId);
    const res = json(grant);
    res.headers.append("Set-Cookie", `${BROWSER_COOKIE}=${mark}; Path=/; Max-Age=${60 * 60 * 24 * 400}; HttpOnly; SameSite=Lax${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`);
    return res;
  } catch (e) {
    if (e instanceof FreeMonthError) return json({ error: e.message }, e.status);
    throw e;
  }
};
