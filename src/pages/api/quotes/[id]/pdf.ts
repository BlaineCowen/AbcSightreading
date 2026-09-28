import type { APIRoute } from "astro";
import { currentUser, json } from "../../../../lib/server/api";
import { prisma } from "../../../../lib/server/db";
import { quotePdf } from "../../../../lib/server/quotes";

/** The quote's PDF, as Stripe renders it. Only for the teacher who asked for it. */
export const GET: APIRoute = async ({ request, params }) => {
  const user = await currentUser(request);
  if (!user) return json({ error: "Sign in first." }, 401);
  const row = await prisma.quote.findFirst({ where: { id: params.id, userId: user.id } });
  if (!row) return json({ error: "No such quote." }, 404);
  const pdf = await quotePdf(row.stripeQuoteId);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${row.number ?? "quote"}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
};
