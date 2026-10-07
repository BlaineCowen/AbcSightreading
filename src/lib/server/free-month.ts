import { createHash, randomBytes } from "node:crypto";
import { prisma } from "./db";
import { serverEnv } from "./env";
import { complimentary, planFor } from "./plan";
import { FREE_MONTH_DAYS, emailKey, freeMonthDecision } from "../free-month";

/**
 * The free month of Pro against the database (rules in src/lib/free-month.ts).
 * Claimed, it is an AccessGrant with no code (the same way a code gives a
 * plan, so planFor reads it and plan-ending.ts warns before it ends) and a
 * FreeMonthClaim row that keeps it once per person.
 */

/** The browser's own mark: a cookie set when the month is claimed, so a second account in the same browser is seen. */
export const BROWSER_COOKIE = "abc_fm";

const salt = () => serverEnv("BETTER_AUTH_SECRET") ?? "abc-free-month";
const hash = (kind: string, value: string) => createHash("sha256").update(`${salt()}:${kind}:${value}`).digest("hex");

/** The network the request came from, as Vercel sees it (a client cannot set x-vercel-forwarded-for). */
function networkOf(request: Request, clientAddress?: string) {
  const forwarded = request.headers.get("x-vercel-forwarded-for") ?? request.headers.get("x-forwarded-for") ?? "";
  return forwarded.split(",")[0].trim() || clientAddress || "unknown";
}

function browserOf(request: Request, sentId?: unknown) {
  const cookie = (request.headers.get("cookie") ?? "").split(/;\s*/).find((c) => c.startsWith(`${BROWSER_COOKIE}=`))?.split("=")[1];
  const id = typeof sentId === "string" && /^[a-z0-9-]{8,64}$/i.test(sentId) ? sentId : null;
  return { cookie: cookie || null, id };
}

/**
 * The offer is on unless FREE_MONTH_ENABLED=0, and until FREE_MONTH_UNTIL
 * (an ISO date, e.g. 2026-12-31) if that is set: "for a limited time" ends
 * by itself on the day.
 */
export function enabled(now = new Date()) {
  if (serverEnv("FREE_MONTH_ENABLED") === "0") return false;
  const until = serverEnv("FREE_MONTH_UNTIL");
  if (until && !Number.isNaN(Date.parse(until)) && now.getTime() > Date.parse(until) + 86_400_000) return false;
  return true;
}

/** The last day of the offer, when one is set (for "until December 31"). */
export const offerUntil = () => {
  const until = serverEnv("FREE_MONTH_UNTIL");
  return until && !Number.isNaN(Date.parse(until)) ? Date.parse(until) : null;
};

async function check(userId: string, request: Request, clientAddress?: string, browserId?: unknown) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, emailVerified: true, accountType: true } });
  if (!user) return { decision: freeMonthDecision({ signedIn: false } as never), user: null };
  const [subs, grants, plan] = await Promise.all([
    prisma.subscription.count({ where: { referenceId: userId } }),
    prisma.accessGrant.count({ where: { userId } }),
    planFor(userId),
  ]);
  const key = emailKey(user.email);
  const network = hash("net", networkOf(request, clientAddress));
  const browser = browserOf(request, browserId);
  const browserKeys = [browser.cookie, browser.id].filter((x): x is string => !!x).map((b) => hash("browser", b));
  const since = new Date(Date.now() - FREE_MONTH_DAYS * 86_400_000);
  const [keyUsed, browserUsed, networkClaims] = await Promise.all([
    prisma.freeMonthClaim.count({ where: { OR: [{ emailKey: key }, { userId }] } }),
    browserKeys.length ? prisma.freeMonthClaim.count({ where: { browserKey: { in: browserKeys } } }) : Promise.resolve(0),
    prisma.freeMonthClaim.count({ where: { networkKey: network, createdAt: { gt: since } } }),
  ]);
  const decision = freeMonthDecision({
    enabled: enabled(),
    signedIn: true,
    accountType: user.accountType ?? "standard",
    emailVerified: !!user.emailVerified,
    email: user.email,
    hadPro: subs > 0 || grants > 0 || complimentary(user.email) || plan !== "free",
    emailKeyUsed: keyUsed > 0,
    browserUsed: browserUsed > 0,
    networkClaims,
  });
  return { decision, user, key, network, browserKeys };
}

/** Whether this account may claim the month now, for the account page. */
export async function freeMonthStatus(userId: string, request: Request, clientAddress?: string) {
  return (await check(userId, request, clientAddress)).decision;
}

export class FreeMonthError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

/**
 * Claim it: checked again on the server, then the claim and the grant written
 * together. The unique email key and account make a second claim fail even
 * when two arrive at once. Returns the grant and a fresh browser mark to set.
 */
export async function claimFreeMonth(userId: string, request: Request, clientAddress?: string, browserId?: unknown) {
  const c = await check(userId, request, clientAddress, browserId);
  if (!c.decision.ok) throw new FreeMonthError(c.decision.reason, 403);
  // The browser keeps one mark, in its cookie and its storage alike: the one it sent, or a new one.
  const browser = browserOf(request, browserId);
  const mark = browser.cookie ?? browser.id ?? randomBytes(16).toString("hex");
  const expiresAt = new Date(Date.now() + FREE_MONTH_DAYS * 86_400_000);
  try {
    await prisma.$transaction([
      prisma.freeMonthClaim.create({
        data: { userId, emailKey: c.key!, browserKey: hash("browser", mark), networkKey: c.network!, expiresAt },
      }),
      prisma.accessGrant.create({ data: { userId, plan: "pro", expiresAt } }),
    ]);
  } catch {
    throw new FreeMonthError("The free month has already been used.", 409);
  }
  return { plan: "pro" as const, expiresAt: expiresAt.getTime(), mark };
}
