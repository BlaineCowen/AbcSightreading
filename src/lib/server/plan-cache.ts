import { AsyncLocalStorage } from "node:async_hooks";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Plan } from "../plan";
import { isConnectionError } from "./db-errors";
import { serverEnv } from "./env";

/**
 * The plan, remembered (12 November 2026: "why not just have a state that says
 * this person is a pro user"). Working it out takes three to five queries
 * (the account, its subscriptions and grants, a student's teachers), and every
 * page that gates a feature asked again: /tuner showed an error page twice in
 * an evening when that lookup met a dead database connection.
 *
 * Two layers, both consulted by planFor (plan.ts):
 *   - a signed cookie, `sr_plan`: the signed-in account's plan and when it was
 *     worked out, good for FRESH_MS (paid) or FREE_MS (free: so an upgrade, a
 *     redeemed code or joining a class shows within a minute everywhere);
 *   - this instance's memory, MEMORY_MS, which also joins the several lookups
 *     a page makes at once as it opens into one.
 * When a lookup fails on a dead connection, the last plan known (a cookie up to
 * STALE_MS old, or memory) is used instead of an error page.
 *
 * A request that can change the plan (PLAN_CHANGES: checkout, codes, the free
 * month, joining a class...) skips both, and clears the cookie, so it always
 * sees and leaves the plan as the database has it. When Pro ends, access can
 * outlast it by up to FRESH_MS; Blaine accepted that.
 *
 * The cookie is signed with BETTER_AUTH_SECRET and names the account, so it
 * cannot be edited into Pro or used by another account on the same Chromebook.
 */
export const COOKIE = "sr_plan";
const FRESH_MS = 10 * 60_000;
const FREE_MS = 60_000;
const MEMORY_MS = 30_000;
const STALE_MS = 24 * 60 * 60_000;

/** What the middleware knows about this request (see src/middleware.ts). */
type Store = {
  /** The cookie as sent, if its signature is good. */
  cookie?: { userId: string; plan: Plan; at: number };
  /** The signed-in account (set by currentUser), the only one a cookie is written for. */
  userId?: string;
  /** A plan worked out from the database during this request. */
  fresh?: { userId: string; plan: Plan; at: number };
  /** A request that may change the plan: no caching either way. */
  bypass: boolean;
  /** Answers shared by everything in this request (requestMemo). */
  memo?: Map<string, Promise<unknown>>;
};
const als = new AsyncLocalStorage<Store>();

const PLANS: Plan[] = ["free", "pro", "educator"];

/** Requests that can change someone's plan. */
const PLAN_CHANGES = [
  "/api/billing",
  "/api/codes",
  "/api/free-month",
  "/api/gift",
  "/api/founders",
  "/api/join",
  "/api/educator",
  "/api/quotes",
  "/api/auth/subscription",
  "/api/auth/stripe",
];
export function changesPlan(method: string, url: URL): boolean {
  if (url.searchParams.has("upgraded") || url.searchParams.has("seats")) return true; // back from checkout
  if (method === "GET" || method === "HEAD") return false;
  return PLAN_CHANGES.some((p) => url.pathname === p || url.pathname.startsWith(p + "/"));
}

function secret(): string | undefined {
  return serverEnv("BETTER_AUTH_SECRET");
}
const sign = (body: string, key: string) => createHmac("sha256", key).update(body).digest("base64url");

export function encode(v: { userId: string; plan: Plan; at: number }, key = secret()): string | null {
  if (!key) return null;
  const body = `${v.userId}.${v.plan}.${v.at}`;
  return `${body}.${sign(body, key)}`;
}

export function decode(raw: string | undefined, key = secret()): Store["cookie"] {
  if (!raw || !key) return undefined;
  const parts = decodeURIComponent(raw).split(".");
  if (parts.length < 4) return undefined;
  const sig = parts.pop()!;
  const at = Number(parts.pop());
  const plan = parts.pop() as Plan;
  const userId = parts.join(".");
  const want = Buffer.from(sign(`${userId}.${plan}.${at}`, key));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return undefined;
  if (!PLANS.includes(plan) || !Number.isFinite(at)) return undefined;
  return { userId, plan, at };
}

