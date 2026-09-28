import { auth } from "./auth";
import { prisma } from "./db";
import { formatJoinCode } from "../join-code";
import { INCLUDED_SEATS, seatsTotal, seatsUsed } from "../seats";
import { newJoinCode } from "./educator";
import { hasEducatorPlan } from "./plan";

export { newJoinCode };
import { generatePassword, studentEmail, studentLoginName, usernameFor, type RosterStudent } from "../roster";

/**
 * Educator accounts and their students, against the database. The rules live
 * in src/lib/educator-policy.ts and src/lib/roster.ts (unit-tested); this file
 * applies them.
 */

export type AccountType = "standard" | "educator" | "student";

export const accountTypeOf = (user: { accountType?: unknown }): AccountType =>
  user.accountType === "educator" || user.accountType === "student" ? user.accountType : "standard";

/**
 * The account type from the database, not the session. The session is cached
 * in a signed cookie for five minutes (auth.ts), so right after an upgrade it
 * still says "standard" - and a permission must never ride on a stale copy.
 */
export async function accountTypeFor(user: { id: string }): Promise<AccountType> {
  const row = await prisma.user.findUnique({ where: { id: user.id }, select: { accountType: true } });
  return accountTypeOf(row ?? {});
}

/**
 * Seats: the plan's 100 and any packs still in their year, and how many of the
 * teacher's students use them. Without the Educator plan there are none to
 * give - the students already in a class stay, but no one new joins.
 */
export async function seatInfo(teacherId: string) {
  const [enrollments, grants, educator] = await Promise.all([
    prisma.enrollment.findMany({ where: { class: { userId: teacherId } }, select: { studentId: true } }),
    prisma.seatGrant.findMany({ where: { userId: teacherId }, select: { seats: true, expiresAt: true } }),
    hasEducatorPlan({ id: teacherId }),
  ]);
  const total = educator ? seatsTotal(INCLUDED_SEATS, grants) : 0;
  const used = seatsUsed(enrollments);
  return { total, used, left: Math.max(0, total - used) };
}

/**
 * A student account with no email, as a roster or a class code makes one.
 * Created through Better Auth's own internals, so the password is hashed and
 * the credential account linked exactly as a sign-up would.
 */
export async function createStudentAccount(s: {
  first: string;
  last: string;
  joinCode: string;
  username: string;
  password: string;
}) {
  const ctx = await auth.$context;
  const loginName = studentLoginName(s.joinCode, s.username);
  const user = await ctx.internalAdapter.createUser({
    email: studentEmail(loginName),
    name: s.last ? `${s.first} ${s.last}` : s.first,
    emailVerified: false,
    username: loginName,
    accountType: "student",
  }, { method: "class-roster" });
  await ctx.internalAdapter.linkAccount({
    userId: user.id,
    providerId: "credential",
    accountId: user.id,
    password: await ctx.password.hash(s.password),
  });
  return user;
}

/** The part of a student's sign-in name after the class code: "maria.g". */
export const shortUsername = (loginName: string | null) => (loginName ? loginName.split(".").slice(1).join(".") : null);

/**
 * Add students from a roster to a class: usernames made unique within it,
 * passwords generated where none was given. Answers with the credentials,
 * which are shown once - for printing - and never stored in the clear.
 */
export async function addRoster(teacherId: string, classId: string, students: RosterStudent[]) {
  const cls = await prisma.class.findFirst({ where: { id: classId, userId: teacherId } });
  if (!cls) return { error: "No such class.", status: 404 } as const;
  const joinCode = cls.joinCode ?? (await prisma.class.update({ where: { id: cls.id }, data: { joinCode: await newJoinCode() } })).joinCode!;

  const seats = await seatInfo(teacherId);
  if (students.length > seats.left) {
    return { error: `That is ${students.length} students and ${seats.left} seats are left.`, status: 409 } as const;
  }

  const existing = await prisma.user.findMany({
    where: { username: { startsWith: `${joinCode.toLowerCase()}.` } },
    select: { username: true },
  });
  const taken = new Set(existing.map((u) => shortUsername(u.username)!));
  const created: { name: string; username: string; password: string }[] = [];
  for (const s of students) {
    const username = s.username && !taken.has(s.username) ? s.username : usernameFor(s.first, s.last, taken);
    taken.add(username);
    const password = s.password ?? generatePassword();
    const user = await createStudentAccount({ ...s, joinCode, username, password });
    await prisma.enrollment.create({ data: { classId: cls.id, studentId: user.id, managed: true } });
    created.push({ name: user.name, username, password });
  }
  return { created, joinCode: formatJoinCode(joinCode) } as const;
}
