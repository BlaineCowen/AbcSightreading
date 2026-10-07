import type { APIRoute } from "astro";
import { currentUser, json } from "../../../lib/server/api";
import { prisma } from "../../../lib/server/db";
import { stripe } from "../../../lib/server/stripe";

/**
 * Automatic renewal of a card plan, on or off: POST { renew: boolean }.
 * Off, the plan runs to the end of the year it is paid for and nobody is
 * charged again; the teacher is told before it ends (plan-ending.ts), and can
 * turn it back on any time before then. A school's plan is renewed by a new
 * quote instead, so only a card subscription is changed here.
 */
export const POST: APIRoute = async ({ request }) => {
  const user = await currentUser(request);
  if (!user) return json({ error: "Sign in first." }, 401);
  if (!stripe) return json({ error: "Billing is not set up here." }, 503);
  const body = await request.json().catch(() => null);
  if (typeof body?.renew !== "boolean") return json({ error: "Say whether it should renew." }, 400);
  const sub = await prisma.subscription.findFirst({
    where: {
      referenceId: user.id,
      status: { in: ["active", "trialing", "past_due"] },
      stripeSubscriptionId: { not: null },
      NOT: { id: { startsWith: "quote_" } },
    },
    orderBy: { periodEnd: "desc" },
    select: { id: true, stripeSubscriptionId: true },
  });
  if (!sub) return json({ error: "No card plan to change." }, 404);
  const updated = await stripe.subscriptions.update(sub.stripeSubscriptionId!, { cancel_at_period_end: !body.renew });
  await prisma.subscription.update({ where: { id: sub.id }, data: { cancelAtPeriodEnd: updated.cancel_at_period_end } });
  return json({ ok: true, renews: !updated.cancel_at_period_end });
};