const readCookie = (header: string | null) =>
  header?.split(/;\s*/).find((c) => c.startsWith(COOKIE + "="))?.slice(COOKIE.length + 1);

/** Runs a request with its plan cookie read; returns the Set-Cookie to add, if any. */
export async function withPlanCache(request: Request, url: URL, run: () => Promise<Response>): Promise<{ response: Response; setCookie?: string }> {
  const store: Store = { cookie: decode(readCookie(request.headers.get("cookie"))), bypass: changesPlan(request.method, url) };
  const response = await als.run(store, run);
  const secure = url.protocol === "https:" ? "; Secure" : "";
  if (store.bypass) {
    // The plan may have just changed: forget it here too, not only in the cookie.
    for (const id of [store.userId, store.cookie?.userId]) if (id) memory.delete(id);
    if (store.cookie) return { response, setCookie: `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure}` };
    return { response };
  }
  const f = store.fresh;
  if (!f || f.userId !== store.userId) return { response };
  if (store.cookie && store.cookie.userId === f.userId && store.cookie.plan === f.plan && store.cookie.at === f.at) return { response };
  const value = encode(f);
  if (!value) return { response };
  return { response, setCookie: `${COOKIE}=${value}; Path=/; Max-Age=${STALE_MS / 1000}; HttpOnly; SameSite=Lax${secure}` };
}

/**
 * One answer per request for `key`: /api/batch runs several routes inside one
 * request, and each asks who is signed in; they share the first ask.
 * Outside a request it just calls `make`.
 */
export function requestMemo<T>(key: string, make: () => Promise<T>): Promise<T> {
  const s = als.getStore();
  if (!s) return make();
  s.memo ??= new Map();
  let p = s.memo.get(key) as Promise<T> | undefined;
  if (!p) {
    p = make();
    s.memo.set(key, p);
    p.catch(() => s.memo?.delete(key));
  }
  return p;
}

/** currentUser calls this: the cookie is only ever written for the signed-in account. */
export function noteSignedIn(userId: string | undefined) {
  const s = als.getStore();
  if (s && userId) s.userId = userId;
}

const memory = new Map<string, { plan: Plan; at: number }>();
const pending = new Map<string, Promise<Plan>>();

/** The plan for `userId`, from the cookie or memory while fresh, else `lookup()`. */
export async function cachedPlan(userId: string, lookup: () => Promise<Plan>): Promise<Plan> {
  const s = als.getStore();
  const now = Date.now();
  const bypass = s?.bypass ?? false;
  const cookie = s?.cookie?.userId === userId ? s.cookie : undefined;
  if (!bypass) {
    if (s?.fresh?.userId === userId) return s.fresh.plan;
    if (cookie && now - cookie.at < (cookie.plan === "free" ? FREE_MS : FRESH_MS)) return cookie.plan;
    const m = memory.get(userId);
    if (m && now - m.at < MEMORY_MS) return m.plan;
  }
  try {
    let p = bypass ? undefined : pending.get(userId);
    if (!p) {
      p = lookup().finally(() => pending.delete(userId));
      if (!bypass) pending.set(userId, p);
    }
    const plan = await p;
    const at = Date.now();
    if (bypass) memory.delete(userId);
    else {
      memory.set(userId, { plan, at });
      if (memory.size > 5000) memory.delete(memory.keys().next().value!);
      if (s) s.fresh = { userId, plan, at };
    }
    return plan;
  } catch (e) {
    if (!isConnectionError(e)) throw e;
    const known = cookie && now - cookie.at < STALE_MS ? cookie : memory.get(userId);
    if (!known) throw e;
    console.warn(`plan: database unreachable, using the plan known from ${new Date(known.at).toISOString()}`);
    return known.plan;
  }
}
