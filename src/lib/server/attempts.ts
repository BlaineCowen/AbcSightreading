import { del, get, head, list } from "@vercel/blob";
import { prisma } from "./db";
import { serverEnv } from "./env";
import { roleIn } from "./practice";
import { shortUsername } from "./students";
import { loadScore } from "./pieces";
import { partsFor, pieceAssignmentOf } from "../pieces/assign";
import { FINISH_WITHIN_MS, TAKE_DAYS, TAKE_PATH, type AttemptSummary, type Mark } from "../pieces/attempts";
import { ATTEMPT_MODES, checkExerciseAttempt } from "../gradebook";
import { checkpointOf, isLevel, keepUntil } from "../portfolio";
import { byName, isBoardTest, type BoardRoster } from "../board-test";

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
export async function startAttempt(
  requesterId: string,
  assignmentId: string,
  body: { partId?: unknown; mode?: unknown; exercise?: unknown; studentId?: unknown } = {},
) {
  const { a, settings } = await assignmentOf(assignmentId);
  const role = await roleIn(requesterId, a.classId);
  const board = isBoardTest(a.params);
  // A board test's tries are sent by the teacher's device, for the student at the board (board-test.ts).
  let userId = requesterId;
  if (role === "teacher" && board && !settings) {
    if (typeof body.studentId !== "string") throw new AttemptError("Which student?");
    const enrolled = await prisma.enrollment.findFirst({ where: { classId: a.classId, studentId: body.studentId }, select: { id: true } });
    if (!enrolled) throw new AttemptError("That student is not in this class.", 404);
    userId = body.studentId;
  } else if (role !== "student") throw new AttemptError("Only a student of the class has graded attempts.", 403);
  else if (board) throw new AttemptError("This test is taken in class, on your teacher's board.", 403);
  const checkpoint = checkpointOf(a.params);
  // A checkpoint's recordings are the portfolio: kept through the school year.
  const deleteAfter = checkpoint ? keepUntil() : new Date(Date.now() + TAKE_DAYS * 86_400_000);
  if (!settings) {
    const checked = checkExerciseAttempt(body);
    if (!checked.ok) throw new AttemptError(checked.error);
    const { mode, exercise } = checked.value;
    if (checkpoint) {
      const before = await prisma.pieceAttempt.count({ where: { assignmentId, studentId: userId } });
      if (before >= checkpoint.tries) throw new AttemptError(`You have used ${checkpoint.tries === 1 ? "your try" : `all ${checkpoint.tries} tries`} at this checkpoint.`, 409);
    }
    const row = await prisma.pieceAttempt.create({
      data: { assignmentId, studentId: userId, partId: mode, partName: ATTEMPT_MODES[mode], exercise, deleteAfter },
      select: SUMMARY,
    });
    const used = await prisma.pieceAttempt.count({ where: { assignmentId, studentId: userId } });
    return { attempt: summaryOf(row), used, max: checkpoint?.tries ?? null };
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

/** The student's own attempt, or one the class's teacher started at a board test. */
async function mayHandle(userId: string, at: { studentId: string; assignment: { classId: string; params: unknown } }) {
  if (at.studentId === userId) return true;
  return isBoardTest(at.assignment.params) && (await roleIn(userId, at.assignment.classId)) === "teacher";
}

async function ownOpenAttempt(userId: string, assignmentId: string, attemptId: string) {
  const at = await prisma.pieceAttempt.findFirst({
    where: { id: attemptId, assignmentId },
    include: { assignment: { select: { classId: true, params: true } } },
  });
  if (!at || !(await mayHandle(userId, at))) throw new AttemptError("No such attempt.", 404);
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
  // Points for the student whose try it is (the board's included): never in the way of the grade.
  await import("./points")
    .then((p) => p.awardAttempt({ id: at.id, studentId: at.studentId, assignmentId, overall: result.overall, pitch: result.pitch, rhythm: result.rhythm, board: isBoardTest(at.assignment.params) }))
    .catch((e) => console.error("points", e));
  return summaryOf(row);
}

/** May this student upload a take to `pathname`? Their own attempt, recently started, with no take yet. */
export async function mayUploadTake(userId: string, pathname: string): Promise<boolean> {
  const m = TAKE_PATH.exec(pathname);
  if (!m) return false;
  const at = await prisma.pieceAttempt.findFirst({
    where: { id: m[2], assignmentId: m[1] },
    include: { assignment: { select: { classId: true, params: true } } },
  });
  if (!at || !(await mayHandle(userId, at))) return false;
  return !at.recordingPath && Date.now() - at.startedAt.getTime() <= FINISH_WITHIN_MS;
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
    max: settings?.maxAttempts ?? checkpointOf(a.params)?.tries ?? null,
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
  // A take still kept (a portfolio checkpoint's, kept the school year) is
  // never left behind, however old: only one no attempt points at is.
  const kept = new Set(
    (await prisma.pieceAttempt.findMany({ where: { deleteAfter: { gte: now }, recordingPath: { not: null } }, select: { recordingPath: true } })).map((r) => r.recordingPath!),
  );
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: "attempts/", cursor, token: t });
    for (const b of page.blobs) if (b.uploadedAt.getTime() < cutoff && !kept.has(b.pathname) && !paths.includes(b.pathname)) paths.push(b.pathname);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  if (paths.length) await del(paths, { token: t });
  if (due.length) await prisma.pieceAttempt.updateMany({ where: { id: { in: due.map((d) => d.id) } }, data: { recordingPath: null } });
  return { deleted: paths.length };
}

