import { prisma } from "./db";
import type { Prisma } from "../../generated/prisma/client";
import { ladderById, stepLabel } from "../ladder";
import { uilPresets } from "../uil-presets";
import { parsePresetKey } from "../class-validate";
import { stepOfKey, trackStepLabel } from "../curriculum/tracks";
import { trackStepOptions } from "../curriculum/options";
import { overridesFrom } from "../curriculum/subscriptions";
import { RETENTION_DAYS, assignmentPage, assignmentProgress, creditSeconds, practiceDay } from "../practice";
import { loadScore } from "./pieces";
import { checkPieceAssignment, excerptLabel, pieceAssignmentOf } from "../pieces/assign";

/**
 * Assignments and the practice log, against the database. The rules are in
 * src/lib/practice.ts; this applies them.
 */

/**
 * What an assignment shows and opens, from the teacher's preset key. Null if
 * it is not theirs to assign; `{ error }` when a piece's part or bars cannot
 * be assigned (checked against the piece's score).
 */
export async function describePreset(teacherId: string, presetKey: string, pieceRequest?: unknown) {
  const key = parsePresetKey(presetKey);
  if (!key) return null;
  if (key.kind === "piece") {
    const piece = await prisma.piece.findFirst({ where: { id: key.id, userId: teacherId } });
    if (!piece) return null;
    const score = await loadScore(piece.scorePath);
    const checked = checkPieceAssignment(pieceRequest, piece.id, score);
    if (!checked.ok) return { error: checked.error };
    const names = (piece.parts ?? {}) as Record<string, { name?: string }>;
    const label = excerptLabel(
      { ...score, parts: score.parts.map((p) => ({ ...p, name: names[p.id]?.name ?? p.name })) },
      checked.value,
    );
    return { title: `${piece.title}: ${label}`, page: "piece" as const, params: checked.value as unknown as Prisma.InputJsonObject };
  }
  if (key.kind === "step") return { title: stepLabel(ladderById[key.id]), page: assignmentPage(presetKey), params: null };
  if (key.kind === "uil") return { title: uilPresets[key.level].label ?? key.level, page: "choral" as const, params: null };
  if (key.kind === "track") {
    // The teacher's own version of the step if they kept one, copied in like a saved preset.
    const found = stepOfKey(presetKey)!;
    const pref = await prisma.userPreference.findUnique({ where: { userId: teacherId }, select: { trackOverrides: true } });
    const options = overridesFrom(pref?.trackOverrides)[presetKey] ?? trackStepOptions(found.track, found.step, found.part);
    const title = trackStepLabel(found.track, found.step, found.part);
    return { title, page: "unison" as const, params: { id: presetKey, name: title, params: options as Prisma.InputJsonObject } };
  }
  const saved = await prisma.preset.findFirst({ where: { id: key.id, userId: teacherId } });
  if (!saved) return null;
  return { title: saved.name, page: assignmentPage(presetKey, saved.store), params: { id: saved.id, name: saved.name, params: saved.params } };
}

/** Whether this account is in the class, or teaches it. */
export async function roleIn(userId: string, classId: string): Promise<"teacher" | "student" | null> {
  const cls = await prisma.class.findUnique({ where: { id: classId }, select: { userId: true } });
  if (!cls) return null;
  if (cls.userId === userId) return "teacher";
  const e = await prisma.enrollment.findFirst({ where: { classId, studentId: userId }, select: { id: true } });
  return e ? "student" : null;
}

/**
 * One report from a practice page. Logged only for accounts in a class - a
 * teacher's own practice, or a student's with no class, is nobody's to see.
 * Returns the seconds credited.
 */
export async function recordPractice(
  userId: string,
  r: { seconds: number; exercises: number; assignmentId: string | null; page: string; day: unknown }
) {
  const enrollments = await prisma.enrollment.findMany({ where: { studentId: userId }, select: { classId: true } });
  if (!enrollments.length) return { logged: false, credited: 0 };

  let assignmentId: string | null = null;
  if (r.assignmentId) {
    const a = await prisma.assignment.findUnique({ where: { id: r.assignmentId }, select: { classId: true } });
    if (a && enrollments.some((e) => e.classId === a.classId)) assignmentId = r.assignmentId;
  }

  const now = new Date();
  const clock = await prisma.practiceClock.findUnique({ where: { studentId: userId } });
  const credited = creditSeconds({ claimed: r.seconds, lastCreditedAt: clock?.lastCreditedAt ?? null, now });
  const exercises = Number.isInteger(r.exercises) ? Math.min(Math.max(r.exercises, 0), 10) : 0;
  if (!credited && !exercises) return { logged: true, credited: 0 };
  if (credited) {
    await prisma.practiceClock.upsert({
      where: { studentId: userId },
      create: { studentId: userId, lastCreditedAt: now },
      update: { lastCreditedAt: now },
    });
  }

  const day = practiceDay(r.day, now);
  const page = r.page === "unison" || r.page === "piece" ? r.page : "choral";
  const row = await prisma.practiceTime.findFirst({ where: { studentId: userId, day, assignmentId, page }, select: { id: true } });
  if (row) {
    await prisma.practiceTime.update({
      where: { id: row.id },
      data: { seconds: { increment: credited }, exercises: { increment: exercises } },
    });
  } else {
    await prisma.practiceTime.create({ data: { studentId: userId, day, assignmentId, page, seconds: credited, exercises } });
  }

  // Now and then, forget what is past keeping.
  if (Math.random() < 0.02) {
    const cutoff = new Date(now.getTime() - RETENTION_DAYS * 86_400_000).toISOString().slice(0, 10);
    await prisma.practiceTime.deleteMany({ where: { day: { lt: cutoff } } });
  }
  return { logged: true, credited };
}

