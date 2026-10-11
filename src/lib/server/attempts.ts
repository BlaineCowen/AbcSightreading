import { del, get, head, list } from "@vercel/blob";
import { prisma } from "./db";
import { serverEnv } from "./env";
import { roleIn } from "./practice";
import { loadScore } from "./pieces";
import { partsFor, pieceAssignmentOf } from "../pieces/assign";
import { FINISH_WITHIN_MS, TAKE_DAYS, TAKE_PATH, type AttemptSummary, type Mark } from "../pieces/attempts";
import { ATTEMPT_MODES, checkExerciseAttempt } from "../gradebook";

/**
 * Graded attempts at an assignment, against the database (rules in
 * src/lib/pieces/attempts.ts and src/lib/gradebook.ts): a piece's part, or a
 * sight-reading assignment's exercises (each attempt a new exercise, its link
 * kept, as many as they like). A student starts an attempt (counted then),
 * finishes it with the scores and each note's marks, and sends its take; the
 * teacher of the class sees every student's, the student their own.
 */

export class AttemptError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

const token = () => serverEnv("BLOB_READ_WRITE_TOKEN");

type Row = {
  id: string; partId: string; partName: string; startedAt: Date; finishedAt: Date | null;
  overall: number | null; pitch: number | null; rhythm: number | null; recordingPath: string | null; exercise?: string | null;
};
export const summaryOf = (a: Row): AttemptSummary => ({
  id: a.id,
  partId: a.partId,
  partName: a.partName,
  startedAt: a.startedAt.getTime(),
  finishedAt: a.finishedAt?.getTime() ?? null,
  overall: a.overall,
  pitch: a.pitch,
  rhythm: a.rhythm,
  hasTake: !!a.recordingPath,
  exercise: a.exercise ?? null,
});
const SUMMARY = { id: true, partId: true, partName: true, startedAt: true, finishedAt: true, overall: true, pitch: true, rhythm: true, recordingPath: true, exercise: true } as const;

/** The assignment, and its piece's settings (null for sight reading). */
async function assignmentOf(assignmentId: string) {
  const a = await prisma.assignment.findUnique({ where: { id: assignmentId } });
  if (!a) throw new AttemptError("No such assignment.", 404);
  const settings = a.page === "piece" ? pieceAssignmentOf(a.params) : null;
  if (a.page === "piece" && !settings) throw new AttemptError("No such assignment.", 404);
  return { a, settings };
}

/**
 * Starts an attempt for a student of the class: counted now. A piece's names
 * the part (`partId`); a sight-reading one how it is graded and the exercise.
 */
export async function startAttempt(userId: string, assignmentId: string, body: { partId?: unknown; mode?: unknown; exercise?: unknown } = {}) {
  const { a, settings } = await assignmentOf(assignmentId);
  if ((await roleIn(userId, a.classId)) !== "student") throw new AttemptError("Only a student of the class has graded attempts.", 403);
  const deleteAfter = new Date(Date.now() + TAKE_DAYS * 86_400_000);
  if (!settings) {
    const checked = checkExerciseAttempt(body);
    if (!checked.ok) throw new AttemptError(checked.error);
    const { mode, exercise } = checked.value;
    const row = await prisma.pieceAttempt.create({
      data: { assignmentId, studentId: userId, partId: mode, partName: ATTEMPT_MODES[mode], exercise, deleteAfter },
      select: SUMMARY,
    });
    const used = await prisma.pieceAttempt.count({ where: { assignmentId, studentId: userId } });
    return { attempt: summaryOf(row), used, max: null };
  }
  const partId = body.partId;
  const piece = await prisma.piece.findUnique({ where: { id: settings.pieceId } });
  if (!piece) throw new AttemptError("This piece is no longer there.", 404);
  const score = await loadScore(piece.scorePath);
  if (typeof partId !== "string" || !partsFor(score, settings.from, settings.to).includes(partId)) {
    throw new AttemptError("Choose your part first.");
  }
  const used = await prisma.pieceAttempt.count({ where: { assignmentId, studentId: userId } });
  if (settings.maxAttempts !== null && used >= settings.maxAttempts) {
    throw new AttemptError(`You have used all ${settings.maxAttempts} attempts.`, 409);
  }
  const names = (piece.parts ?? {}) as Record<string, { name?: string }>;
  const partName = names[partId]?.name ?? score.parts.find((p) => p.id === partId)?.name ?? "Part";
  const row = await prisma.pieceAttempt.create({
    data: { assignmentId, studentId: userId, partId, partName, deleteAfter },
    select: SUMMARY,
  });
  return { attempt: summaryOf(row), used: used + 1, max: settings.maxAttempts };
}

async function ownOpenAttempt(userId: string, assignmentId: string, attemptId: string) {
  const at = await prisma.pieceAttempt.findFirst({ where: { id: attemptId, assignmentId, studentId: userId } });
  if (!at) throw new AttemptError("No such attempt.", 404);
  if (Date.now() - at.startedAt.getTime() > FINISH_WITHIN_MS) throw new AttemptError("This attempt was started too long ago.", 409);
  return at;
}

