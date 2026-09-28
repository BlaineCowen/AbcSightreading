import { prisma } from "./db";
import { generateJoinCode } from "../join-code";

/**
 * Becoming an educator, apart from students.ts so the Stripe webhook hooks in
 * auth.ts can use it without importing auth back.
 */

/** A class code no other class has. */
export async function newJoinCode(): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const code = generateJoinCode();
    if (!(await prisma.class.findUnique({ where: { joinCode: code }, select: { id: true } }))) return code;
  }
  throw new Error("Could not find a free class code.");
}

/**
 * Makes an account an educator account and gives each of its classes a join
 * code. Never a student's: a child's account does not become a teacher's
 * because a card was used on it.
 */
export async function becomeEducator(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { accountType: true } });
  if (!user || user.accountType === "student") return false;
  if (user.accountType !== "educator") {
    await prisma.user.update({ where: { id: userId }, data: { accountType: "educator" } });
  }
  const bare = await prisma.class.findMany({ where: { userId, joinCode: null }, select: { id: true } });
  for (const c of bare) await prisma.class.update({ where: { id: c.id }, data: { joinCode: await newJoinCode() } });
  return true;
}
