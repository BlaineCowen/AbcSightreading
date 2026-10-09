/**
 * The left hand's accompaniment: each chord of the progression played in the
 * level's pattern, for as long as the chord lasts. A chord's notes come from
 * voicing.ts, so the bass is the root (held, fifth, broken, waltz) or the
 * close shape a beginner learns (block, Alberti).
 */
import type { LeftHandPattern } from "./levels";
import { bassRoot, blockChord, chordDegrees, atOrAbove, playedDegrees } from "./voicing";

/** One thing a hand plays: a note, a chord (several pitches) or a rest. Lengths in 32nds. */
export interface PianoNote {
  pitches: number[];
  length: number;
  rest?: boolean;
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

/**
 * The left hand for a whole exercise: each span in the pattern, the last held
 * as the piece's final chord (a broken or Alberti figure stops on it).
 */
export function writeLeftHand(key: string, spans: ChordSpan[], pattern: LeftHandPattern, beatUnits: number): PianoNote[] {
  const out: PianoNote[] = [];
  let previous: number[] | null = null;
  spans.forEach((span, i) => {
    const last = i === spans.length - 1;
    const block = blockChord(key, span.name, previous, LEFT_HAND_BOTTOM, LEFT_HAND_TOP);
    previous = block;
    const shape = rootShape(key, span.name);
    const beats = Math.max(1, Math.round(span.length / beatUnits));
    const each = (pitches: number[][], unit: number) => {
      const n = Math.round(span.length / unit);
      for (let k = 0; k < n; k++) out.push({ pitches: pitches[k % pitches.length], length: unit });
    };
    const held = (pitches: number[]) => out.push({ pitches, length: span.length });
    // The final chord is held, whatever the pattern: the piece ends on it.
    const p: LeftHandPattern = last && pattern !== "root" && pattern !== "fifth" ? "block" : pattern;
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
      case "broken":
        // Root, fifth, third, fifth: one note a beat.
        each([[shape.root], [shape.fifth], [shape.third], [shape.fifth]], beatUnits);
        break;
      case "waltz":
        // Root, then the chord on the other beats.
        out.push({ pitches: [shape.root], length: beatUnits });
        if (beats > 1) {
          for (let k = 1; k < beats; k++) out.push({ pitches: shape.upper, length: beatUnits });
        }
        break;
      case "alberti": {
        // Low, high, middle, high, in eighths, on the close shape.
        const [lo, mid, hi] = block;
        each([[lo], [hi], [mid], [hi]], beatUnits / 2);
        break;
      }
      case "tune":
        throw new Error("A tune is written by the line writer, not as a pattern");
    }
  });
  return out;
}
