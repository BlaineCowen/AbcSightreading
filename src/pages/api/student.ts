import type { APIRoute } from "astro";
import { currentUser, json } from "../../lib/server/api";
import { prisma } from "../../lib/server/db";
import { shortUsername } from "../../lib/server/students";

/** GET -> the classes this account is in, and its username if it has one. */
export const GET: APIRoute = async ({ request }) => {
  const user = await currentUser(request);
  if (!user) return json({ error: "Sign in first." }, 401);
  const rows = await prisma.enrollment.findMany({
    where: { studentId: user.id },
    select: { class: { select: { name: true, user: { select: { name: true } } } } },
  });
  const me = await prisma.user.findUnique({ where: { id: user.id }, select: { username: true } });
  return json({
    username: shortUsername(me?.username ?? null),
    classes: rows.map((r) => ({ name: r.class.name, teacher: r.class.user.name })),
  });
};
