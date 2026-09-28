import type { APIRoute } from "astro";
import { currentUser, json, readJson } from "../../../lib/server/api";
import { prisma } from "../../../lib/server/db";
import { hasEducatorPlan } from "../../../lib/server/plan";
import { EDUCATOR_ON_SALE } from "../../../lib/plan";
import { PRICES, SEATS_PER_PACK, stripe, taxReady } from "../../../lib/server/stripe";

/**
 * Buy seat packs: POST { packs } -> { url } of a Stripe checkout. 25 seats a
 * pack, for a year; the webhook (auth.ts, grantSeatPack) adds them once paid.
 */
const MAX_PACKS = 40;

export const POST: APIRoute = async ({ request }) => {
  const user = await currentUser(request);
  if (!user) return json({ error: "Sign in first." }, 401);
  if (!stripe) return json({ error: "Billing is not available here." }, 503);
  if (!EDUCATOR_ON_SALE) return json({ error: "Seat packs are coming soon, with the Educator plan." }, 403);
  if (!(await hasEducatorPlan(user))) return json({ error: "Seat packs are for the Educator plan." }, 403);
  const packs = Number((await readJson(request) as { packs?: unknown } | undefined)?.packs ?? 1);
  if (!Number.isInteger(packs) || packs < 1 || packs > MAX_PACKS) {
    return json({ error: `Choose between 1 and ${MAX_PACKS} packs.` }, 400);
  }

  const [price] = (await stripe.prices.list({ lookup_keys: [PRICES.seatPack], limit: 1 })).data;
  if (!price) return json({ error: "Seat packs are not set up in Stripe." }, 503);

  const row = await prisma.user.findUnique({ where: { id: user.id }, select: { stripeCustomerId: true, email: true, name: true } });
  let customer = row?.stripeCustomerId;
  if (!customer) {
    customer = (await stripe.customers.create({ email: row?.email, name: row?.name, metadata: { userId: user.id } })).id;
    await prisma.user.update({ where: { id: user.id }, data: { stripeCustomerId: customer } });
  }

  const origin = new URL(request.url).origin;
  const metadata = { kind: "seat_pack", userId: user.id, packs: String(packs), seats: String(packs * SEATS_PER_PACK) };
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer,
    customer_update: { address: "auto", name: "auto" },
    line_items: [{ price: price.id, quantity: packs }],
    // We are the seller, not Stripe's Managed Payments (see auth.ts).
    managed_payments: { enabled: false },
    automatic_tax: { enabled: await taxReady() },
    billing_address_collection: "required",
    tax_id_collection: { enabled: true },
    invoice_creation: { enabled: true, invoice_data: { metadata } },
    metadata,
    success_url: `${origin}/account?seats=added#students`,
    cancel_url: `${origin}/account#students`,
  });
  return json({ url: session.url });
};
