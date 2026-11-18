import { prisma } from "./db";
import { serverEnv } from "./env";
import { isAdmin } from "./admin";
import { roleIn } from "./practice";
import {
  DEV_ONLY_GAMES, checkGameSetup, checkGoal, gameProgress, gameTitle, goalText, isGameId, type GameGoal, type GameId,
} from "../game-assignments";

/**
 * Game assignments on the server (src/lib/game-assignments.ts has the rules
 * and the why). A teacher gives a game with its setup to classes of theirs;
 * a student in the class sees it, opens it with that setup, and each round
 * they finish is a result. Ear games' rounds are marked here from their
 * token (ear-games.ts, `checked`); the others are what the device reports.
 */

/** On the live site the ear games and Note Rain are an owner's only, and so are their assignments. */
export const gameShown = (game: string, user: { email: string } | null | undefined) =>
  !DEV_ONLY_GAMES.includes(game as GameId) || serverEnv("VERCEL_ENV") !== "production" || isAdmin(user);

export type GameAssignmentInput = { game: GameId; setup: Record<string, unknown>; goal: GameGoal; title: string; dueAt: Date | null; note: string; classIds: string[] };

/** A request to assign, checked: the game, its setup by the game's own check, the goal, the classes. */
export function checkGameAssignment(v: unknown): { ok: true; value: GameAssignmentInput } | { ok: false; error: string } {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  if (!isGameId(o.game)) return { ok: false, error: "No such game." };
  const classIds = Array.isArray(o.classIds) ? [...new Set(o.classIds.filter((c): c is string => typeof c === "string" && c.length < 64))] : [];
  if (!classIds.length) return { ok: false, error: "Choose a class." };
  if (classIds.length > 30) return { ok: false, error: "That is a lot of classes at once." };
  const setup = checkGameSetup(o.game, o.setup);
  const due = typeof o.dueAt === "number" && Number.isFinite(o.dueAt) ? new Date(o.dueAt) : null;
  const note = typeof o.note === "string" ? o.note.trim().slice(0, 300) : "";
  return { ok: true, value: { game: o.game, setup, goal: checkGoal(o.game, o.goal), title: gameTitle(o.game, setup), dueAt: due, note, classIds } };
}

/** Creates one assignment a class; null if a class is not the teacher's. */
export async function createGameAssignments(teacherId: string, a: GameAssignmentInput) {
  const owned = await prisma.class.count({ where: { id: { in: a.classIds }, userId: teacherId } });
  if (owned !== a.classIds.length) return null;
  const made = await prisma.$transaction(
    a.classIds.map((classId) =>
      prisma.gameAssignment.create({
        data: { classId, game: a.game, title: a.title, setup: a.setup as object, goal: a.goal as object, dueAt: a.dueAt, note: a.note },
        select: { id: true },
      }),
    ),
  );
  return made.map((m) => m.id);
}

const view = (a: { id: string; game: string; title: string; goal: unknown; dueAt: Date | null; note: string; createdAt: Date }) => {
  const game = a.game as GameId;
  const goal = checkGoal(game, a.goal);
  return { id: a.id, game, title: a.title, goal, goalText: goalText(game, goal), dueAt: a.dueAt?.getTime() ?? null, note: a.note, createdAt: a.createdAt.getTime() };
};

/** A student's game assignments across their classes, with their progress; games they can't open are left out. */
export async function myGameAssignments(user: { id: string; email: string }) {
  const enrollments = await prisma.enrollment.findMany({ where: { studentId: user.id }, select: { classId: true, class: { select: { name: true } } } });
  if (!enrollments.length) return [];
  const rows = await prisma.gameAssignment.findMany({
    where: { classId: { in: enrollments.map((e) => e.classId) } },
    orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
    take: 50,
    include: { results: { where: { studentId: user.id }, select: { score: true } } },
  });
  const className = new Map(enrollments.map((e) => [e.classId, e.class.name]));
  return rows
    .filter((a) => gameShown(a.game, user))
    .map((a) => {
      const v = view(a);
      return { ...v, className: className.get(a.classId) ?? "", ...gameProgress(v.goal, a.results.map((r) => r.score)) };
    });
}

