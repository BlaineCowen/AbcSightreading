import { prisma } from "./db";
import { sendAccountEmail } from "./auth-email";
import { complimentary } from "./plan";
import { NOTICE_DAYS, bannerShows, noticeDue, noticeEmail, noticeKey, type EndingPlan } from "../plan-ending";

/**
 * Plans that will not renew, and the notices before they end (rules in
 * src/lib/plan-ending.ts): a subscription set to end at its period's end (a
 * school's one-year quote, or a card plan with automatic renewal turned off)
 * and a code's free months. A plan is only "ending" when nothing else keeps
 * the account on that plan or a better one afterwards: a teacher whose
 * one-year quote has been followed by a renewal quote gets no warning.
 */

const DAY = 86_400_000;
const LIVE = ["active", "trialing", "past_due"];
const rank = (p: string) => (p === "educator" ? 2 : p === "pro" ? 1 : 0);

type Candidate = EndingPlan & { userId: string; source: string };

async function candidates(now: Date, userId?: string): Promise<Candidate[]> {
  const until = new Date(now.getTime() + (Math.max(...NOTICE_DAYS) + 1) * DAY);
  const [subs, grants] = await Promise.all([
    prisma.subscription.findMany({
      where: { status: { in: LIVE }, cancelAtPeriodEnd: true, periodEnd: { gt: now, lte: until }, ...(userId ? { referenceId: userId } : {}) },
      select: { id: true, referenceId: true, plan: true, periodEnd: true },
    }),
    prisma.accessGrant.findMany({
      where: { expiresAt: { gt: now, lte: until }, ...(userId ? { userId } : {}) },
      select: { id: true, userId: true, plan: true, expiresAt: true },
    }),
  ]);
  const found: Candidate[] = [
    ...subs.map((s) => ({
      userId: s.referenceId,
      source: `sub:${s.id}`,
      plan: (s.plan === "educator" ? "educator" : "pro") as EndingPlan["plan"],
      endsAt: s.periodEnd!,
      kind: (s.id.startsWith("quote_") ? "quote" : "card") as EndingPlan["kind"],
      ...(s.id.startsWith("quote_") ? { quoteId: s.id.slice("quote_".length) } : {}),
    })),
    ...grants.map((g) => ({
      userId: g.userId,
      source: `grant:${g.id}`,
      plan: (g.plan === "educator" ? "educator" : "pro") as EndingPlan["plan"],
      endsAt: g.expiresAt,
      kind: "code" as const,
    })),
  ];
  // Keep only what really ends: nothing else carries the account on at that plan or better.
  const out: Candidate[] = [];
  for (const c of found) {
    const user = await prisma.user.findUnique({ where: { id: c.userId }, select: { email: true, accountType: true } });
    if (!user || user.accountType === "student" || complimentary(user.email)) continue;
    const after = new Date(c.endsAt.getTime() + DAY);
    const [carriedSub, carriedGrant] = await Promise.all([
      prisma.subscription.findFirst({
        where: {
          referenceId: c.userId,
          status: { in: LIVE },
          plan: { in: c.plan === "educator" ? ["educator"] : ["pro", "educator"] },
          OR: [{ cancelAtPeriodEnd: false, NOT: { id: c.source.replace(/^sub:/, "") } }, { periodEnd: { gt: after } }],
        },
        select: { id: true },
      }),
      prisma.accessGrant.findFirst({
        where: { userId: c.userId, expiresAt: { gt: after }, plan: { in: c.plan === "educator" ? ["educator"] : ["pro", "educator"] } },
        select: { id: true },
      }),
    ]);
    if (carriedSub || carriedGrant) continue;
    out.push(c);
  }
  // One plan per account: the one that ends first, at the highest plan.
  const byUser = new Map<string, Candidate>();
  for (const c of out.sort((a, b) => rank(b.plan) - rank(a.plan) || a.endsAt.getTime() - b.endsAt.getTime())) {
    if (!byUser.has(c.userId)) byUser.set(c.userId, c);
  }
  return [...byUser.values()];
}

/** The plan this account should be warned about now (the banner), or null. */
export async function endingPlanFor(userId: string, now = new Date()): Promise<EndingPlan | null> {
  const c = (await candidates(now, userId)).find((x) => bannerShows(x.endsAt, now));
  if (!c) return null;
  const { userId: _u, source: _s, ...plan } = c;
  return plan;
}

/**
 * The daily check (the cron in /api/cron/po-invoices): each plan ending
 * within 30 days gets its 30-day and 7-day emails, once each. A school's
 * goes to the teacher with the purchasing contacts copied, who renew it.
 */
export async function reviewEndingPlans(now = new Date(), siteUrl = "https://www.abc-sightreading.com") {
  const done = { ending: 0, emailed: 0 };
  const list = await candidates(now);
  done.ending = list.length;
  for (const c of list) {
    const prefix = noticeKey(c.source, c.endsAt, 0).replace(/0$/, "");
    const sent = (await prisma.planNotice.findMany({ where: { key: { startsWith: prefix } }, select: { key: true } })).map((n) =>
      Number(n.key.slice(prefix.length)),
    );
    const due = noticeDue(c.endsAt, now, sent);
    if (due === null) continue;
    const user = await prisma.user.findUnique({ where: { id: c.userId }, select: { email: true } });
    if (!user) continue;
    const quote = c.quoteId ? await prisma.quote.findUnique({ where: { id: c.quoteId }, select: { sendTo: true } }) : null;
    const { subject, text } = noticeEmail(c, now, `${siteUrl}/account#plan`);
    try {
      // Recorded first, so a failure after sending can never send it twice.
      await prisma.planNotice.create({ data: { userId: c.userId, key: noticeKey(c.source, c.endsAt, due) } });
      const purchasing = (quote?.sendTo ?? "").split(/[,;\s]+/).filter(Boolean);
      await sendAccountEmail(user.email, subject, text, undefined, purchasing.length ? { cc: purchasing } : undefined);
      done.emailed++;
    } catch (e) {
      console.error("[plan-ending] could not send a notice:", e);
    }
  }
  return done;
}
