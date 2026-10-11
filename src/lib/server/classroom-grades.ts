import { prisma } from "./db";
import { API, ClassroomError, all, tokenFor } from "./classroom";
import { classAssignments } from "./practice";
import { courseOf, courseWorkFor, gradePatches, hasGradeScope } from "../classroom";
import { gradeOf } from "../gradebook";
import { ASSIGNMENT_PARAM, assignmentPath } from "../practice";

/**
 * An assignment in Google Classroom (rules in src/lib/classroom.ts): posted
 * as coursework in the class its roster came from, then its grades sent as
 * draft grades, which the teacher returns in Classroom. Classroom lets an app
 * grade only coursework it made itself, so a link the teacher shared by hand
 * cannot be graded; this posts it.
 */

const ASK = "Allow abcSightReading to post assignments and grades in Google Classroom.";

async function send<T>(token: string, method: "POST" | "PATCH", path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 401) throw new ClassroomError(ASK, 409, true);
  if (res.status === 403) {
    const why = await res.text().catch(() => "");
    if (/insufficient|scope/i.test(why)) throw new ClassroomError(ASK, 409, true);
    throw new ClassroomError("Google Classroom did not allow that. Are you a teacher of that Classroom class?", 403);
  }
  if (res.status === 404) throw new ClassroomError("That Google Classroom class or assignment is gone.", 404);
  if (!res.ok) throw new ClassroomError("Google Classroom is not answering. Try again in a minute.", 502);
  return (await res.json()) as T;
}

async function teacherAssignment(teacherId: string, assignmentId: string) {
  const a = await prisma.assignment.findUnique({ where: { id: assignmentId }, include: { class: { select: { userId: true, rosterSource: true } } } });
  if (!a || a.class.userId !== teacherId) throw new ClassroomError("No such assignment.", 404);
  const course = courseOf(a.class.rosterSource);
  if (!course) throw new ClassroomError("Bring this class in from Google Classroom first.", 409);
  return { a, course };
}

/** Posts the assignment to the class's Classroom class, once. */
export async function postToClassroom(teacherId: string, assignmentId: string, origin: string, headers: Headers) {
  const { a, course } = await teacherAssignment(teacherId, assignmentId);
  if (a.classroomWorkId) return { classroomWorkId: a.classroomWorkId };
  const token = await tokenFor(teacherId, headers, hasGradeScope, ASK);
  const url = `${origin}${assignmentPath(a)}?${ASSIGNMENT_PARAM}=${encodeURIComponent(a.id)}`;
  const work = await send<{ id: string }>(token, "POST", `/courses/${encodeURIComponent(course)}/courseWork`, courseWorkFor({ ...a, dueAt: a.dueAt?.getTime() ?? null }, url));
  await prisma.assignment.update({ where: { id: a.id }, data: { classroomWorkId: work.id } });
  return { classroomWorkId: work.id };
}

/**
 * Sends every student's grade (the gradebook's: best attempt, or minutes)
 * to Classroom as a draft grade. Returns how many were sent and who has no
 * grade yet.
 */
export async function sendGrades(teacherId: string, assignmentId: string, headers: Headers) {
  const { a, course } = await teacherAssignment(teacherId, assignmentId);
  if (!a.classroomWorkId) throw new ClassroomError("Post it to Google Classroom first.", 409);
  const token = await tokenFor(teacherId, headers, hasGradeScope, ASK);

  const book = await classAssignments(a.classId);
  const row = book.assignments.find((x) => x.id === a.id);
  if (!row) throw new ClassroomError("No such assignment.", 404);
  const google = await prisma.account.findMany({
    where: { providerId: "google", userId: { in: book.students.map((s) => s.id) } },
    select: { userId: true, accountId: true },
  });
  const googleOf = new Map(google.map((g) => [g.userId, g.accountId]));
  const grades = new Map<string, number | null>();
  for (const p of row.progress) {
    const id = googleOf.get(p.studentId);
    if (id) grades.set(id, gradeOf(row, p).grade);
  }

  const path = `/courses/${encodeURIComponent(course)}/courseWork/${encodeURIComponent(a.classroomWorkId)}/studentSubmissions`;
  const subs = await all<{ id: string; userId: string; draftGrade?: number }>(token, path, "studentSubmissions").catch(async (e) => {
    // Deleted in Classroom: forget it, so it can be posted again.
    if (e instanceof ClassroomError && e.status === 404) {
      await prisma.assignment.update({ where: { id: a.id }, data: { classroomWorkId: null, gradesSentAt: null } });
      throw new ClassroomError("That assignment was deleted in Google Classroom. Post it again.", 404);
    }
    throw e;
  });
  const patches = gradePatches(subs, grades);
  for (const p of patches) {
    await send(token, "PATCH", `${path}/${encodeURIComponent(p.id)}?updateMask=draftGrade`, { draftGrade: p.draftGrade });
  }
  await prisma.assignment.update({ where: { id: a.id }, data: { gradesSentAt: new Date() } });
  const ungraded = [...grades.values()].filter((g) => g === null).length;
  return { sent: patches.length, ungraded, notLinked: book.students.length - googleOf.size };
}