/** One assignment for its page: the setup to play, for a student of the class or its teacher. */
export async function openGameAssignment(user: { id: string; email: string }, id: string) {
  const a = await prisma.gameAssignment.findUnique({ where: { id } });
  if (!a || !gameShown(a.game, user)) return null;
  const role = await roleIn(user.id, a.classId);
  if (!role) return null;
  const v = view(a);
  const mine = role === "student" ? await prisma.gameAssignmentResult.findMany({ where: { assignmentId: id, studentId: user.id }, select: { score: true } }) : [];
  return { ...v, setup: a.setup, role, progress: gameProgress(v.goal, mine.map((r) => r.score)) };
}

/** A class's game assignments with each student's progress (its teacher's view). */
export async function classGameAssignments(classId: string) {
  const [rows, enrollments] = await Promise.all([
    prisma.gameAssignment.findMany({ where: { classId }, orderBy: { createdAt: "desc" }, include: { results: { select: { studentId: true, score: true } } } }),
    prisma.enrollment.findMany({ where: { classId }, orderBy: { createdAt: "asc" }, select: { student: { select: { id: true, name: true } } } }),
  ]);
  const students = enrollments.map((e) => ({ id: e.student.id, name: e.student.name }));
  return rows.map((a) => {
    const v = view(a);
    const progress = students.map((s) => ({ studentId: s.id, name: s.name, ...gameProgress(v.goal, a.results.filter((r) => r.studentId === s.id).map((r) => r.score)) }));
    return { ...v, done: progress.filter((p) => p.status === "done").length, students: students.length, progress };
  });
}

/**
 * A round finished on an assignment. `round` (an ear game's token id) makes it
 * count once; `checked` says the server marked it. Only a student of the
 * class, on that game, records anything.
 */
export async function recordGameResult(studentId: string, assignmentId: string, game: string, score: number, opts: { checked: boolean; round?: string }) {
  const a = await prisma.gameAssignment.findUnique({ where: { id: assignmentId }, select: { classId: true, game: true, goal: true } });
  if (!a || a.game !== game) return null;
  if ((await roleIn(studentId, a.classId)) !== "student") return null;
  const max = { solfege: 10, interval: 10, "note-rain": 300, rhythm: 100, tune: 3 }[a.game as GameId] ?? 100;
  const s = Math.max(0, Math.min(max, Math.round(score)));
  if (opts.round && (await prisma.gameAssignmentResult.findUnique({ where: { round: opts.round }, select: { id: true } }))) return "again" as const;
  await prisma.gameAssignmentResult.create({ data: { assignmentId, studentId, score: s, checked: opts.checked, round: opts.round ?? null } });
  const mine = await prisma.gameAssignmentResult.findMany({ where: { assignmentId, studentId }, select: { score: true } });
  return gameProgress(checkGoal(a.game as GameId, a.goal), mine.map((r) => r.score));
}

/** The teacher removes one (its results go with it). */
export async function deleteGameAssignment(teacherId: string, id: string) {
  const a = await prisma.gameAssignment.findUnique({ where: { id }, select: { classId: true } });
  if (!a || (await roleIn(teacherId, a.classId)) !== "teacher") return false;
  await prisma.gameAssignment.delete({ where: { id } });
  return true;
}

/** The assignment's stored setup, for an ear game's round to be dealt from (never the browser's). */
export async function assignedSetup(studentId: string, assignmentId: string, game: string) {
  const a = await prisma.gameAssignment.findUnique({ where: { id: assignmentId }, select: { classId: true, game: true, setup: true } });
  if (!a || a.game !== game || (await roleIn(studentId, a.classId)) !== "student") return null;
  return a.setup;
}

/** Rounds played on game assignments, kept as long as practice time (RETENTION_DAYS): from the daily cron. */
export async function deleteOldGameResults(now = new Date()) {
  const { RETENTION_DAYS } = await import("../practice");
  const { count } = await prisma.gameAssignmentResult.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - RETENTION_DAYS * 86_400_000) } } });
  return count;
}
