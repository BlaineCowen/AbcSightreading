import type { APIRoute } from "astro";
import { currentUser, json, readJson } from "../../lib/server/api";
import { applyFounders, FounderError, founderStatus, joinFounders } from "../../lib/server/founders";
import { checkApplication } from "../../lib/founders";

/**
 * Founding teachers (src/lib/founders.ts).
 *   GET  -> { ok: true } | { ok: false, reason, step? }   whether this account may join
 *   POST -> { expiresAt, seats, proRenews }               join (checked again here)
 *   POST { apply: { school, district, role, proofUrl, note } } -> { applied: true }
 *        a teacher with a personal email asks; the owner approves on /admin
 */
export const GET: APIRoute = async ({ request }) => {
  const user = await currentUser(request);
  return json(await founderStatus(user?.id ?? null));
};

export const POST: APIRoute = async ({ request }) => {
  const user = await currentUser(request);
  if (!user) return json({ error: "Sign in first." }, 401);
  const body = (await readJson(request).catch(() => null)) as { apply?: unknown } | null;
  try {
    if (body?.apply) {
      const checked = checkApplication(body.apply);
      if (!checked.ok) return json({ error: checked.error }, 400);
      await applyFounders(user.id, checked.value);
      return json({ applied: true });
    }
    return json(await joinFounders(user.id));
  } catch (e) {
    if (e instanceof FounderError) return json({ error: e.message }, e.status);
    throw e;
  }
};
