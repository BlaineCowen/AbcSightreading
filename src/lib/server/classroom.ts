import { auth } from "./auth";
import { prisma } from "./db";
import { newJoinCode } from "./educator";
import { createStudentAccount, seatInfo, shortUsername } from "./students";
import { generatePassword, usernameFor } from "../roster";
import {
  courseFrom,
  courseOf,
  hasClassroomScopes,
  planSync,
  rosterSourceFor,
  studentFrom,
  type ClassroomCourse,
  type ClassroomStudent,
} from "../classroom";

/**
 * Google Classroom against the database and Google's API (rules in
 * src/lib/classroom.ts). The teacher's Google token comes from Better Auth,
 * which refreshes it when it has run out.
 */

const API = "https://classroom.googleapis.com/v1";

export class ClassroomError extends Error {
  constructor(message: string, readonly status = 400, readonly reconnect = false) {
    super(message);
  }
}

/** A working token for the teacher's Google account, or why there is none. */
async function tokenFor(userId: string, headers: Headers): Promise<string> {
  const account = await prisma.account.findFirst({ where: { userId, providerId: "google" }, select: { id: true, scope: true } });
  if (!account || !hasClassroomScopes(account.scope)) throw new ClassroomError("Connect Google Classroom first.", 409, true);
  try {
    const { accessToken } = await auth.api.getAccessToken({ body: { accountId: account.id, userId }, headers });
    if (!accessToken) throw new Error("no token");
    return accessToken;
  } catch {
    throw new ClassroomError("Google needs you to connect again.", 409, true);
  }
}

async function get<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401 || res.status === 403) throw new ClassroomError("Google Classroom did not let us read that. Connect again, and allow both permissions.", 409, true);
  if (res.status === 404) throw new ClassroomError("That Google Classroom class was not found.", 404);
  if (!res.ok) throw new ClassroomError("Google Classroom is not answering. Try again in a minute.", 502);
  return (await res.json()) as T;
}

/** Every page of a list. */
async function all<T>(token: string, path: string, key: string): Promise<T[]> {
  const out: T[] = [];
  let page = "";
  for (let n = 0; n < 20; n++) {
    const sep = path.includes("?") ? "&" : "?";
    const data = await get<Record<string, unknown>>(token, `${path}${sep}pageSize=100${page ? `&pageToken=${encodeURIComponent(page)}` : ""}`);
    out.push(...(((data[key] as T[] | undefined) ?? []) as T[]));
    page = (data.nextPageToken as string | undefined) ?? "";
    if (!page) break;
  }
  return out;
}

/** The classes the teacher teaches in Classroom, active ones only. */
export async function listCourses(userId: string, headers: Headers): Promise<ClassroomCourse[]> {
  const token = await tokenFor(userId, headers);
  const raw = await all<unknown>(token, "/courses?teacherId=me&courseStates=ACTIVE", "courses");
  return raw.map(courseFrom).filter((c): c is ClassroomCourse => !!c);
}

async function rosterOf(token: string, courseId: string): Promise<ClassroomStudent[]> {
  const raw = await all<unknown>(token, `/courses/${encodeURIComponent(courseId)}/students`, "students");
  return raw.map(studentFrom).filter((s): s is ClassroomStudent => !!s);
}

export type SyncResult = {
  added: string[];
  present: number;
  gone: string[];
  courseName: string;
};

/**
 * Brings a Classroom class's students into one of the teacher's classes:
 * makes accounts for new ones (linked to their Google accounts, so they sign
 * in with Google), adds students who already have one, and names any who have
 * left Classroom without removing them.
 */
export async function syncClass(teacherId: string, classId: string, courseId: string | null, headers: Headers): Promise<SyncResult> {
  const cls = await prisma.class.findFirst({ where: { id: classId, userId: teacherId } });
  if (!cls) throw new ClassroomError("No such class.", 404);
  const course = courseId ?? courseOf(cls.rosterSource);
  if (!course) throw new ClassroomError("Choose a Google Classroom class.");
  const token = await tokenFor(teacherId, headers);
  const courseName = courseFrom(await get<unknown>(token, `/courses/${encodeURIComponent(course)}`))?.name ?? "Google Classroom";
  const roster = await rosterOf(token, course);

  const linkedRows = await prisma.account.findMany({
    where: { providerId: "google", accountId: { in: roster.map((s) => s.googleId) } },
    select: { accountId: true, userId: true, user: { select: { accountType: true } } },
  });
  const linked = new Map(linkedRows.map((a) => [a.accountId, { userId: a.userId, accountType: a.user.accountType }]));
  const enrollments = await prisma.enrollment.findMany({
    where: { classId },
    select: { studentId: true, student: { select: { name: true, accounts: { where: { providerId: "google" }, select: { accountId: true } } } } },
  });
  const plan = planSync(
    roster,
    linked,
    enrollments.map((e) => ({ userId: e.studentId, name: e.student.name, googleId: e.student.accounts[0]?.accountId ?? null }))
  );

  const seats = await seatInfo(teacherId);
  const needed = plan.create.length + plan.enroll.length;
  if (needed > seats.left) {
    throw new ClassroomError(`That class has ${needed} students to add and ${seats.left} seats are left.`, 409);
  }

  const joinCode = cls.joinCode ?? (await prisma.class.update({ where: { id: cls.id }, data: { joinCode: await newJoinCode() } })).joinCode!;
  const existing = await prisma.user.findMany({ where: { username: { startsWith: `${joinCode.toLowerCase()}.` } }, select: { username: true } });
  const taken = new Set(existing.map((u) => shortUsername(u.username)!));
  const ctx = await auth.$context;
  const added: string[] = [];
  for (const s of plan.create) {
    const username = usernameFor(s.first, s.last, taken);
    taken.add(username);
    // A password they never need (they sign in with Google), so the teacher can still print a card.
    const user = await createStudentAccount({ first: s.first, last: s.last, joinCode, username, password: generatePassword() });
    await ctx.internalAdapter.linkAccount({ userId: user.id, providerId: "google", accountId: s.googleId });
    await prisma.enrollment.create({ data: { classId, studentId: user.id, managed: true } });
    added.push(s.name);
  }
  for (const { student, userId } of plan.enroll) {
    await prisma.enrollment.upsert({
      where: { classId_studentId: { classId, studentId: userId } },
      create: { classId, studentId: userId, managed: false },
      update: {},
    });
    added.push(student.name);
  }
  await prisma.class.update({ where: { id: classId }, data: { rosterSource: rosterSourceFor(course), rosterSyncedAt: new Date() } });
  return { added, present: plan.present, gone: plan.gone.map((g) => g.name), courseName };
}
