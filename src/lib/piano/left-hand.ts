/**
 * The accompaniment: each chord of the progression played in a pattern for
 * as long as the chord lasts. A chord's notes come from voicing.ts, so the
 * bass is the root (held, fifth, rocking, broken, waltz) or the close shape a
 * beginner learns (block, Alberti). A chord's altered note (harmonic minor's
 * raised leading tone, a secondary dominant's third) carries its accidental.
 */
import type { LeftHandPattern } from "./levels";
import { bassRoot, blockChord, chordAlter, chordDegrees, atOrAbove, degreeOf, playedDegrees } from "./voicing";

/**
 * One thing a hand plays: a note, a chord (several pitches) or a rest.
 * Lengths in 32nds. `alters` runs beside `pitches`: +1 a sharp, -1 a flat
 * against the key signature (absent, as written in the key).
 */
export interface PianoNote {
  pitches: number[];
  length: number;
  rest?: boolean;
  alters?: number[];
  /** A dynamic marked on this note (p, mf, f). */
  dynamic?: string;
}

/** The left hand's highest note: B3, under middle C, where the right hand begins. */
export const LEFT_HAND_TOP = 13;
/** And its lowest: E2. */
export const LEFT_HAND_BOTTOM = 2;

export interface ChordSpan {
  name: string;
  /** Length in 32nds. */
  length: number;
  /** Starts on beat 1 of its bar. */
  barStart: boolean;
}

/** The chord's root in the bass, with its fifth and third above it, close (broken chords, the waltz). */
function rootShape(key: string, name: string): { root: number; third: number; fifth: number; upper: number[] } {
  const d = chordDegrees(name);
  const root = bassRoot(key, d[0]);
  const third = atOrAbove(key, d[1], root + 1);
  const fifth = atOrAbove(key, d[2], root + 1);
  // The waltz's chord: the chord's other notes just above the root (a seventh chord's third and seventh).
  const played = playedDegrees(name).slice(1);
  const upper = played.map((x) => atOrAbove(key, x, root + 1)).sort((a, b) => a - b);
  return { root, third, fifth, upper };
}

/** Where the right hand plays the chords when the tune is in the left: C4 to D5, the first chord near middle C. */
export const RIGHT_HAND_CHORD_RANGE = { low: 14, high: 22, home: 14 };

/**
 * The accompaniment for a whole exercise: each span in the pattern, the last
 * held as the piece's final chord (a moving figure stops on it). The left
 * hand's by default; `range` puts block chords in the right hand instead,
 * when the tune is in the left. In 6/8 (`beatUnits` 12) a beat's figure is
 * three eighths: root, fifth, third, or Alberti's low, high, middle, high,
 * middle, high across the bar.
 */
export function writeLeftHand(
  key: string,
  spans: ChordSpan[],
  pattern: LeftHandPattern,
  beatUnits: number,
  range: { low: number; high: number; home: number } = { low: LEFT_HAND_BOTTOM, high: LEFT_HAND_TOP, home: 7 },
): PianoNote[] {
  const compound = beatUnits === 12;
  const out: PianoNote[] = [];
  let previous: number[] | null = null;
  spans.forEach((span, i) => {
    const last = i === spans.length - 1;
    const block = blockChord(key, span.name, previous, range.low, range.high, range.home);
    previous = block;
    const shape = rootShape(key, span.name);
    const note = (pitches: number[], length: number): PianoNote => {
      const alters = pitches.map((p) => chordAlter(span.name, degreeOf(key, p)));
      return alters.some((a) => a !== 0) ? { pitches, length, alters } : { pitches, length };
    };
    const beats = Math.max(1, Math.round(span.length / beatUnits));
    const each = (pitches: number[][], unit: number) => {
      const n = Math.round(span.length / unit);
      for (let k = 0; k < n; k++) out.push(note(pitches[k % pitches.length], unit));
    };
    const held = (pitches: number[]) => out.push(note(pitches, span.length));
    // The final chord is held, whatever the pattern: the piece ends on it.
    const p: LeftHandPattern = last && pattern !== "root" && pattern !== "fifth" ? (pattern === "rocking" ? "fifth" : "block") : pattern;
    const [lo, mid, hi] = block;
    switch (p) {
      case "root":
        held([shape.root]);
        break;
      case "fifth":
        held([shape.root, shape.fifth]);
        break;
      case "block":
        held(block);
        break;
      case "blockBeats":
        each([block], beatUnits);
        break;
      case "rocking":
        // Root and fifth in turn, one a beat: the first moving bass a beginner plays.
        each([[shape.root], [shape.fifth]], beatUnits);
        break;
      case "oompah":
        // Root, chord, fifth, chord: the bass on the strong beats, the chord between.
        each([[shape.root], shape.upper, [shape.fifth], shape.upper], beatUnits);
        break;
      case "broken":
        // Root, fifth, third, fifth: one note a beat.
        each([[shape.root], [shape.fifth], [shape.third], [shape.fifth]], beatUnits);
        break;
      case "arpeggio":
        // Up the chord and back: root, third, fifth, third.
        each([[shape.root], [shape.third], [shape.fifth], [shape.third]], beatUnits);
        break;
      case "brokenEighths":
        if (compound) each([[shape.root], [shape.fifth], [shape.third]], beatUnits / 3);
        else each([[shape.root], [shape.fifth], [shape.third], [shape.fifth]], beatUnits / 2);
        break;
      case "waltz":
        // Root, then the chord on the other beats.
        out.push(note([shape.root], beatUnits));
        for (let k = 1; k < beats; k++) out.push(note(shape.upper, beatUnits));
        break;
      case "alberti":
        // Low, high, middle, high, in eighths, on the close shape.
        if (compound) each([[lo], [hi], [mid], [hi], [mid], [hi]], beatUnits / 3);
        else each([[lo], [hi], [mid], [hi]], beatUnits / 2);
        break;
      case "albertiSixteenths":
        each([[lo], [hi], [mid], [hi]], beatUnits / 4);
        break;
    }
  });
  return out;
}
