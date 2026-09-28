import type { APIRoute } from "astro";
import { currentUser, json, readJson } from "../../../../lib/server/api";
import { prisma } from "../../../../lib/server/db";
import { isAdmin } from "../../../../lib/server/admin";
import { stripe } from "../../../../lib/server/stripe";

/**
 * PATCH { paidOut: true }  -> marks everything owed as paid, today
 * PATCH { active: bool }   -> turns the code on or off in Stripe too
 */
export const PATCH: APIRoute = async ({ request, params }) => {
  if (!isAdmin(await currentUser(request))) return json({ error: "Not found." }, 404);
  const a = await prisma.affiliate.findUnique({ where: { id: params.id! } });
  if (!a) return json({ error: "No such affiliate." }, 404);
  const b = ((await readJson(request)) ?? {}) as { paidOut?: unknown; active?: unknown };
  if (b.paidOut === true) {
    await prisma.affiliateSale.updateMany({ where: { affiliateId: a.id, paidOutAt: null }, data: { paidOutAt: new Date() } });
  }
  if (typeof b.active === "boolean") {
    await stripe?.promotionCodes.update(a.stripePromotionId, { active: b.active });
    await prisma.affiliate.update({ where: { id: a.id }, data: { active: b.active } });
  }
  return json({ ok: true });
};
