import type { APIRoute } from "astro";
import { currentUser, json } from "../../../../lib/server/api";
import { prisma } from "../../../../lib/server/db";
import { stripe } from "../../../../lib/server/stripe";

/**
 * A renewal quote, filled in from this one: the plan, seat packs and tax
 * exemption from our record, the school's name, district, contact and address
 * from the Stripe customer the first quote made (createSchoolQuote: its name
 * is the district, or the school without one). Only for the teacher who
 * asked for the first; the form can still change anything before it is sent.
 */
export const GET: APIRoute = async ({ request, params }) => {
  const user = await currentUser(request);
  if (!user) return json({ error: "Sign in first." }, 401);
  const row = await prisma.quote.findFirst({ where: { id: params.id, userId: user.id } });
  if (!row) return json({ error: "No such quote." }, 404);
  const customer = stripe ? await stripe.customers.retrieve(row.stripeCustomerId).catch(() => null) : null;
  const c = customer && !("deleted" in customer && customer.deleted) ? (customer as import("stripe").Stripe.Customer) : null;
  return json({
    plan: row.plan === "pro" ? "pro" : "educator",
    school: row.school,
    district: c?.name && c.name !== row.school ? c.name : "",
    contactName: c?.metadata?.contactName ?? "",
    sendTo: row.sendTo ? row.sendTo.split(",") : [row.contactEmail],
    address: {
      line1: c?.address?.line1 ?? "",
      line2: c?.address?.line2 ?? "",
      city: c?.address?.city ?? "",
      state: c?.address?.state ?? "TX",
      postalCode: c?.address?.postal_code ?? "",
    },
    packs: row.packs,
    taxExempt: row.taxExempt,
    renews: false,
  });
};
