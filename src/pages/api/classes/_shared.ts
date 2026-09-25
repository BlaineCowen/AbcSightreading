import { prisma } from "../../../lib/server/db";
import { json } from "../../../lib/server/api";
import type { ClassWithProgress } from "../../../lib/class-validate";

export const notSignedIn = () => json({ error: "Sign in to keep track of classes." }, 401);
export const missing = () => json({ error: "No such class." }, 404);

type Row = {
  id: string;
  name: string;
  position: number;
  progress: { presetKey: string; passedAt: Date }[];
};

export const toClass = (c: Row): ClassWithProgress => ({
  id: c.id,
  name: c.name,
  position: c.position,
  passed: Object.fromEntries(c.progress.map((p) => [p.presetKey, p.passedAt.getTime()])),
});

export const withProgress = {
  id: true,
  name: true,
  position: true,
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
