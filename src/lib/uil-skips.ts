/**
 * The melodic skips UIL lists for its beginning levels, by chord. Anything a
 * level does not list is sung by step. From UIL's current wording, which
 * Blaine quoted on 7 October 2026 (notes/uil-criteria.md):
 *
 *   Level 1  I: 3rds do-mi, mi-sol; 4th do-sol1 (the sol below)
 *            IV: 3rds fa-la, do-la1 (the la below)
 *            V: 3rds ti-re, sol-ti
 *   Level 2  the same, and 4ths do-fa (IV, "expected") and sol-re (V)
 *   Level 3  the same, and 5ths do-sol (I), do-fa1 (IV, "in bass lines"),
 *            sol-re (V); re-fa in V7 ("expected")
 *
 * No skip is listed for ii or vi (nor V7 below Level 3), so those are sung by step. A skip
 * belongs to its chord: it may be sung while that chord sounds, or leaving it
 * (do down to sol as I goes to V, the bass's move in "Oh Lovely Spring").
 * Tests: tests/unit/uil-skips.test.ts.
 */
import type { Note } from "./types";

export type SkipLevel = 1 | 2 | 3;

/**
 * One listed skip: the chord's root, its lower and upper note, how far apart
 * (diatonic steps), the first level it appears at; `seventh` for V7's own,
 * `lowest` for one only the lowest part may sing.
 */
type Listed = { root: number; low: number; high: number; apart: number; level: SkipLevel; seventh?: boolean; lowest?: boolean };

// Degrees: do 0, re 1, mi 2, fa 3, sol 4, la 5, ti 6.
const LISTED: Listed[] = [
  // I
  { root: 0, low: 0, high: 2, apart: 2, level: 1 }, // do-mi
  { root: 0, low: 2, high: 4, apart: 2, level: 1 }, // mi-sol
  { root: 0, low: 4, high: 0, apart: 3, level: 1 }, // do-sol1: sol below do
  // IV
  { root: 3, low: 3, high: 5, apart: 2, level: 1 }, // fa-la
  { root: 3, low: 5, high: 0, apart: 2, level: 1 }, // do-la1: la below do
  { root: 3, low: 0, high: 3, apart: 3, level: 2 }, // do-fa: fa above do
  // V
  { root: 4, low: 6, high: 1, apart: 2, level: 1 }, // ti-re
  { root: 4, low: 4, high: 6, apart: 2, level: 1 }, // sol-ti
  { root: 4, low: 1, high: 4, apart: 3, level: 2 }, // sol-re: a fourth, so the re below sol
  // Level 3's fifths, and V7's skip
  { root: 0, low: 0, high: 4, apart: 4, level: 3 }, // do-sol: sol above do
  { root: 3, low: 3, high: 0, apart: 4, level: 3, lowest: true }, // do-fa1: fa below do, in bass lines
  { root: 4, low: 4, high: 1, apart: 4, level: 3 }, // sol-re: re above sol
  { root: 4, low: 1, high: 3, apart: 2, level: 3, seventh: true }, // re-fa in V7
];

/** A chord as the skips read it: its root, and whether it is a seventh chord. */
export type SkipChord = { root: number; triadNotes: number[] };

/** The UIL levels whose skips are this list rather than a largest skip. */
export function skipLevelFor(uilLevel: string | undefined): SkipLevel | null {
  if (uilLevel === "UIL 1") return 1;
  if (uilLevel === "UIL 2") return 2;
  if (uilLevel === "UIL 3") return 3;
  return null;
}

/**
 * Whether moving from `a` to `b` is a step, a repeat, or a skip the level
 * lists. `chords` are the chords it may belong to - the one sounding and the
 * one just left; left out (a restatement's seam, where the chord is not
 * known) any listed skip passes. `lowest`: sung by the lowest part, which
 * alone may take the bass-line skips.
 */
export function listedSkip(level: SkipLevel, a: Note, b: Note, chords?: (SkipChord | null | undefined)[], lowest = true): boolean {
  const apart = Math.abs(b.pitchValue - a.pitchValue);
  if (apart <= 1) return true;
  const [lo, hi] = a.pitchValue < b.pitchValue ? [a, b] : [b, a];
  return LISTED.some(
    (s) =>
      s.level <= level &&
      s.apart === apart &&
      s.low === lo.degree &&
      s.high === hi.degree &&
      (!s.lowest || lowest) &&
      (!chords ||
        chords.some(
          (c) => !!c && ((c.root % 7) + 7) % 7 === s.root && (!s.seventh || c.triadNotes.length >= 4),
        )),
  );
}
