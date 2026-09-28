import { prisma } from "./db";
import { serverEnv } from "./env";
import { generationAllowance, monthKey, planFrom, type Plan } from "../plan";

/**
 * Which plan an account is on, from the database. The rules are in
 * src/lib/plan.ts (unit-tested); this gathers what they need: the account's
 * subscriptions, whether it is a student of a teacher on the Educator plan,
 * and whether it is complimentary (COMP_EMAILS, comma-separated).
 *
 * Gate features by calling this, never by reading billing fields directly.
 */

export const complimentary = (email: string | null | undefined) => {
  if (!email) return false;
  const list = (serverEnv("COMP_EMAILS") ?? "").toLowerCase().split(",").map((s) => s.trim());
  return list.includes(email.toLowerCase());
};

const subscriptionsOf = (referenceIds: string[]) =>
  prisma.subscription.findMany({
    where: { referenceId: { in: referenceIds } },
    select: { referenceId: true, plan: true, status: true, periodEnd: true },
  });

const grantsOf = (userId: string) =>
  prisma.accessGrant.findMany({ where: { userId, expiresAt: { gt: new Date() } }, select: { plan: true, expiresAt: true } });

/** The plan of an account without looking at classes it is in: subscriptions, code grants, complimentary. */
async function ownPlan(user: { id: string; email: string }): Promise<Plan> {
  const [subscriptions, grants] = await Promise.all([subscriptionsOf([user.id]), grantsOf(user.id)]);
  return planFrom({ subscriptions, grants, complimentary: complimentary(user.email) });
}

export async function planFor(userId: string): Promise<Plan> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      enrollments: { select: { class: { select: { user: { select: { id: true, email: true } } } } } },
    },
  });
  if (!user) return "free";
  const own = await ownPlan(user);
  if (own !== "free") return own;
  const teachers = new Map(user.enrollments.map((e) => [e.class.user.id, e.class.user]));
  for (const t of teachers.values()) {
    if ((await ownPlan(t)) === "educator") return planFrom({ subscriptions: [], studentOfEducator: true });
  }
  return "free";
}

/** Pro features: the tools wheel, abcTuner, the teacher's own syllables. */
export async function hasPremium(user: { id: string }): Promise<boolean> {
  return (await planFor(user.id)) !== "free";
}

/** Educator features: join codes, rosters, seats. */
export async function hasEducatorPlan(user: { id: string }): Promise<boolean> {
  return (await planFor(user.id)) === "educator";
}

/** This month's allowance, without using any of it. */
export async function generationStatus(userId: string) {
  const plan = await planFor(userId);
  const row = await prisma.generationUsage.findUnique({
    where: { userId_month: { userId, month: monthKey() } },
    select: { count: true },
  });
  return { plan, ...generationAllowance(plan, row?.count ?? 0) };
}

/**
 * Uses one generation, if there is one left. The increment is conditional in
 * the database, so two tabs pressing Generate at once cannot both take the
 * last one. `granted` says whether this one was allowed; the rest is the
 * allowance after it.
 */
export async function claimGeneration(userId: string) {
  const plan = await planFor(userId);
  const month = monthKey();
  const where = { userId_month: { userId, month } };
  await prisma.generationUsage.upsert({ where, create: { userId, month, count: 0 }, update: {} });
  const unlimited = generationAllowance(plan, 0).limit === null;
  const limit = generationAllowance(plan, 0).limit ?? 0;
  const { count: updated } = await prisma.generationUsage.updateMany({
    where: { userId, month, ...(unlimited ? {} : { count: { lt: limit } }) },
    data: { count: { increment: 1 } },
  });
  const row = await prisma.generationUsage.findUnique({ where, select: { count: true } });
  return { granted: updated > 0, plan, ...generationAllowance(plan, row?.count ?? 0) };
}
