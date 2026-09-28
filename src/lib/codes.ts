/**
 * Access codes and affiliate codes: the rules, tested in
 * tests/unit/codes.test.ts.
 *
 * An access code (AccessCode) gives a plan free for a number of days - the
 * beta testers' Educator year. No card, no Stripe. An affiliate code is a
 * Stripe promotion code whose metadata names the advertiser; its audience
 * gets a discount at checkout, and the advertiser earns a share of what that
 * checkout paid (AffiliateSale, src/lib/server/codes.ts).
 */

type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

/** "beta-2026 " -> "BETA2026": letters and digits, upper case. */
export const normalizeCode = (v: unknown) => (typeof v === "string" ? v.toUpperCase().replace(/[^A-Z0-9]/g, "") : "");

export type GrantPlan = "pro" | "educator";
const PLANS = new Set(["pro", "educator"]);

export type CodeRow = { plan: string; days: number; maxUses: number | null; uses: number; expiresAt: Date | null };

export function checkRedemption(p: {
  code: CodeRow | null;
  accountType: string;
  alreadyRedeemed: boolean;
  now?: Date;
}): Checked<{ plan: GrantPlan; expiresAt: Date }> {
  const now = p.now ?? new Date();
  if (!p.code) return { ok: false, error: "That code doesn't exist. Check the spelling." };
  if (p.accountType === "student") return { ok: false, error: "Codes are for teachers' accounts; your class gives you what you need." };
  if (p.code.expiresAt && p.code.expiresAt < now) return { ok: false, error: "That code has expired." };
  if (p.code.maxUses !== null && p.code.uses >= p.code.maxUses) return { ok: false, error: "That code has been used up." };
  if (p.alreadyRedeemed) return { ok: false, error: "You've already used that code." };
  return { ok: true, value: { plan: p.code.plan as GrantPlan, expiresAt: new Date(now.getTime() + p.code.days * 86_400_000) } };
}

const CODE = /^[A-Z0-9]{4,24}$/;

export function checkNewAccessCode(body: unknown): Checked<{
  code: string; plan: GrantPlan; days: number; maxUses: number | null; expiresAt: Date | null; note: string;
}> {
  if (typeof body !== "object" || body === null) return { ok: false, error: "Expected a code." };
  const b = body as Record<string, unknown>;
  const code = normalizeCode(b.code);
  if (!CODE.test(code)) return { ok: false, error: "Codes are 4 to 24 letters and digits." };
  if (!PLANS.has(b.plan as string)) return { ok: false, error: "Plan: pro or educator." };
  const days = Number(b.days);
  if (!Number.isInteger(days) || days < 1 || days > 730) return { ok: false, error: "Days: 1 to 730." };
  const maxUses = b.maxUses === undefined || b.maxUses === null || b.maxUses === "" ? null : Number(b.maxUses);
  if (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 1)) return { ok: false, error: "Uses: a whole number, or blank for no limit." };
  let expiresAt: Date | null = null;
  if (typeof b.expiresAt === "string" && b.expiresAt) {
    expiresAt = new Date(`${b.expiresAt}T23:59:59Z`);
    if (!Number.isFinite(expiresAt.getTime())) return { ok: false, error: "That end date is not a date." };
  }
  const note = typeof b.note === "string" ? b.note.trim().slice(0, 200) : "";
  return { ok: true, value: { code, plan: b.plan as GrantPlan, days, maxUses, expiresAt, note } };
}

export function checkNewAffiliate(body: unknown): Checked<{ name: string; code: string; percentOff: number; commissionPercent: number }> {
  if (typeof body !== "object" || body === null) return { ok: false, error: "Expected an affiliate." };
  const b = body as Record<string, unknown>;
  const name = typeof b.name === "string" ? b.name.trim().slice(0, 100) : "";
  if (!name) return { ok: false, error: "Who is the code for?" };
  const code = normalizeCode(b.code);
  if (!CODE.test(code)) return { ok: false, error: "Codes are 4 to 24 letters and digits." };
  const percentOff = Number(b.percentOff);
  if (!Number.isInteger(percentOff) || percentOff < 1 || percentOff > 50) return { ok: false, error: "Discount: 1 to 50 percent." };
  const commissionPercent = Number(b.commissionPercent);
  if (!Number.isInteger(commissionPercent) || commissionPercent < 0 || commissionPercent > 50) {
    return { ok: false, error: "Their cut: 0 to 50 percent." };
  }
  return { ok: true, value: { name, code, percentOff, commissionPercent } };
}

/** The advertiser's share of a paid checkout: a percentage of what was paid, tax left out, in cents. */
export const commissionCents = (p: { amountTotal: number; amountTax: number; percent: number }) =>
  Math.round((Math.max(0, p.amountTotal - p.amountTax) * p.percent) / 100);