/** The teacher scores a checkpoint try on the rubric (portfolio.ts), or clears it (null). */
export async function scoreRubric(userId: string, attemptId: string, level: unknown) {
  if (level !== null && !isLevel(level)) throw new AttemptError("A rubric level is 1 to 4.");
  const at = await prisma.pieceAttempt.findUnique({ where: { id: attemptId }, include: { assignment: { select: { classId: true, params: true } } } });
  if (!at || (await roleIn(userId, at.assignment.classId)) !== "teacher") throw new AttemptError("No such attempt.", 404);
  if (!checkpointOf(at.assignment.params)) throw new AttemptError("Only a portfolio checkpoint is scored on the rubric.");
  await prisma.pieceAttempt.update({ where: { id: at.id }, data: { rubric: level as number | null } });
  return { rubric: level };
}

/**
 * A class's portfolio: its checkpoints in the order given, each student's
 * tries at each (portfolio.ts resultOf makes the result).
 */
export async function classPortfolio(classId: string) {
  const [assignments, enrollments] = await Promise.all([
    prisma.assignment.findMany({ where: { classId }, orderBy: { createdAt: "asc" }, select: { id: true, title: true, params: true, createdAt: true } }),
    prisma.enrollment.findMany({ where: { classId }, orderBy: { createdAt: "asc" }, select: { student: { select: { id: true, name: true, username: true } } } }),
  ]);
  const checkpoints = assignments.flatMap((a) => {
    const c = checkpointOf(a.params);
    return c ? [{ id: a.id, title: a.title, stage: c.stage, tries: c.tries, createdAt: a.createdAt.getTime() }] : [];
  });
  const rows = checkpoints.length
    ? await prisma.pieceAttempt.findMany({
        where: { assignmentId: { in: checkpoints.map((c) => c.id) } },
        orderBy: { startedAt: "asc" },
        select: { id: true, assignmentId: true, studentId: true, overall: true, rubric: true, recordingPath: true, startedAt: true, finishedAt: true },
      })
    : [];
  return {
    checkpoints,
    students: enrollments.map((e) => ({ id: e.student.id, name: e.student.name, username: shortUsername(e.student.username) })),
    tries: rows.map((r) => ({
      id: r.id, assignmentId: r.assignmentId, studentId: r.studentId,
      overall: r.finishedAt ? r.overall : null, rubric: r.rubric, hasTake: !!r.recordingPath, at: r.startedAt.getTime(),
    })),
  };
}

/**
 * A board test's names for the teacher's device (board-test.ts): everyone in
 * the class, with how many graded tries and the best, so a test spread over
 * several days shows who is left.
 */
export async function boardRoster(userId: string, assignmentId: string): Promise<BoardRoster> {
  const a = await prisma.assignment.findUnique({ where: { id: assignmentId }, select: { classId: true, title: true, params: true, class: { select: { name: true } } } });
  if (!a || !isBoardTest(a.params) || (await roleIn(userId, a.classId)) !== "teacher") throw new AttemptError("No such test.", 404);
  const [enrolled, tries] = await Promise.all([
    prisma.enrollment.findMany({ where: { classId: a.classId }, select: { student: { select: { id: true, name: true } } } }),
    prisma.pieceAttempt.findMany({ where: { assignmentId, finishedAt: { not: null } }, select: { studentId: true, overall: true } }),
  ]);
  const best = new Map<string, { tries: number; best: number | null }>();
  for (const t of tries) {
    const b = best.get(t.studentId) ?? { tries: 0, best: null };
    b.tries++;
    if (t.overall !== null && (b.best === null || t.overall > b.best)) b.best = t.overall;
    best.set(t.studentId, b);
  }
  return {
    className: a.class.name,
    title: a.title,
    students: enrolled
      .map((e) => ({ id: e.student.id, name: e.student.name, tries: best.get(e.student.id)?.tries ?? 0, best: best.get(e.student.id)?.best ?? null }))
      .sort(byName),
  };
}
