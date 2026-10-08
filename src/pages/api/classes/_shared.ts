import { prisma } from "../../../lib/server/db";
import { json } from "../../../lib/server/api";
import type { ClassWithProgress } from "../../../lib/class-validate";

export const notSignedIn = () => json({ error: "Sign in to keep track of classes." }, 401);
export const missing = () => json({ error: "No such class." }, 404);

type Row = {
  id: string;
  name: string;
  position: number;
  course: string | null;
  courseSteps: unknown;
  progress: { presetKey: string; passedAt: Date }[];
};

export const toClass = (c: Row): ClassWithProgress => ({
  id: c.id,
  name: c.name,
  position: c.position,
  course: c.course,
  courseSteps: Array.isArray(c.courseSteps) ? (c.courseSteps as string[]) : null,
  passed: Object.fromEntries(c.progress.map((p) => [p.presetKey, p.passedAt.getTime()])),
});

export const withProgress = {
  id: true,
  name: true,
  position: true,
  course: true,
  courseSteps: true,
  progress: { select: { presetKey: true, passedAt: true } },
} as const;

/** The user's classes, in their order, each with what it has passed. */
export const listClasses = async (userId: string) =>
  (
    await prisma.class.findMany({
      where: { userId },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      select: withProgress,
    })
  ).map(toClass);

/** Every saved preset a course list names must be the caller's own. */
export async function ownsSavedKeys(userId: string, keys: string[]): Promise<boolean> {
  const ids = keys.filter((k) => k.startsWith("saved:")).map((k) => k.slice(6));
  if (!ids.length) return true;
  const n = await prisma.preset.count({ where: { userId, id: { in: ids } } });
  return n === new Set(ids).size;
}
