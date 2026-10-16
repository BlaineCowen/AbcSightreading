import { prisma } from "./db";
import { serverEnv } from "./env";
import { stripe } from "./stripe";
import { becomeEducator } from "./educator";
import { viaClasslink } from "./classlink";
import { INCLUDED_SEATS } from "../seats";
import { emailKey, isDisposable } from "../free-month";
import { sendAccountEmail } from "./auth-email";
import {
  FOUNDER_DISCOUNT, FOUNDER_SEATS, founderDecision, founderEndsAt, foundersOpen, isSchoolEmail, type FounderApplicationInput,
} from "../founders";

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

/** Whether another account behind the same address (emailKey) has joined. */
async function personJoined(userId: string, email: string) {
  const code = await prisma.accessCode.findUnique({ where: { code: FOUNDER_CODE }, select: { id: true } });
  if (!code) return false;
  const grants = await prisma.accessGrant.findMany({ where: { codeId: code.id, userId: { not: userId } }, select: { user: { select: { email: true } } } });
  const key = emailKey(email);
  return grants.some((g) => emailKey(g.user.email) === key);
}

/**
 * Whether this account may join, and if not the step in the way.
 * `approved`: the owner approved their application, which stands in for a
 * school email, and holds even if the offer closed while it waited.
 */
export async function founderStatus(userId: string | null, opts: { approved?: boolean } = {}) {
  if (!userId) return founderDecision({ open: open(), signedIn: false });
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, emailVerified: true, accountType: true } });
  if (!user) return founderDecision({ open: open(), signedIn: false });
  const classlink = await viaClasslink(userId);
  const application = await prisma.founderApplication.findUnique({ where: { userId }, select: { status: true } });
  return founderDecision({
    open: opts.approved || open(),
    signedIn: true,
    accountType: user.accountType ?? "standard",
    // ClassLink leaves the email unconfirmed (it never links accounts by it),
    // but the district stands behind the teacher who signs in through it.
    emailVerified: !!user.emailVerified || classlink,
    disposable: isDisposable(user.email),
    already: await isFounder(userId),
    personJoined: await personJoined(userId, user.email),
    proven: opts.approved || classlink || isSchoolEmail(user.email),
    application: (application?.status as "pending" | "approved" | "declined" | undefined) ?? null,
  });
}

/** A Pro subscription of theirs that will still renew (and bill) while Educator is free. */
async function renewingPro(userId: string) {
  return !!(await prisma.subscription.findFirst({
    where: { referenceId: userId, plan: "pro", status: { in: ["active", "trialing"] }, cancelAtPeriodEnd: { not: true }, cancelAt: null },
    select: { id: true },
  }));
}

/** Joins: Educator free until the end of May 2027, with FOUNDER_SEATS seats in all. */
export async function joinFounders(userId: string, opts: { approved?: boolean } = {}) {
  const decision = await founderStatus(userId, opts);
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
  return { expiresAt: expiresAt.getTime(), seats: FOUNDER_SEATS, proRenews: await renewingPro(userId) };
}

const SITE = "https://www.abc-sightreading.com";

/** A teacher with a personal email asks to join; the owner is told. */
export async function applyFounders(userId: string, input: FounderApplicationInput) {
  const decision = await founderStatus(userId);
  if (decision.ok || decision.step !== "apply") throw new FounderError(decision.ok ? "You can join straight away." : decision.reason);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true, email: true } });
  try {
    await prisma.founderApplication.create({ data: { userId, ...input } });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") throw new FounderError("We have your application already.");
    throw e;
  }
  const owner = serverEnv("FEEDBACK_TO");
  if (owner) {
    await sendAccountEmail(
      owner,
      `Founding teacher application: ${user.name || user.email}`,
      [
        `${user.name || "(no name)"} <${user.email}> asked to join the founding teachers.`,
        "",
        `School: ${input.school}`,
        `District: ${input.district}`,
        `Teaches: ${input.role}`,
        `Proof: ${input.proofUrl}`,
        ...(input.note ? ["", `Note: ${input.note}`] : []),
        "",
        `Approve or decline: ${SITE}/admin#founders`,
      ].join("\n")
    ).catch((e) => console.error("[founders] could not tell the owner", e));
  }
}

/** Every application, newest first, for /admin. */
export async function listApplications() {
  const rows = await prisma.founderApplication.findMany({
    orderBy: { createdAt: "desc" },
    include: { user: { select: { name: true, email: true } } },
  });
  return rows.map(({ user, ...a }) => ({ ...a, name: user.name, email: user.email, createdAt: a.createdAt.getTime(), decidedAt: a.decidedAt?.getTime() ?? null }));
}

/** The owner's answer. Approving joins them and emails them. */
export async function decideApplication(id: string, approve: boolean) {
  const app = await prisma.founderApplication.findUnique({ where: { id }, include: { user: { select: { email: true, name: true } } } });
  if (!app) throw new FounderError("No such application.", 404);
  if (app.status !== "pending") throw new FounderError(`Already ${app.status}.`);
  let joined: Awaited<ReturnType<typeof joinFounders>> | null = null;
  if (approve) joined = await joinFounders(app.userId, { approved: true });
  await prisma.founderApplication.update({ where: { id }, data: { status: approve ? "approved" : "declined", decidedAt: new Date() } });
  if (joined) {
    await sendAccountEmail(
      app.user.email,
      "You're a founding teacher",
      [
        `Hi${app.user.name ? ` ${app.user.name.split(/\s+/)[0]}` : ""},`,
        "",
        `Welcome aboard. Educator is on for your account until May 31, 2027, free, with ${FOUNDER_SEATS} student accounts, and after that it is ${FOUNDER_DISCOUNT}% off for as long as you renew.`,
        "",
        `Make your first class and bring your students in: ${SITE}/account#students`,
        ...(joined.proRenews
          ? ["", `Your Pro subscription will still renew on its date. Educator includes everything in Pro, so you can turn renewal off: ${SITE}/account#plan`]
          : []),
        "",
        "If anything is missing or wrong, just reply. I read every one.",
        "",
        "Blaine",
        "abcSightReading",
      ].join("\n"),
      undefined,
      { replyTo: serverEnv("FEEDBACK_TO") ?? undefined }
    ).catch((e) => console.error("[founders] could not email the new founder", e));
  }
  return { status: approve ? "approved" : "declined" };
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
