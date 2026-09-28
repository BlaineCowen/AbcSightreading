import type { APIRoute } from "astro";
import { currentUser, json, readJson } from "../../../../../lib/server/api";
import { prisma } from "../../../../../lib/server/db";
import { auth } from "../../../../../lib/server/auth";
import { canManageStudent, removalFor } from "../../../../../lib/educator-policy";
import { generatePassword } from "../../../../../lib/roster";
import { shortUsername } from "../../../../../lib/server/students";

/**
 * One student in one of the teacher's classes.
 *
 * POST { action: "reset-password" } -> { username, password }: a new password
 *   for an account the teacher made, and everyone signed out of it.
 * DELETE -> removes the student from the class; an account the teacher made,
 *   in no other class, is deleted with its data.
 */

async function find(
  request: Request,
  classId: string,
  studentId: string
): Promise<
  | { ok: false; res: Response }
  | { ok: true; teacherId: string; enrollmentId: string; managed: boolean; username: string | null }
> {
  const user = await currentUser(request);
  if (!user) return { ok: false, res: json({ error: "Sign in first." }, 401) };
  const e = await prisma.enrollment.findFirst({
    where: { classId, studentId, class: { userId: user.id } },
    select: { id: true, managed: true, student: { select: { username: true } } },
  });
  if (!e) return { ok: false, res: json({ error: "No such student in that class." }, 404) };
  return { ok: true, teacherId: user.id, enrollmentId: e.id, managed: e.managed, username: e.student.username };
}

export const POST: APIRoute = async ({ request, params }) => {
  const found = await find(request, params.id!, params.studentId!);
  if (!found.ok) return found.res;
  const body = (await readJson(request)) as { action?: unknown } | undefined;
  if (body?.action !== "reset-password") return json({ error: "Unknown action." }, 400);
  if (!canManageStudent(found.teacherId, { teacherId: found.teacherId, managed: found.managed })) {
    return json({ error: "This student manages their own account." }, 403);
  }
  const ctx = await auth.$context;
  const password = generatePassword();
  await ctx.internalAdapter.updatePassword(params.studentId!, await ctx.password.hash(password));
  await ctx.internalAdapter.deleteUserSessions(params.studentId!);
  return json({ username: shortUsername(found.username), password });
};

export const DELETE: APIRoute = async ({ request, params }) => {
  const found = await find(request, params.id!, params.studentId!);
  if (!found.ok) return found.res;
  const others = await prisma.enrollment.count({ where: { studentId: params.studentId!, id: { not: found.enrollmentId } } });
  if (removalFor({ managed: found.managed, otherEnrollments: others }) === "delete-account") {
    // Cascades take the enrollment, sessions, presets and preferences with it.
    await prisma.user.delete({ where: { id: params.studentId! } });
    return json({ removed: "account" });
  }
  await prisma.enrollment.delete({ where: { id: found.enrollmentId } });
  return json({ removed: "from-class" });
};
