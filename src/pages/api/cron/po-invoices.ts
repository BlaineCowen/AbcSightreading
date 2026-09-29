import type { APIRoute } from "astro";
import { json } from "../../../lib/server/api";
import { serverEnv } from "../../../lib/server/env";
import { reviewPoInvoices } from "../../../lib/server/quotes";

/**
 * Daily, from Vercel Cron (vercel.json): plans running on a purchase order.
 * A reminder a week before the invoice is due, and the plan ends if it falls
 * due unpaid (reviewPoInvoices).
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
  return json(await reviewPoInvoices());
};
