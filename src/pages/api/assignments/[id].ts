import type { APIRoute } from "astro";
import { currentUser, json } from "../../../lib/server/api";
import { prisma } from "../../../lib/server/db";
import { openAssignment, roleIn } from "../../../lib/server/practice";
import { deleteTakes } from "../../../lib/server/attempts";

/**
 * GET    -> the assignment, to open on a practice page (its teacher or a student in the class)
 * DELETE -> remove it (its teacher). The time students spent stays in their log;
 *           a piece's graded attempts and their takes go with it.
 */
export const GET: APIRoute = async ({ request, params }) => {
  const user = await currentUser(request);
  if (!user) return json({ error: "Sign in first." }, 401);
  const a = await openAssignment(user.id, params.id!);
  return a ? json(a) : json({ error: "No such assignment." }, 404);
};

export const DELETE: APIRoute = async ({ request, params }) => {
  const user = await currentUser(request);
  if (!user) return json({ error: "Sign in first." }, 401);
  const a = await prisma.assignment.findUnique({ where: { id: params.id! }, select: { classId: true } });
  if (!a || (await roleIn(user.id, a.classId)) !== "teacher") return json({ error: "No such assignment." }, 404);
  await deleteTakes(params.id!);
  await prisma.assignment.delete({ where: { id: params.id! } });
  return json({ ok: true });
};
