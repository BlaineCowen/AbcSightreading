import type { APIRoute } from "astro";
import { currentUser, json, readJson } from "../../../../lib/server/api";
import { isAdmin } from "../../../../lib/server/admin";
import { CodeError, affiliateReport, createAffiliate } from "../../../../lib/server/codes";
import { checkNewAffiliate } from "../../../../lib/codes";

/** Advertisers' codes, for the owner. GET -> report with earnings; POST { name, code, percentOff, commissionPercent } -> made in Stripe. */
export const GET: APIRoute = async ({ request }) => {
  if (!isAdmin(await currentUser(request))) return json({ error: "Not found." }, 404);
  return json(await affiliateReport());
};

export const POST: APIRoute = async ({ request }) => {
  if (!isAdmin(await currentUser(request))) return json({ error: "Not found." }, 404);
  const checked = checkNewAffiliate(await readJson(request));
  if (!checked.ok) return json({ error: checked.error }, 400);
  try {
    const a = await createAffiliate(checked.value);
    return json({ id: a.id, code: a.code }, 201);
  } catch (e) {
    if (e instanceof CodeError) return json({ error: e.message }, e.status);
    console.error("[affiliates]", e);
    return json({ error: "Stripe could not make the code." }, 502);
  }
};
