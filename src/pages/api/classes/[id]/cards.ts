import type { APIRoute } from "astro";
import { currentUser, json } from "../../../../lib/server/api";
import { prisma } from "../../../../lib/server/db";
import { auth } from "../../../../lib/server/auth";
import { generatePassword } from "../../../../lib/roster";
import { shortUsername } from "../../../../lib/server/students";
import { formatJoinCode } from "../../../../lib/join-code";

/**
 * Login cards for a whole class (Blaine, 16 October 2026: print login cards
 * by class or all together, easily). Passwords are stored one way, so a card
 * can only be printed when its password is made: this gives every student
 * the teacher made in the class a new password, signs them out, and answers
 * with the cards. Students who made their own login (with the code) are left
 * out: their password is theirs.
 *
 *   POST -> { className, joinCode, cards: [{ name, username, password }] }
 */
export const POST: APIRoute = async ({ request, params }) => {
  const user = await currentUser(request);
  if (!user) return json({ error: "Sign in first." }, 401);
  const cls = await prisma.class.findFirst({
    where: { id: params.id!, userId: user.id },
    select: {
      name: true,
      joinCode: true,
      enrollments: { where: { managed: true }, select: { student: { select: { id: true, name: true, username: true } } } },
    },
  });
  if (!cls) return json({ error: "No such class." }, 404);
  const students = cls.enrollments
    .map((e) => e.student)
    .filter((s) => s.username)
    .sort((a, b) => a.name.localeCompare(b.name));
  const ctx = await auth.$context;
  const cards: { name: string; username: string; password: string }[] = [];
  for (const s of students) {
    const password = generatePassword();
    await ctx.internalAdapter.updatePassword(s.id, await ctx.password.hash(password));
    await ctx.internalAdapter.deleteUserSessions(s.id);
    cards.push({ name: s.name, username: shortUsername(s.username) ?? "", password });
  }
  return json({ className: cls.name, joinCode: cls.joinCode ? formatJoinCode(cls.joinCode) : "", cards });
};
