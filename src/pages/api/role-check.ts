import type { APIRoute } from "astro";
import { currentUser, json } from "../../lib/server/api";
import { prisma } from "../../lib/server/db";
import { looksLikeStudent } from "../../lib/student-guess";

/**
 * GET -> { ask, studentFirst }: should WelcomeNote ask "student or teacher?"
 * Students who sign in with a school Google account get an ordinary account
 * that is in no class, so their teacher never sees them (five of S&S CISD's
 * band students, 10 to 12 November 2026). Asked of an ordinary account that is
 * in no class and teaches no one: no class of its own with students, no
 * Educator plan. `studentFirst` is only a guess from the name and address.
 */
export const GET: APIRoute = async ({ request }) => {
  const user = await currentUser(request);
  if (!user) return json({ ask: false });
  const [me, joined, teaching] = await Promise.all([
    prisma.user.findUnique({ where: { id: user.id }, select: { accountType: true, name: true, email: true } }),
    prisma.enrollment.findFirst({ where: { studentId: user.id }, select: { id: true } }),
    prisma.enrollment.findFirst({ where: { class: { userId: user.id } }, select: { id: true } }),
  ]);
  // Educators and students already know; anyone in a class or teaching one is placed.
  if (!me || (me.accountType ?? "standard") !== "standard" || joined || teaching) return json({ ask: false });
  return json({ ask: true, studentFirst: looksLikeStudent(me.name, me.email) });
};
