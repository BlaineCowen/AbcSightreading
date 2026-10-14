import type { APIRoute } from "astro";
import { currentUser, json } from "../../../../../lib/server/api";
import { prisma } from "../../../../../lib/server/db";
import { roleIn } from "../../../../../lib/server/practice";
import { pieceFor } from "../../../../../lib/server/pieces";

/**
 * A song in a class's library (ClassPiece). The class's teacher only.
 *
 * POST   -> puts one of the teacher's own pieces in it, without assigning it:
 *   the class's students open it whole, any part, any time (and its practice
 *   mixes, when the piece offers them).
 * DELETE -> takes it out: the class's students can no longer open it.
 *   Its assignments stay, and assigning it again puts it back.
 */
export const POST: APIRoute = async ({ request, params }) => {
  const user = await currentUser(request);
  if (!user) return json({ error: "Sign in first." }, 401);
  if ((await roleIn(user.id, params.id!)) !== "teacher") return json({ error: "No such class." }, 404);
  if (!(await pieceFor(user.id, params.pieceId!))) return json({ error: "No such piece." }, 404);
  await prisma.classPiece.upsert({
    where: { classId_pieceId: { classId: params.id!, pieceId: params.pieceId! } },
    create: { classId: params.id!, pieceId: params.pieceId! },
    update: {},
  });
  return json({ ok: true });
};

export const DELETE: APIRoute = async ({ request, params }) => {
  const user = await currentUser(request);
  if (!user) return json({ error: "Sign in first." }, 401);
  if ((await roleIn(user.id, params.id!)) !== "teacher") return json({ error: "No such class." }, 404);
  await prisma.classPiece.deleteMany({ where: { classId: params.id!, pieceId: params.pieceId! } });
  return json({ ok: true });
};
