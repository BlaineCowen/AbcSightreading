import type { APIRoute } from "astro";
import { currentUser, json } from "../../../../../lib/server/api";
import { prisma } from "../../../../../lib/server/db";
import { roleIn } from "../../../../../lib/server/practice";

/**
 * A song in a class's library (ClassPiece). The class's teacher only.
 *
 * DELETE -> takes it out: the class's students can no longer open it.
 *   Its assignments stay, and assigning it again puts it back.
 */
export const DELETE: APIRoute = async ({ request, params }) => {
  const user = await currentUser(request);
  if (!user) return json({ error: "Sign in first." }, 401);
  if ((await roleIn(user.id, params.id!)) !== "teacher") return json({ error: "No such class." }, 404);
  await prisma.classPiece.deleteMany({ where: { classId: params.id!, pieceId: params.pieceId! } });
  return json({ ok: true });
};
