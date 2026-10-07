/**
 * A paid plan that will not renew: a school's one-year quote, a card plan
 * with automatic renewal off, or a code's free months. Its holder is told
 * before it ends: an email 30 days and 7 days ahead, and a banner on the
 * account and practice pages for the last 30. Pure rules, tested in
 * tests/unit/plan-ending.test.ts; src/lib/server/plan-ending.ts applies them.
 */

const DAY = 86_400_000;

/** Days before the end that each email goes out, furthest first. */
export const NOTICE_DAYS = [30, 7] as const;
/** The banner shows for this many days before the end. */
export const BANNER_DAYS = 30;

/** How the plan was paid for, which says how it is renewed. */
export type EndingKind = "card" | "quote" | "code";

export type EndingPlan = {
  plan: "pro" | "educator";
  endsAt: Date;
  kind: EndingKind;
  /** The school quote it came from, for a renewal quote filled in from it. */
  quoteId?: string;
};

/** Whole days left, rounded up (a plan ending this evening has 1 day left). */
export const daysLeft = (endsAt: Date, now: Date) => Math.max(0, Math.ceil((endsAt.getTime() - now.getTime()) / DAY));

/**
 * Which email is due now, or null. Once inside a window its email is due
 * unless sent; when both windows have passed unsent (a plan bought with less
 * than a week to run, or the check missing a day), only the nearer one goes,
 * so nobody gets two in a row.
 */
export function noticeDue(endsAt: Date, now: Date, sent: readonly number[]): number | null {
  if (endsAt.getTime() <= now.getTime()) return null;
  const left = (endsAt.getTime() - now.getTime()) / DAY;
  const reached = NOTICE_DAYS.filter((d) => left <= d);
  if (!reached.length) return null;
  const nearest = Math.min(...reached);
  if (sent.some((d) => d <= nearest)) return null;
  return nearest;
}

/** The record that one notice was sent: the plan's term and the window, so a later term notices afresh. */
export const noticeKey = (source: string, endsAt: Date, days: number) => `${source}:${endsAt.toISOString().slice(0, 10)}:${days}`;

/** Whether the banner shows. */
export const bannerShows = (endsAt: Date, now: Date) =>
  endsAt.getTime() > now.getTime() && endsAt.getTime() - now.getTime() <= BANNER_DAYS * DAY;

const planName = (p: EndingPlan["plan"]) => (p === "pro" ? "Pro" : "Educator");
export const endDate = (d: Date) =>
  d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/Chicago" });

/** What renewing means, by how the plan was bought. */
export function renewHow(e: EndingPlan): string {
  if (e.kind === "card") return "Turn automatic renewal back on from your account page, and it carries on for another year.";
  if (e.kind === "quote") return "Ask for a renewal quote from your account page: it is filled in from last year's, ready to send to purchasing.";
  return "Buy a year from your account page to keep it.";
}

/** The email: subject and plain text. */
export function noticeEmail(e: EndingPlan, now: Date, accountUrl: string) {
  const left = daysLeft(e.endsAt, now);
  const what = e.plan === "educator" ? "Educator plan" : "Pro plan";
  return {
    subject: `Your abcSightReading ${planName(e.plan)} plan ends ${endDate(e.endsAt)}`,
    text: [
      `Your ${what} ends on ${endDate(e.endsAt)}, in ${left} day${left === 1 ? "" : "s"}. It does not renew by itself.`,
      "",
      renewHow(e),
      accountUrl,
      "",
      e.plan === "educator"
        ? "If it ends, your classes, students and their practice records are kept, but your students lose Pro and no new student can join until it is renewed."
        : "If it ends, your saved presets are kept; you go back to the free plan's 50 exercises a month.",
      "",
      "abcSightReading",
    ].join("\n"),
  };
}
