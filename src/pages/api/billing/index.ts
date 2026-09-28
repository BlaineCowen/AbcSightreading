import type { APIRoute } from "astro";
import { currentUser, json } from "../../../lib/server/api";
import { prisma } from "../../../lib/server/db";
import { billingEnabled } from "../../../lib/server/auth";
import { complimentary, planFor } from "../../../lib/server/plan";
import { currentGrant } from "../../../lib/server/codes";

/**
 * The account's plan and the subscription behind it, for the account page.
 *
 * GET -> { plan, via, billingEnabled, subscription: { id, plan, status,
 *          periodEnd, cancelAtPeriodEnd } | null }
 *
 * `via` says where a paid plan comes from: "subscription", "code" (with
 * `grantEnds`), "complimentary" or "class"; null on the free plan.
 *
 * `plan` can be Pro or Educator with no subscription of the account's own: a
 * student in a paying teacher's class, or a complimentary account.
 */
export const GET: APIRoute = async ({ request }) => {
  const user = await currentUser(request);
  if (!user) return json({ error: "Sign in first." }, 401);
  const subscription = await prisma.subscription.findFirst({
    where: { referenceId: user.id, status: { in: ["active", "trialing", "past_due"] } },
    orderBy: { periodEnd: "desc" },
    select: { stripeSubscriptionId: true, plan: true, status: true, periodEnd: true, cancelAtPeriodEnd: true },
  });
  const plan = await planFor(user.id);
  const grant = await currentGrant(user.id);
  const via =
    plan === "free" ? null
    : subscription ? "subscription"
    : grant ? "code"
    : complimentary(user.email) ? "complimentary"
    : "class";
  return json({
    plan,
    via,
    grantEnds: grant?.expiresAt.getTime() ?? null,
    billingEnabled,
    subscription: subscription
      ? {
          id: subscription.stripeSubscriptionId,
          plan: subscription.plan,
          status: subscription.status,
          periodEnd: subscription.periodEnd?.getTime() ?? null,
          cancelAtPeriodEnd: !!subscription.cancelAtPeriodEnd,
        }
      : null,
  });
};