/** Seconds, exercises and last activity per student on each of these assignments. */
async function totalsFor(assignmentIds: string[], studentIds?: string[]) {
  const rows = await prisma.practiceTime.groupBy({
    by: ["assignmentId", "studentId"],
    where: { assignmentId: { in: assignmentIds }, ...(studentIds ? { studentId: { in: studentIds } } : {}) },
    _sum: { seconds: true, exercises: true },
    _max: { updatedAt: true },
  });
  const map = new Map<string, { seconds: number; exercises: number; lastActive: number | null }>();
  for (const r of rows) {
    map.set(`${r.assignmentId}:${r.studentId}`, {
      seconds: r._sum.seconds ?? 0,
      exercises: r._sum.exercises ?? 0,
      lastActive: r._max.updatedAt?.getTime() ?? null,
    });
  }
  return map;
}

const assignmentView = (a: { id: string; title: string; page: string; presetKey: string; minutes: number; dueAt: Date | null; note: string; createdAt: Date; params?: unknown }) => {
  const piece = a.page === "piece" ? pieceAssignmentOf(a.params) : null;
  return {
    id: a.id,
    title: a.title,
    page: a.page,
    presetKey: a.presetKey,
    minutes: a.minutes,
    dueAt: a.dueAt?.getTime() ?? null,
    note: a.note,
    createdAt: a.createdAt.getTime(),
    // A piece's graded attempts: null for as many as they like.
    ...(piece ? { maxAttempts: piece.maxAttempts } : {}),
  };
};

/** A class's assignments with every student's progress, and each student's last week of practice. */
export async function classAssignments(classId: string) {
  const [assignments, enrollments] = await Promise.all([
    prisma.assignment.findMany({ where: { classId }, orderBy: { createdAt: "desc" } }),
    prisma.enrollment.findMany({
      where: { classId },
      orderBy: { createdAt: "asc" },
      select: { student: { select: { id: true, name: true } } },
    }),
  ]);
  const students = enrollments.map((e) => e.student);
  const ids = students.map((s) => s.id);
  const totals = await totalsFor(assignments.map((a) => a.id), ids);

  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
  const week = await prisma.practiceTime.groupBy({
    by: ["studentId"],
    where: { studentId: { in: ids }, day: { gte: weekAgo } },
    _sum: { seconds: true, exercises: true },
  });
  const weekBy = new Map(week.map((w) => [w.studentId, { seconds: w._sum.seconds ?? 0, exercises: w._sum.exercises ?? 0 }]));

  return {
    students: students.map((s) => ({ id: s.id, name: s.name, week: weekBy.get(s.id) ?? { seconds: 0, exercises: 0 } })),
    assignments: assignments.map((a) => ({
      ...assignmentView(a),
      progress: students.map((s) => {
        const t = totals.get(`${a.id}:${s.id}`) ?? { seconds: 0, exercises: 0, lastActive: null };
        return { studentId: s.id, ...t, ...assignmentProgress(t.seconds, a.minutes) };
      }),
    })),
  };
}

/** A student's assignments in every class they are in, with their own progress. */
export async function myAssignments(userId: string) {
  const enrollments = await prisma.enrollment.findMany({ where: { studentId: userId }, select: { classId: true, class: { select: { name: true } } } });
  if (!enrollments.length) return { enrolled: false, assignments: [] };
  const assignments = await prisma.assignment.findMany({
    where: { classId: { in: enrollments.map((e) => e.classId) } },
    orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
    take: 50,
  });
  const totals = await totalsFor(assignments.map((a) => a.id), [userId]);
  const className = new Map(enrollments.map((e) => [e.classId, e.class.name]));
  return {
    enrolled: true,
    assignments: assignments.map((a) => {
      const t = totals.get(`${a.id}:${userId}`) ?? { seconds: 0, exercises: 0, lastActive: null };
      return { ...assignmentView(a), className: className.get(a.classId) ?? "", seconds: t.seconds, ...assignmentProgress(t.seconds, a.minutes) };
    }),
  };
}

/** One assignment, to open on a practice page. Teacher or student of the class only. */
export async function openAssignment(userId: string, id: string) {
  const a = await prisma.assignment.findUnique({ where: { id } });
  if (!a) return null;
  const role = await roleIn(userId, a.classId);
  if (!role) return null;
  const totals = role === "student" ? await totalsFor([a.id], [userId]) : new Map();
  const seconds = totals.get(`${a.id}:${userId}`)?.seconds ?? 0;
  return { ...assignmentView(a), params: a.params, role, seconds };
}
