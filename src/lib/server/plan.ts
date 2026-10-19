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
  const list = [...emailList("COMP_EMAILS"), ...previewOwners()];
  return list.includes(email.toLowerCase());
};

const emailList = (name: string) =>
  (serverEnv(name) ?? "").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);

/**
 * Outside production (the dev site, previews, a local server) the owner
 * (ADMIN_EMAILS / ADMIN_EMAIL) is always on Educator, so Pro features can be
 * tried there with the real account. Nobody else: the dev site is public. To
 * see what a free or Pro account sees, use a throwaway account.
 */
function previewOwners(): string[] {
  if (serverEnv("VERCEL_ENV") === "production") return [];
  return [...emailList("ADMIN_EMAILS"), ...emailList("ADMIN_EMAIL")];
}

const subscriptionsOf = (referenceIds: string[]) =>
  prisma.subscription.findMany({
    where: { referenceId: { in: referenceIds } },
    select: { referenceId: true, plan: true, status: true, periodEnd: true },
  });

const grantsOf = (userId: string) =>
  prisma.accessGrant.findMany({ where: { userId, expiresAt: { gt: new Date() } }, select: { plan: true, expiresAt: true } });

export async function planFor(userId: string): Promise<Plan> {
  // The account and its own subscriptions and grants need only the id, so
  // they are asked for together: one round trip, not three in a row. Every
  // practice page asks for the plan several times as it opens (usage,
  // billing, tracks, the free month).
  const [user, subscriptions, grants] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        enrollments: { select: { class: { select: { user: { select: { id: true, email: true } } } } } },
      },
    }),
    subscriptionsOf([userId]),
    grantsOf(userId),
  ]);
  if (!user) return "free";
  const own = planFrom({ subscriptions, grants, complimentary: complimentary(user.email) });
  if (own !== "free") return own;
  // A student of an educator: every teacher at once, in two queries.
  const teachers = [...new Map(user.enrollments.map((e) => [e.class.user.id, e.class.user])).values()];
  if (!teachers.length) return "free";
  const [teacherSubs, teacherGrants] = await Promise.all([
    subscriptionsOf(teachers.map((t) => t.id)),
    prisma.accessGrant.findMany({
      where: { userId: { in: teachers.map((t) => t.id) }, expiresAt: { gt: new Date() } },
      select: { userId: true, plan: true, expiresAt: true },
    }),
  ]);
  for (const t of teachers) {
    const plan = planFrom({
      subscriptions: teacherSubs.filter((s) => s.referenceId === t.id),
      grants: teacherGrants.filter((g) => g.userId === t.id),
      complimentary: complimentary(t.email),
    });
    if (plan === "educator") return planFrom({ subscriptions: [], studentOfEducator: true });
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
  const [plan, row] = await Promise.all([
    planFor(userId),
    prisma.generationUsage.findUnique({
      where: { userId_month: { userId, month: monthKey() } },
      select: { count: true },
    }),
  ]);
  return { plan, ...generationAllowance(plan, row?.count ?? 0) };
}

/**
 * Uses one generation, if there is one left. The increment is conditional in
 * the database, so two tabs pressing Generate at once cannot both take the
 * last one. `granted` says whether this one was allowed; the rest is the
 * allowance after it.
 */
export async function claimGeneration(userId: string) {
  const month = monthKey();
  const where = { userId_month: { userId, month } };
  const [plan] = await Promise.all([
    planFor(userId),
    prisma.generationUsage.upsert({ where, create: { userId, month, count: 0 }, update: {} }),
  ]);
  const unlimited = generationAllowance(plan, 0).limit === null;
  const limit = generationAllowance(plan, 0).limit ?? 0;
  const { count: updated } = await prisma.generationUsage.updateMany({
    where: { userId, month, ...(unlimited ? {} : { count: { lt: limit } }) },
    data: { count: { increment: 1 } },
  });
  const row = await prisma.generationUsage.findUnique({ where, select: { count: true } });
  return { granted: updated > 0, plan, ...generationAllowance(plan, row?.count ?? 0) };
}
