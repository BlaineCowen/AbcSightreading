import { prisma } from "./db";
import { serverEnv } from "./env";
import { stripe } from "./stripe";
import { becomeEducator } from "./educator";
import { INCLUDED_SEATS } from "../seats";
import { isDisposable } from "../free-month";
import { FOUNDER_DISCOUNT, FOUNDER_SEATS, founderDecision, founderEndsAt, foundersOpen } from "../founders";

/**
 * Founding teachers against the database (rules in src/lib/founders.ts).
 * Joining is an AccessGrant of Educator under the FOUNDER_CODE access code,
 * the way a code gives a plan (planFor reads it, plan-ending.ts warns before
 * it ends), and a SeatGrant for the seats past the plan's own, both ending
 * with the free time. The grant under that code is what marks a founder, so
 * the discount at checkout needs no table of its own. The code itself has
 * no uses (maxUses 0), so typing it on /account gives nothing.
 */

export const FOUNDER_CODE = "FOUNDINGTEACHERS";
/** The Stripe coupon founders get on Educator: 50% off, forever (so every renewal). */
export const FOUNDER_COUPON = "founding_teacher_50";

export class FounderError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export const open = () => foundersOpen(serverEnv("FOUNDERS_CLOSE"), serverEnv("FOUNDERS_ENABLED"));

const founderCode = () =>
  prisma.accessCode.upsert({
    where: { code: FOUNDER_CODE },
    update: {},
    create: {
      code: FOUNDER_CODE,
      plan: "educator",
      days: 0,
      maxUses: 0,
      note: "Founding teachers (/founders): Educator free through 31 May 2027 with 300 seats, then 50% off. Joined on the page, never typed.",
    },
  });

/** Whether this account joined as a founding teacher. */
export async function isFounder(userId: string) {
  const code = await prisma.accessCode.findUnique({ where: { code: FOUNDER_CODE }, select: { id: true } });
  if (!code) return false;
  return !!(await prisma.accessGrant.findFirst({ where: { userId, codeId: code.id }, select: { id: true } }));
}

export async function founderStatus(userId: string | null) {
  if (!userId) return founderDecision({ open: open(), signedIn: false });
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, emailVerified: true, accountType: true } });
  if (!user) return founderDecision({ open: open(), signedIn: false });
  return founderDecision({
    open: open(),
    signedIn: true,
    accountType: user.accountType ?? "standard",
    emailVerified: !!user.emailVerified,
    disposable: isDisposable(user.email),
    already: await isFounder(userId),
  });
}

/** Joins: Educator free until the end of May 2027, with FOUNDER_SEATS seats in all. */
export async function joinFounders(userId: string) {
  const decision = await founderStatus(userId);
  if (!decision.ok) throw new FounderError(decision.reason, decision.step === "sign-in" ? 401 : 400);
  const code = await founderCode();
  const expiresAt = founderEndsAt();
  try {
    await prisma.$transaction([
      prisma.accessGrant.create({ data: { userId, codeId: code.id, plan: "educator", expiresAt } }),
      prisma.seatGrant.create({ data: { userId, seats: FOUNDER_SEATS - INCLUDED_SEATS, expiresAt } }),
    ]);
  } catch (e) {
    // Two clicks at once: the unique (userId, codeId) lets only one through.
    if ((e as { code?: string }).code === "P2002") throw new FounderError("You're a founding teacher.");
    throw e;
  }
  await becomeEducator(userId);
  return { expiresAt: expiresAt.getTime(), seats: FOUNDER_SEATS };
}

/** How many have joined, for the page. */
export async function founderCount() {
  const code = await prisma.accessCode.findUnique({ where: { code: FOUNDER_CODE }, select: { id: true } });
  return code ? prisma.accessGrant.count({ where: { codeId: code.id } }) : 0;
}

/**
 * The founders' coupon, made in Stripe the first time it is needed (the same
 * id in the sandbox and live accounts). Null without billing.
 */
export async function founderCoupon(): Promise<string | null> {
  if (!stripe) return null;
  try {
    return (await stripe.coupons.retrieve(FOUNDER_COUPON)).id;
  } catch {
    const c = await stripe.coupons.create({ id: FOUNDER_COUPON, percent_off: FOUNDER_DISCOUNT, duration: "forever", name: "Founding teacher" });
    return c.id;
  }
}
