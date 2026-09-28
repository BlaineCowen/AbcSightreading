import type Stripe from "stripe";
import { prisma } from "./db";
import { stripe } from "./stripe";
import { becomeEducator } from "./educator";
import { checkRedemption, commissionCents, normalizeCode } from "../codes";

/**
 * Access codes and affiliate codes, against the database and Stripe. Rules
 * in src/lib/codes.ts.
 */

export class CodeError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

/** Uses an access code on this account: its plan, for its days, from today. */
export async function redeemAccessCode(userId: string, raw: unknown) {
  const code = await prisma.accessCode.findUnique({ where: { code: normalizeCode(raw) } });
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { accountType: true } });
  const already = code ? await prisma.accessGrant.findFirst({ where: { userId, codeId: code.id }, select: { id: true } }) : null;
  const checked = checkRedemption({ code, accountType: user?.accountType ?? "standard", alreadyRedeemed: !!already });
  if (!checked.ok) throw new CodeError(checked.error);

  // The count goes up only while there is room, so the last use cannot be taken twice.
  const { count } = await prisma.accessCode.updateMany({
    where: { id: code!.id, ...(code!.maxUses !== null ? { uses: { lt: code!.maxUses } } : {}) },
    data: { uses: { increment: 1 } },
  });
  if (!count) throw new CodeError("That code has been used up.");
  const grant = await prisma.accessGrant.create({
    data: { userId, codeId: code!.id, plan: checked.value.plan, expiresAt: checked.value.expiresAt },
  });
  if (grant.plan === "educator") await becomeEducator(userId);
  return { plan: grant.plan, expiresAt: grant.expiresAt.getTime() };
}

/** The latest code-given plan still running, for the account page. */
export const currentGrant = (userId: string) =>
  prisma.accessGrant.findFirst({
    where: { userId, expiresAt: { gt: new Date() } },
    orderBy: { expiresAt: "desc" },
    select: { plan: true, expiresAt: true },
  });

/**
 * An advertiser's code: a Stripe coupon (a percentage off the first payment
 * only) and a promotion code with the name people type.
 */
export async function createAffiliate(a: { name: string; code: string; percentOff: number; commissionPercent: number }) {
  if (!stripe) throw new CodeError("Stripe is not set up here.", 503);
  if (await prisma.affiliate.findUnique({ where: { code: a.code } })) throw new CodeError("That code is taken.");
  const coupon = await stripe.coupons.create({
    percent_off: a.percentOff,
    duration: "once",
    name: `${a.code} - ${a.percentOff}% off the first year`,
    metadata: { kind: "affiliate", affiliate: a.name },
  });
  const promotion = await stripe.promotionCodes.create({
    promotion: { type: "coupon", coupon: coupon.id },
    code: a.code,
    metadata: { kind: "affiliate", affiliate: a.name },
  });
  return prisma.affiliate.create({
    data: { ...a, stripeCouponId: coupon.id, stripePromotionId: promotion.id },
  });
}

/**
 * A paid checkout that used an affiliate's code: records the advertiser's
 * share. Called from the Stripe webhook for every completed checkout; does
 * nothing for one without an affiliate code.
 */
export async function recordAffiliateSale(event: Stripe.Checkout.Session) {
  if (!stripe || event.payment_status !== "paid") return;
  const session = await stripe.checkout.sessions.retrieve(event.id, { expand: ["total_details.breakdown"] });
  const promotionIds = (session.total_details?.breakdown?.discounts ?? [])
    .map((d) => d.discount.promotion_code)
    .map((p) => (typeof p === "string" ? p : p?.id))
    .filter((p): p is string => !!p);
  if (!promotionIds.length) return;
  const affiliate = await prisma.affiliate.findFirst({ where: { stripePromotionId: { in: promotionIds } } });
  if (!affiliate) return;
  const amountTax = session.total_details?.amount_tax ?? 0;
  const amountTotal = session.amount_total ?? 0;
  await prisma.affiliateSale.upsert({
    where: { stripeCheckoutId: session.id },
    create: {
      affiliateId: affiliate.id,
      stripeCheckoutId: session.id,
      amountPaid: Math.max(0, amountTotal - amountTax),
      commission: commissionCents({ amountTotal, amountTax, percent: affiliate.commissionPercent }),
      description: session.mode === "subscription" ? "Plan, first year" : "Seat pack",
    },
    update: {},
  });
}

/** Every affiliate with what they have earned, and what is still owed. */
export async function affiliateReport() {
  const affiliates = await prisma.affiliate.findMany({
    orderBy: { createdAt: "asc" },
    include: { sales: { orderBy: { createdAt: "desc" } } },
  });
  return affiliates.map((a) => ({
    id: a.id,
    name: a.name,
    code: a.code,
    percentOff: a.percentOff,
    commissionPercent: a.commissionPercent,
    active: a.active,
    sales: a.sales.map((s) => ({
      id: s.id,
      amountPaid: s.amountPaid,
      commission: s.commission,
      description: s.description,
      createdAt: s.createdAt.getTime(),
      paidOutAt: s.paidOutAt?.getTime() ?? null,
    })),
    earned: a.sales.reduce((t, s) => t + s.commission, 0),
    owed: a.sales.filter((s) => !s.paidOutAt).reduce((t, s) => t + s.commission, 0),
  }));
}
