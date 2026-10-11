import type { ClapResult } from "./grade-rhythm";
import type { Mark } from "./pieces/attempts";

/**
 * The gradebook: a class's students against its assignments, one grade a
 * cell (tests gradebook.test.ts). The grade is the best graded attempt
 * (Blaine, 10 October 2026: practice never costs a student); an assignment
 * with no graded attempts but a time goal is the share of the minutes done.
 * The same grades go to the CSV and to Google Classroom.
 */

/** How a sight-reading attempt was graded: sung (Pitch & rhythm), clapped into the microphone, or tapped. */
export const ATTEMPT_MODES = { sing: "Sung", clap: "Clapped", tap: "Tapped" } as const;
export type AttemptMode = keyof typeof ATTEMPT_MODES;

/** The longest exercise link kept with an attempt (a 16-bar exercise packs to a few hundred characters). */
export const MAX_EXERCISE_LINK = 8000;

type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * A sight-reading attempt as the page starts it: how it is graded, and the
 * link to the exercise (a path on the Unison page, where Grade runs).
 */
export function checkExerciseAttempt(body: unknown): Checked<{ mode: AttemptMode; exercise: string }> {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  if (typeof b.mode !== "string" || !(b.mode in ATTEMPT_MODES)) return { ok: false, error: "How was it graded?" };
  const ex = b.exercise;
  if (typeof ex !== "string" || ex.length > MAX_EXERCISE_LINK || !/^\/sightreading(\?|#|$)/.test(ex)) {
    return { ok: false, error: "That exercise link is not readable." };
  }
  return { ok: true, value: { mode: b.mode as AttemptMode, exercise: ex } };
}

/** A clapped or tapped run as an attempt: rhythm only, so no pitch score. */
export function clapMarksOf(claps: ClapResult): { overall: number; pitch: null; rhythm: number; marks: Mark[] } {
  const r = (x: number | null) => (x === null || !Number.isFinite(x) ? null : Number(x.toFixed(2)));
  return {
    overall: Math.round(claps.rhythm),
    pitch: null,
    rhythm: Math.round(claps.rhythm),
    marks: claps.notes.map((n) => [n.cursor, 100, Math.round(n.rhythm), null, r(n.onsetBeats), null]),
  };
}

export type GradeCell = {
  /** 0-100, or null for nothing to grade yet. */
  grade: number | null;
  /** Where it came from: the best attempt, or minutes practised against the goal. */
  from: "attempt" | "time" | null;
  attempts: number;
};

export function gradeOf(
  a: { minutes: number },
  p: { best?: number | null; attempts?: number; percent: number; seconds: number },
): GradeCell {
  const attempts = p.attempts ?? 0;
  if (p.best !== null && p.best !== undefined) return { grade: p.best, from: "attempt", attempts };
  if (a.minutes > 0 && p.seconds > 0) return { grade: p.percent, from: "time", attempts };
  return { grade: null, from: null, attempts };
}

/** The mean of the grades there are, rounded; null when there are none. */
export function averageOf(grades: (number | null)[]): number | null {
  const got = grades.filter((g): g is number => g !== null);
  return got.length ? Math.round(got.reduce((s, g) => s + g, 0) / got.length) : null;
}

const csvCell = (v: string | number | null) => {
  const s = v === null ? "" : String(v);
  // Quoted when it must be, and a leading = + - @ defused, so a spreadsheet never runs a name as a formula.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export type GradebookColumn = { id: string; title: string; dueAt: number | null };
export type GradebookRow = { name: string; username: string | null; grades: (number | null)[] };

/**
 * The CSV a school gradebook imports: a row a student (name, username), a
 * column an assignment (its title and due date), then the average. A blank is
 * nothing to grade yet, never a zero: the teacher decides what a missing
 * assignment is worth.
 */
export function gradebookCsv(columns: GradebookColumn[], rows: GradebookRow[]): string {
  const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const head = ["Student", "Username", ...columns.map((c) => (c.dueAt ? `${c.title} (due ${day(c.dueAt)})` : c.title)), "Average"];
  const lines = [head, ...rows.map((r) => [r.name, r.username, ...r.grades, averageOf(r.grades)])];
  // A byte order mark, so Excel reads the names' accents.
  return "﻿" + lines.map((l) => l.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
