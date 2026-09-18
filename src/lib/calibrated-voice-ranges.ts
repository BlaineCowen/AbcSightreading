/**
 * The voice ranges as calibrated by hand on /range-calibration, 26 April 2026
 * (commit 88cf7af), before later commits re-derived them from
 * notes/uil-criteria.md. Kept verbatim so the calibration page can start from
 * them and show what has moved since. Indices into noteArray, which is written
 * an octave above sounding pitch.
 */
export const APRIL_CALIBRATED_RANGES: Record<string, Record<string, [number, number]>> = {
  "UIL 1": {
    Soprano: [22, 30],
    Soprano1: [22, 30],
    Soprano2: [22, 29],
    Alto: [21, 29],
    Tenor: [19, 24],
    Baritone: [14, 20],
    Bass: [14, 21],
    Unison: [21, 28],
  },
  "UIL 2": {
    Soprano: [22, 30],
    Soprano1: [22, 30],
    Soprano2: [22, 29],
    Alto: [21, 28],
    Tenor: [17, 24],
    Baritone: [14, 21],
    Bass: [14, 21],
    Unison: [21, 28],
  },
  "UIL 3": {
    Soprano: [21, 31],
    Soprano1: [21, 31],
    Soprano2: [20, 30],
    Alto: [19, 28],
    Tenor: [16, 24],
    Baritone: [12, 22],
    Bass: [12, 21],
    Unison: [21, 30],
  },
  "UIL 4": {
    Soprano: [21, 31],
    Soprano1: [21, 31],
    Soprano2: [20, 29],
    Alto: [19, 28],
    Tenor: [16, 24],
    Baritone: [12, 22],
    Bass: [12, 21],
    Unison: [21, 30],
  },
  "UIL 5": {
    Soprano: [21, 31],
    Soprano1: [21, 32],
    Soprano2: [20, 31],
    Alto: [19, 28],
    Tenor: [15, 24],
    Baritone: [12, 22],
    Bass: [11, 21],
    Unison: [21, 30],
  },
};

import { noteArray } from "../resources/noteArray";

/**
 * Sounding pitch name for a noteArray index - "C4" is middle C. noteArray is
 * ABC notation an octave above sounding (ABC "C" is index 14 and sounds C3),
 * which is why the range staves draw with octave=-1.
 */
export function soundingNoteName(index: number): string {
  const abc = noteArray[index];
  if (!abc) return `#${index}`;
  const letter = abc.replace(/[,'^_=]/g, "");
  const upper = letter.toUpperCase();
  const abcOctave =
    (letter === upper ? 4 : 5) -
    (abc.match(/,/g) ?? []).length +
    (abc.match(/'/g) ?? []).length;
  return `${upper}${abcOctave - 1}`;
}
