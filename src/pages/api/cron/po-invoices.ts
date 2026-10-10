import type { APIRoute } from "astro";
import { json } from "../../../lib/server/api";
import { serverEnv } from "../../../lib/server/env";
import { reviewPoInvoices } from "../../../lib/server/quotes";
import { reviewEndingPlans } from "../../../lib/server/plan-ending";
import { deleteOldTakes } from "../../../lib/server/attempts";

/**
 * Daily, from Vercel Cron (vercel.json): plans running on a purchase order.
 * A reminder a week before the invoice is due, and the plan ends if it falls
 * due unpaid (reviewPoInvoices). And every plan that will not renew (a
 * one-year quote, a card plan with renewal off, a code's months): an email
 * 30 and 7 days before it ends (reviewEndingPlans). And graded attempts'
 * takes past their 90 days are deleted (deleteOldTakes).
 *
 * With CRON_SECRET set, Vercel sends it as a bearer token and nothing else
 * may run this. Without it the check still only acts on what is really due,
 * so running it early does no harm; set CRON_SECRET all the same.
 */
export const GET: APIRoute = async ({ request }) => {
  const secret = serverEnv("CRON_SECRET");
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return json({ error: "Not allowed." }, 401);
  }
  const site = import.meta.env.SITE ?? "https://www.abc-sightreading.com";
  return json({
    invoices: await reviewPoInvoices(),
    ending: await reviewEndingPlans(new Date(), site.replace(/\/$/, "")),
    takes: await deleteOldTakes(),
  });
};
