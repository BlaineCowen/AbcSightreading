import type { HistoryPoint } from "./pitch-history";
import { NOTES } from "./pitch";
import type { NoteName } from "./types";

export type Direction = "up" | "updown";
export type Difficulty = "easy" | "normal" | "strict";

/** How far off the target still counts as holding the note. */
export const TOLERANCE_CENTS: Record<Difficulty, number> = {
  easy: 45,
  normal: 25,
  strict: 10,
};

/** Time on target needed to clear a note. */
export const HOLD_MS = 1000;
/** Breather between one note clearing and the next being presented. */
export const GAP_MS = 500;
/**
 * A hold survives this much off-target time without resetting — a consonant, a
 * vibrato swing crossing the line, or a single dropped frame should not undo a
 * second of good singing.
 */
export const HOLD_GRACE_MS = 250;
/** How long the guide tone sounds before listening starts. */
export const GUIDE_TONE_MS = 700;

/**
 * Finding the note within this long costs nothing. A tighter tolerance
 * genuinely takes longer to settle into, so Strict gets more room than Easy.
 */
export const FREE_FIND_MS: Record<Difficulty, number> = {
  easy: 1000,
  normal: 1300,
  strict: 1800,
};
/**
 * Each further second of hunting costs this much. Expressed in cents so it can
 * be added straight to the pitch error: a note is only ever cleared *in tune*,
 * so accuracy alone says almost nothing about how well someone sang — without
 * this, groping around for five seconds still scored A+.
 */
export const FIND_PENALTY_CENTS_PER_S = 12;

const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11, 12];
const SKIPPED_PENALTY_CENTS = 100;

/** MIDI numbers for the exercise, low Do first. */
export function buildTargets(
  key: NoteName,
  octave: number,
  direction: Direction
): number[] {
  const root = (octave + 1) * 12 + NOTES.indexOf(key);
  const up = MAJOR_STEPS.map((s) => root + s);
  // Coming back down, the top Do is held once rather than repeated.
  return direction === "up" ? up : [...up, ...up.slice(0, -1).reverse()];
}

/** Signed distance from the target in cents (+ sharp). */
export function centsFromTarget(hz: number, targetHz: number): number {
  return 1200 * Math.log2(hz / targetHz);
}

/**
 * What one note's time-to-find costs the grade, in cents-equivalent. Skipped
 * notes return 0 — their flat 100¢ penalty already covers giving up.
 */
export function findPenalty(
  timeToFindMs: number | null,
  difficulty: Difficulty
): number {
  if (timeToFindMs === null) return 0;
  const over = timeToFindMs - FREE_FIND_MS[difficulty];
  return over <= 0 ? 0 : (over / 1000) * FIND_PENALTY_CENTS_PER_S;
}

export interface NoteResult {
  index: number;
  target: number;
  /** Median signed cents over the successful hold, or null when skipped. */
  cents: number | null;
  /** Absolute error used for grading; skipped notes take the penalty. */
  errorCents: number;
  /** True when the singer gave up on this note. */
  missed: boolean;
  /** How long from the note appearing until the hold began, null if skipped. */
  timeToFindMs: number | null;
}

export interface Grade {
  letter: string;
  /** Mean pitch error over the run — accuracy on its own. */
  meanCents: number;
  /** Mean time-to-find cost, same units, 0 when everything was found promptly. */
  meanFindPenalty: number;
  /** meanCents + meanFindPenalty. This is what the letter grades. */
  score: number;
  /** Mean time to find a note, null if every note was skipped. */
  meanFindMs: number | null;
  notes: NoteResult[];
  missedCount: number;
  worst: NoteResult | null;
  /** Wall-clock from the first note appearing to the last one resolving. */
  totalMs: number;
}

const LETTERS: [number, string][] = [
  [10, "A+"],
  [15, "A"],
  [20, "B"],
  [30, "C"],
  [45, "D"],
];

/** Thresholds are cents-equivalent penalty, i.e. pitch error plus hunting. */
export function letterFor(score: number): string {
  // Round first: a score of exactly 20.000000000000004 should still be a B.
  const c = Math.round(score * 10) / 10;
  for (const [limit, letter] of LETTERS) if (c <= limit) return letter;
  return "F";
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/**
 * Median error over one completed hold. The window is whatever the runtime
 * actually measured, so this is graded the moment a note clears rather than
 * sliced out of a fixed timeline afterwards.
 */
export function gradeHold(
  points: HistoryPoint[],
  targetMidi: number,
  from: number,
  to: number
): { cents: number | null; coverage: number } {
  const errors: number[] = [];
  let frames = 0;
  for (const p of points) {
    if (p.t < from || p.t > to) continue;
    frames++;
    if (p.midi === null) continue;
    errors.push((p.midi + p.cents / 100 - targetMidi) * 100);
  }
  return {
    cents: errors.length ? Math.round(median(errors)) : null,
    coverage: frames ? errors.length / frames : 0,
  };
}

/**
 * Roll the per-note results into a final grade. Two things are scored: how in
 * tune each hold was, and how long each note took to find. The second matters
 * because the exercise only advances once you are in tune — so pitch error
 * alone cannot tell a singer who nails every entry apart from one who slides
 * around for seconds first.
 */
export function summarize(
  notes: NoteResult[],
  totalMs: number,
  difficulty: Difficulty
): Grade {
  const n = notes.length || 1;
  const round1 = (x: number) => Math.round(x * 10) / 10;

  const centsTotal = notes.reduce((sum, x) => sum + x.errorCents, 0);
  const findTotal = notes.reduce(
    (sum, x) => sum + findPenalty(x.timeToFindMs, difficulty),
    0
  );
  const found = notes.filter((x) => x.timeToFindMs !== null);
  const scored = notes.filter((x) => !x.missed);

  return {
    letter: letterFor((centsTotal + findTotal) / n),
    meanCents: round1(centsTotal / n),
    meanFindPenalty: round1(findTotal / n),
    score: round1((centsTotal + findTotal) / n),
    meanFindMs: found.length
      ? Math.round(
          found.reduce((sum, x) => sum + (x.timeToFindMs ?? 0), 0) / found.length
        )
      : null,
    notes,
    missedCount: notes.filter((x) => x.missed).length,
    worst:
      scored.length > 0
        ? scored.reduce((a, b) => (b.errorCents > a.errorCents ? b : a))
        : null,
    totalMs,
  };
}

/** A note the singer gave up on. */
export function skippedResult(index: number, target: number): NoteResult {
  return {
    index,
    target,
    cents: null,
    errorCents: SKIPPED_PENALTY_CENTS,
    missed: true,
    timeToFindMs: null,
  };
}
