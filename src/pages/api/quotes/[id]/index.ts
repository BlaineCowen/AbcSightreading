import type { APIRoute } from "astro";
import { currentUser, json, readJson } from "../../../../lib/server/api";
import { QuoteError, acceptSchoolQuote, cancelSchoolQuote } from "../../../../lib/server/quotes";
import { checkPoNumber } from "../../../../lib/quote";
import { quoteView } from "../index";

/**
 * One quote.
 *
 * POST   { poNumber } -> accept it: Educator starts, the invoice goes to the school
 * DELETE              -> cancel an open quote
 */

const failed = (e: unknown) => {
  if (e instanceof QuoteError) return json({ error: e.message }, e.status);
  console.error("[quotes]", e);
  return json({ error: "Stripe could not do that. Try again in a minute." }, 502);
};

export const POST: APIRoute = async ({ request, params }) => {
  const user = await currentUser(request);
  if (!user) return json({ error: "Sign in first." }, 401);
  const po = checkPoNumber(((await readJson(request)) as { poNumber?: unknown } | undefined)?.poNumber);
  if (!po.ok) return json({ error: po.error }, 400);
  try {
    return json(quoteView(await acceptSchoolQuote(user, params.id!, po.value)));
  } catch (e) {
    return failed(e);
  }
};

export const DELETE: APIRoute = async ({ request, params }) => {
  const user = await currentUser(request);
  if (!user) return json({ error: "Sign in first." }, 401);
  try {
    await cancelSchoolQuote(user.id, params.id!);
    return json({ ok: true });
  } catch (e) {
    return failed(e);
  }
};
