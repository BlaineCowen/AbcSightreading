/**
 * Plans and the monthly exercise allowance. Pure rules, shared by the server
 * (which decides) and the page (which says how many are left); tested in
 * tests/unit/billing.test.ts.
 *
 * - No account: GENERATION_LIMITS.anonymous a month, counted in the browser.
 *   A soft limit - clearing storage resets it - meant as a nudge to make a
 *   free account, not a lock.
 * - A free account: GENERATION_LIMITS.free a month, counted on the server.
 * - Pro and Educator (yearly, through Stripe): unlimited. A student in a
 *   paying teacher's class has Pro through the class.
 */

export type Plan = "free" | "pro" | "educator";
export type Tier = "anonymous" | Plan;

export const GENERATION_LIMITS = { anonymous: 10, free: 50 } as const;

/** The subscription fields the plan depends on (Better Auth's Stripe plugin's table). */
export type SubscriptionLike = { plan: string; status: string; periodEnd?: Date | null };

/**
 * `past_due` keeps the plan: Stripe retries a failed renewal for a while, and
 * a choir should not lose its tools mid-rehearsal over a card that expired.
 * When the retries run out Stripe cancels the subscription and it ends there.
 */
const LIVE = new Set(["active", "trialing", "past_due"]);

const isLive = (s: SubscriptionLike, now: Date) =>
  LIVE.has(s.status) && (s.status === "past_due" || !s.periodEnd || s.periodEnd > now);

export function planFrom(p: {
  subscriptions: SubscriptionLike[];
  studentOfEducator?: boolean;
  complimentary?: boolean;
  now?: Date;
}): Plan {
  const now = p.now ?? new Date();
  if (p.complimentary) return "educator";
  const live = p.subscriptions.filter((s) => isLive(s, now));
  if (live.some((s) => s.plan === "educator")) return "educator";
  if (live.some((s) => s.plan === "pro")) return "pro";
  return p.studentOfEducator ? "pro" : "free";
}

export type Allowance = { limit: number | null; used: number; remaining: number | null; allowed: boolean };

export function generationAllowance(tier: Tier, used: number): Allowance {
  if (tier === "pro" || tier === "educator") return { limit: null, used, remaining: null, allowed: true };
  const limit = GENERATION_LIMITS[tier];
  const remaining = Math.max(0, limit - used);
  return { limit, used, remaining, allowed: remaining > 0 };
}

/** "2026-09": the month a count belongs to, in UTC so server and browser agree. */
export const monthKey = (d = new Date()) => d.toISOString().slice(0, 7);

type StorageLike = { getItem(k: string): string | null; setItem(k: string, v: string): void };
const ANON_KEY = "abcsr_generations";

export function anonymousUsage(storage: StorageLike, now = new Date()): number {
  try {
    const saved = JSON.parse(storage.getItem(ANON_KEY) ?? "null");
    return saved?.month === monthKey(now) && Number.isInteger(saved.count) ? saved.count : 0;
  } catch {
    return 0;
  }
}

export function recordAnonymousGeneration(storage: StorageLike, now = new Date()): number {
  const count = anonymousUsage(storage, now) + 1;
  try {
    storage.setItem(ANON_KEY, JSON.stringify({ month: monthKey(now), count }));
  } catch {}
  return count;
}
