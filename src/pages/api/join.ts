import type { APIRoute } from "astro";
import { currentUser, json, readJson } from "../../lib/server/api";
import { prisma } from "../../lib/server/db";
import { auth } from "../../lib/server/auth";
import { checkJoinRequest } from "../../lib/educator-policy";
import { studentLoginName } from "../../lib/roster";
import { accountTypeFor, createStudentAccount, seatInfo } from "../../lib/server/students";

/**
 * Join a class with its code.
 *
 * Signed in: { code } adds this account to the class as it is.
 * Signed out: { code, first, last?, username, password } makes a student
 *   account - no email, for students under 13 too - joins it, and signs it in.
 */
export const POST: APIRoute = async ({ request }) => {
  const user = await currentUser(request);
  const checked = checkJoinRequest(await readJson(request), { signedIn: !!user });
  if (!checked.ok) return json({ error: checked.error }, 400);
  const { code } = checked.value;

  const cls = await prisma.class.findUnique({
    where: { joinCode: code },
    select: { id: true, name: true, userId: true, user: { select: { accountType: true } } },
  });
  if (!cls || cls.user.accountType !== "educator") return json({ error: "No class has that code." }, 404);
  if (user?.id === cls.userId) return json({ error: "That is your own class." }, 400);

  const seats = await seatInfo(cls.userId);
  const already = user
    ? await prisma.enrollment.findFirst({ where: { studentId: user.id, class: { userId: cls.userId } }, select: { id: true } })
    : null;
  if (seats.left < 1 && !already) {
    return json({ error: "This class is full. Ask your teacher for more seats." }, 409);
  }

  if (user) {
    if ((await accountTypeFor(user)) === "educator") return json({ error: "Educator accounts cannot join a class." }, 400);
    await prisma.enrollment.upsert({
      where: { classId_studentId: { classId: cls.id, studentId: user.id } },
      create: { classId: cls.id, studentId: user.id, managed: false },
      update: {},
    });
    return json({ joined: cls.name });
  }

  const s = checked.value as Exclude<typeof checked.value, { code: string } & { first?: undefined }> & {
    first: string; last: string; username: string; password: string;
  };
  const loginName = studentLoginName(code, s.username);
  if (await prisma.user.findUnique({ where: { username: loginName }, select: { id: true } })) {
    return json({ error: "That username is taken in this class. Try another." }, 409);
  }
  const student = await createStudentAccount({ first: s.first, last: s.last, joinCode: code, username: s.username, password: s.password });
  await prisma.enrollment.create({ data: { classId: cls.id, studentId: student.id, managed: true } });
  // Sign the new student in: Better Auth's own username sign-in sets the cookie.
  return auth.api.signInUsername({
    body: { username: loginName, password: s.password },
    headers: request.headers,
    asResponse: true,
  });
};