export async function finishAttempt(
  userId: string,
  assignmentId: string,
  attemptId: string,
  result: { overall: number; pitch: number | null; rhythm: number; marks: Mark[] },
) {
  const at = await ownOpenAttempt(userId, assignmentId, attemptId);
  if (at.finishedAt) throw new AttemptError("This attempt is already graded.", 409);
  const row = await prisma.pieceAttempt.update({
    where: { id: at.id },
    data: { finishedAt: new Date(), overall: result.overall, pitch: result.pitch, rhythm: result.rhythm, marks: result.marks },
    select: SUMMARY,
  });
  return summaryOf(row);
}

/** May this student upload a take to `pathname`? Their own attempt, recently started, with no take yet. */
export async function mayUploadTake(userId: string, pathname: string): Promise<boolean> {
  const m = TAKE_PATH.exec(pathname);
  if (!m) return false;
  const at = await prisma.pieceAttempt.findFirst({ where: { id: m[2], assignmentId: m[1], studentId: userId } });
  return !!at && !at.recordingPath && Date.now() - at.startedAt.getTime() <= FINISH_WITHIN_MS;
}

/** After the upload: the take is there, so the attempt points at it. */
export async function attachTake(userId: string, assignmentId: string, attemptId: string, pathname: unknown) {
  const at = await ownOpenAttempt(userId, assignmentId, attemptId);
  const m = typeof pathname === "string" ? TAKE_PATH.exec(pathname) : null;
  if (!m || m[1] !== assignmentId || m[2] !== attemptId) throw new AttemptError("That is not this attempt's take.");
  const t = token();
  if (!t || !(await head(pathname as string, { token: t }).catch(() => null))) throw new AttemptError("The take did not arrive.", 409);
  await prisma.pieceAttempt.update({ where: { id: at.id }, data: { recordingPath: pathname as string } });
}

/** A student's own attempts, or as the teacher every student's with their names. */
export async function listAttempts(userId: string, assignmentId: string) {
  const { a, settings } = await assignmentOf(assignmentId);
  const role = await roleIn(userId, a.classId);
  if (!role) throw new AttemptError("No such assignment.", 404);
  const rows = await prisma.pieceAttempt.findMany({
    where: { assignmentId, ...(role === "student" ? { studentId: userId } : {}) },
    orderBy: { startedAt: "asc" },
    select: { ...SUMMARY, studentId: true, student: { select: { name: true } } },
  });
  return {
    role,
    max: settings?.maxAttempts ?? null,
    attempts: rows.map((r) => ({ ...summaryOf(r), studentId: r.studentId, studentName: r.student.name })),
  };
}

/** One attempt with its marks: the student's own, or any in the teacher's class. */
export async function attemptFor(userId: string, attemptId: string) {
  const at = await prisma.pieceAttempt.findUnique({
    where: { id: attemptId },
    include: { assignment: { select: { classId: true } }, student: { select: { name: true } } },
  });
  if (!at) return null;
  if (at.studentId !== userId && (await roleIn(userId, at.assignment.classId)) !== "teacher") return null;
  return at;
}

/** The take's audio, for the student or their teacher. */
export async function takeStream(path: string) {
  const t = token();
  if (!t) return null;
  const got = await get(path, { access: "private", token: t, useCache: false });
  return got && got.statusCode === 200 ? got : null;
}

/** Deletes an assignment's takes (the rows go with the assignment). */
export async function deleteTakes(assignmentId: string) {
  const t = token();
  if (!t) return;
  const rows = await prisma.pieceAttempt.findMany({ where: { assignmentId, recordingPath: { not: null } }, select: { recordingPath: true } });
  const paths = rows.map((r) => r.recordingPath!);
  if (paths.length) await del(paths, { token: t }).catch(() => {});
}

/**
 * Daily (the cron): takes past their 90 days are deleted, and any take left
 * behind by an attempt that is gone (its student or class deleted).
 */
export async function deleteOldTakes(now = new Date()) {
  const t = token();
  if (!t) return { deleted: 0 };
  const due = await prisma.pieceAttempt.findMany({ where: { deleteAfter: { lt: now }, recordingPath: { not: null } }, select: { id: true, recordingPath: true } });
  const paths = due.map((d) => d.recordingPath!);
  const cutoff = now.getTime() - TAKE_DAYS * 86_400_000;
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: "attempts/", cursor, token: t });
    for (const b of page.blobs) if (b.uploadedAt.getTime() < cutoff && !paths.includes(b.pathname)) paths.push(b.pathname);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  if (paths.length) await del(paths, { token: t });
  if (due.length) await prisma.pieceAttempt.updateMany({ where: { id: { in: due.map((d) => d.id) } }, data: { recordingPath: null } });
  return { deleted: paths.length };
}
