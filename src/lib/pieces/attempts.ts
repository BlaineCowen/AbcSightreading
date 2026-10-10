import type { PerfResult } from "../grade";

/**
 * Graded attempts at a piece assignment: the rules the page and the server
 * share (tests pieces-attempts.test.ts). An attempt counts when it starts, so
 * walking away from a bad run still uses one of a limited number. Its take is
 * kept 90 days for the teacher to hear, then deleted.
 */

export const TAKE_DAYS = 90;
/** An attempt must be finished within this of starting (a long excerpt at a slow tempo, and the upload). */
export const FINISH_WITHIN_MS = 2 * 60 * 60 * 1000;
export const MAX_MARKS = 4000;

/** [model note index, pitch 0-100, rhythm 0-100, cents or null, onset beats or null, sung MIDI or null] */
export type Mark = [number, number, number, number | null, number | null, number | null];

export type AttemptSummary = {
  id: string;
  partId: string;
  partName: string;
  startedAt: number;
  finishedAt: number | null;
  overall: number | null;
  pitch: number | null;
  rhythm: number | null;
  hasTake: boolean;
};

export function attemptsLeft(max: number | null, used: number): number | null {
  return max === null ? null : Math.max(0, max - used);
}

/** "2 of 5 attempts used", or "3 attempts so far". */
export function attemptsLine(max: number | null, used: number): string {
  if (max === null) return used === 0 ? "As many attempts as you like" : `${used} attempt${used === 1 ? "" : "s"} so far`;
  return `${used} of ${max} attempt${max === 1 ? "" : "s"} used`;
}

/** The best finished attempt, by overall score. */
export function bestOf<T extends { overall: number | null }>(attempts: T[]): T | null {
  let best: T | null = null;
  for (const a of attempts) if (a.overall !== null && (!best || a.overall > (best.overall ?? -1))) best = a;
  return best;
}

/** What is kept of a run: the three scores and each note's marks, small. */
export function marksOf(perf: PerfResult): { overall: number; pitch: number; rhythm: number; marks: Mark[] } {
  const r = (x: number | null, d = 0) => (x === null || !Number.isFinite(x) ? null : Number(x.toFixed(d)));
  return {
    overall: Math.round(perf.overall),
    pitch: Math.round(perf.pitch),
    rhythm: Math.round(perf.rhythm),
    marks: perf.notes.map((n) => [n.cursor, Math.round(n.pitch), Math.round(n.rhythm), r(n.cents), r(n.onsetBeats, 2), r(n.sung, 2)]),
  };
}

type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

const score = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100;
const maybe = (v: unknown, lo: number, hi: number) => v === null || (typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi);

/** A finished attempt as the page sends it, checked. */
export function checkAttemptResult(body: unknown): Checked<{ overall: number; pitch: number; rhythm: number; marks: Mark[] }> {
  if (!body || typeof body !== "object") return { ok: false, error: "Expected the attempt's result." };
  const b = body as Record<string, unknown>;
  if (!score(b.overall) || !score(b.pitch) || !score(b.rhythm)) return { ok: false, error: "Scores are 0 to 100." };
  if (!Array.isArray(b.marks) || b.marks.length > MAX_MARKS) return { ok: false, error: "Those marks are not readable." };
  for (const m of b.marks) {
    if (!Array.isArray(m) || m.length !== 6) return { ok: false, error: "Those marks are not readable." };
    const [i, p, r, c, o, s] = m;
    if (!Number.isInteger(i) || i < 0 || !score(p) || !score(r) || !maybe(c, -2400, 2400) || !maybe(o, -64, 64) || !maybe(s, 0, 140)) {
      return { ok: false, error: "Those marks are not readable." };
    }
  }
  return {
    ok: true,
    value: { overall: Math.round(b.overall as number), pitch: Math.round(b.pitch as number), rhythm: Math.round(b.rhythm as number), marks: b.marks as Mark[] },
  };
}

/** The take's Blob path: one per attempt, audio only. */
export function takePath(assignmentId: string, attemptId: string, mime: string): string | null {
  const ext = /mp4|m4a|aac/.test(mime) ? "mp4" : /ogg/.test(mime) ? "ogg" : /webm/.test(mime) ? "webm" : null;
  if (!ext || !/^[\w-]+$/.test(assignmentId) || !/^[\w-]+$/.test(attemptId)) return null;
  return `attempts/${assignmentId}/${attemptId}.${ext}`;
}

export const TAKE_PATH = /^attempts\/([\w-]+)\/([\w-]+)\.(webm|mp4|ogg)$/;
