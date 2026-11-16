import { prisma } from "./db";
import { auth } from "./auth";
import { newJoinCode } from "./educator";
import { createStudentAccount, seatInfo, shortUsername } from "./students";
import { generatePassword, usernameFor } from "../roster";
import { planSync } from "../classroom";
import { ONEROSTER_PROVIDER, rosterSourceFor, type OneRosterClass } from "../oneroster";

/**
 * One class from a OneRoster file into one of the teacher's classes (rules
 * and parsing in src/lib/oneroster.ts). It works as the Google Classroom sync
 * does, with the same planSync: students new to the site get an account, made
 * here with a username and password for a login card; students who already
 * have one (from an earlier import, in any class) are added; students who have
 * left the roster are named, never removed.
 *
 * A student's account remembers its roster id in an `account` row,
 * providerId "oneroster" and accountId the key (school/sourcedId). Nobody signs
 * in through that row: it is only how the next import finds them.
 */
export class OneRosterError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export type OneRosterSyncResult = {
  className: string;
  joinCode: string;
  /** New accounts, with the password for their card (shown once). */
  created: { name: string; username: string; password: string }[];
  /** Students who had an account already and were added to this class. */
  enrolled: string[];
  present: number;
  gone: string[];
};

export async function syncOneRosterClass(teacherId: string, classId: string, roster: OneRosterClass): Promise<OneRosterSyncResult> {
  const cls = await prisma.class.findFirst({ where: { id: classId, userId: teacherId } });
  if (!cls) throw new OneRosterError("No such class.", 404);

  // planSync names its key googleId; here it is the roster key.
  const students = roster.students.map((s) => ({ googleId: s.key, first: s.first, last: s.last, name: s.name }));
  const linkedRows = await prisma.account.findMany({
    where: { providerId: ONEROSTER_PROVIDER, accountId: { in: students.map((s) => s.googleId) } },
    select: { accountId: true, userId: true, user: { select: { accountType: true } } },
  });
  const linked = new Map(linkedRows.map((a) => [a.accountId, { userId: a.userId, accountType: a.user.accountType }]));
  const enrollments = await prisma.enrollment.findMany({
    where: { classId },
    select: { studentId: true, student: { select: { name: true, accounts: { where: { providerId: ONEROSTER_PROVIDER }, select: { accountId: true } } } } },
  });
  const plan = planSync(
    students,
    linked,
    enrollments.map((e) => ({ userId: e.studentId, name: e.student.name, googleId: e.student.accounts[0]?.accountId ?? null }))
  );

  const seats = await seatInfo(teacherId);
  const needed = plan.create.length + plan.enroll.length;
  if (needed > seats.left) throw new OneRosterError(`${cls.name} has ${needed} students to add and ${seats.left} seats are left.`, 409);

  const joinCode = cls.joinCode ?? (await prisma.class.update({ where: { id: cls.id }, data: { joinCode: await newJoinCode() } })).joinCode!;
  const existing = await prisma.user.findMany({ where: { username: { startsWith: `${joinCode.toLowerCase()}.` } }, select: { username: true } });
  const taken = new Set(existing.map((u) => shortUsername(u.username)!));
  const ctx = await auth.$context;
  const created: OneRosterSyncResult["created"] = [];
  for (const s of plan.create) {
    const username = usernameFor(s.first, s.last, taken);
    taken.add(username);
    const password = generatePassword();
    const user = await createStudentAccount({ first: s.first, last: s.last, joinCode, username, password });
    await ctx.internalAdapter.linkAccount({ userId: user.id, providerId: ONEROSTER_PROVIDER, accountId: s.googleId });
    await prisma.enrollment.create({ data: { classId, studentId: user.id, managed: true } });
    created.push({ name: s.name, username, password });
  }
  const enrolled: string[] = [];
  for (const { student, userId } of plan.enroll) {
    await prisma.enrollment.upsert({
      where: { classId_studentId: { classId, studentId: userId } },
      create: { classId, studentId: userId, managed: false },
      update: {},
    });
    enrolled.push(student.name);
  }
  await prisma.class.update({ where: { id: classId }, data: { rosterSource: rosterSourceFor(roster.key), rosterSyncedAt: new Date() } });
  return { className: cls.name, joinCode, created, enrolled, present: plan.present, gone: plan.gone.map((g) => g.name) };
}
