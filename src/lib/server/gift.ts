/**
 * A month of Pro given by hand, and the note that says so (Blaine, 8 October
 * 2026: the free month was an offer to claim, and the accounts made before it
 * never had - "can we give them pro also? and give them a message that they
 * were upgraded?"). `scripts/gift-pro.ts` gives it; the account then sees
 * UpgradeNotice once, on /account or a practice page, until dismissed.
 *
 * It is the free month itself, not a second kind of grant: an AccessGrant
 * with no code (so planFor reads it and plan-ending.ts warns in its last
 * week), and a FreeMonthClaim, so the offer is not shown to them again. The
 * note is a PlanNotice keyed `gift:<grant id>`; dismissing it adds
 * `gift-seen:<grant id>`.
 */
import { prisma } from "./db";
import { FREE_MONTH_DAYS, emailKey } from "../free-month";

export async function giftPro(userId: string, now = new Date()) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
  const expiresAt = new Date(now.getTime() + FREE_MONTH_DAYS * 86_400_000);
  return prisma.$transaction(async (tx) => {
    const grant = await tx.accessGrant.create({ data: { userId, plan: "pro", expiresAt } });
    await tx.freeMonthClaim.upsert({
      where: { userId },
      create: { userId, emailKey: emailKey(user.email), networkKey: "gift", expiresAt },
      update: {},
    });
    await tx.planNotice.create({ data: { userId, key: `gift:${grant.id}` } });
    return grant;
  });
}

/** The gift this account has not yet been told about, if any. */
export async function pendingGift(userId: string): Promise<{ grantId: string; until: number; plan: string } | null> {
  const notices = await prisma.planNotice.findMany({ where: { userId, key: { startsWith: "gift" } }, select: { key: true } });
  const seen = new Set(notices.filter((n) => n.key.startsWith("gift-seen:")).map((n) => n.key.slice("gift-seen:".length)));
  const open = notices.map((n) => n.key).filter((k) => k.startsWith("gift:")).map((k) => k.slice("gift:".length)).find((id) => !seen.has(id));
  if (!open) return null;
  const grant = await prisma.accessGrant.findFirst({ where: { id: open, userId } });
  if (!grant || grant.expiresAt.getTime() < Date.now()) return null;
  return { grantId: grant.id, until: grant.expiresAt.getTime(), plan: grant.plan };
}

export async function dismissGift(userId: string, grantId: string) {
  await prisma.planNotice.upsert({ where: { key: `gift-seen:${grantId}` }, create: { userId, key: `gift-seen:${grantId}` }, update: {} });
}
