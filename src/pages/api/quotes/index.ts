import type { APIRoute } from "astro";
import { currentUser, json, readJson } from "../../../lib/server/api";
import { prisma } from "../../../lib/server/db";
import { accountTypeFor } from "../../../lib/server/students";
import { QuoteError, createSchoolQuote } from "../../../lib/server/quotes";
import { checkQuoteRequest } from "../../../lib/quote";

/**
 * School quotes (src/lib/server/quotes.ts).
 *
 * GET  -> the teacher's quotes, newest first
 * POST -> { school, district?, contactName, contactEmail, address, packs?, taxExempt? }
 *         makes and finalizes a quote, and emails the teacher its PDF
 */

const view = (q: Awaited<ReturnType<typeof prisma.quote.findFirstOrThrow>>) => ({
  id: q.id,
  number: q.number,
  school: q.school,
  contactEmail: q.contactEmail,
  packs: q.packs,
  taxExempt: q.taxExempt,
  amountTotal: q.amountTotal,
  status: q.status === "open" && q.expiresAt < new Date() ? "expired" : q.status,
  expiresAt: q.expiresAt.getTime(),
  poNumber: q.poNumber,
  invoiceUrl: q.invoiceUrl,
  createdAt: q.createdAt.getTime(),
});
export type QuoteView = ReturnType<typeof view>;
export { view as quoteView };

export const GET: APIRoute = async ({ request }) => {
  const user = await currentUser(request);
  if (!user) return json({ error: "Sign in first." }, 401);
  const quotes = await prisma.quote.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 20 });
  return json(quotes.map(view));
};

export const POST: APIRoute = async ({ request }) => {
  const user = await currentUser(request);
  if (!user) return json({ error: "Sign in first." }, 401);
  if ((await accountTypeFor(user)) === "student") return json({ error: "Student accounts cannot ask for quotes." }, 403);
  const checked = checkQuoteRequest(await readJson(request));
  if (!checked.ok) return json({ error: checked.error }, 400);
  try {
    return json(view(await createSchoolQuote(user, checked.value)));
  } catch (e) {
    if (e instanceof QuoteError) return json({ error: e.message }, e.status);
    console.error("[quotes] create failed:", e);
    return json({ error: "Stripe could not make the quote. Try again in a minute." }, 502);
  }
};
