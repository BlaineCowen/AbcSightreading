/**
 * Where a key's notes sit on the keyboard, for the piano writer.
 *
 * Pitches are noteArray indices (src/resources/noteArray.ts): one a letter,
 * C2 = 0, C3 = 7, middle C = 14, always natural letters - the key signature
 * gives the sharps and flats, as on the Unison page. A scale degree is
 * counted from the tonic, 0-based.
 */
import { keySignatures } from "../../resources/key-signatures";
import { chordNamed } from "../unison-progressions";
import { chords as chordTable } from "../../resources/chords";

export const MIDDLE_C = 14;

/** The letter (0 C .. 6 B) of a scale degree in a key. */
export function letterOf(key: string, degree: number): number {
  const root = keySignatures[key]?.rootOffset ?? 0;
  return (((root + degree) % 7) + 7) % 7;
}

/** The scale degree (0-based) of a pitch in a key. */
export function degreeOf(key: string, pitch: number): number {
  const root = keySignatures[key]?.rootOffset ?? 0;
  return (((pitch - root) % 7) + 7) % 7;
}

/** The pitch of `degree` nearest `near` (the lower of two equally near). */
export function nearest(key: string, degree: number, near: number): number {
  const letter = letterOf(key, degree);
  const base = near - ((((near % 7) - letter) % 7) + 7) % 7; // at or below `near`
  return near - base <= base + 7 - near ? base : base + 7;
}

/** The lowest pitch of `degree` at or above `from`. */
export function atOrAbove(key: string, degree: number, from: number): number {
  const letter = letterOf(key, degree);
  return from + ((((letter - (from % 7)) % 7) + 7) % 7);
}

/** A chord's degrees by name (chords.ts, or the progression writer's extras). */
export function chordDegrees(name: string): number[] {
  const c = chordTable.find((x) => x.name === name) ?? chordNamed(name);
  if (!c) throw new Error(`No chord named ${name}`);
  return c.triadNotes;
}

/**
 * Where the right hand sits: its thumb on the tonic at or above middle C, and
 * `reach` steps above it (4 is a five-finger position). Bb's thumb is the B
 * flat above middle C.
 */
export function rightHandPosition(key: string, reach: number): { low: number; high: number } {
  const low = atOrAbove(key, 0, MIDDLE_C);
  return { low, high: low + reach };
}

/** The left hand's five-finger position: the tonic from F2 to E3, five notes up. */
export function leftHandPosition(key: string): { low: number; high: number } {
  const low = bassRoot(key, 0);
  return { low, high: low + 4 };
}

/**
 * A chord's root in the bass, between F2 and E3: one place for each letter,
 * so I is always the same C and V the G below it, the way a beginner's left
 * hand moves between them.
 */
export function bassRoot(key: string, rootDegree: number): number {
  return atOrAbove(key, rootDegree, 3); // F2
}

/**
 * The degrees a left-hand chord plays: a triad whole; a seventh chord as root,
 * third and seventh (the fifth left out), so V7 is the beginner's G-B-F.
 */
export function playedDegrees(name: string): number[] {
  const d = chordDegrees(name);
  return d.length > 3 ? [d[0], d[1], d[3]] : d;
}

/** Every close voicing of the degrees (each inversion, every octave) inside [low, high]. */
function closeVoicings(key: string, degrees: number[], low: number, high: number): number[][] {
  const out: number[][] = [];
  for (let r = 0; r < degrees.length; r++) {
    const order = [...degrees.slice(r), ...degrees.slice(0, r)];
    for (let start = low; start <= high; start++) {
      if (letterOf(key, order[0]) !== ((start % 7) + 7) % 7) continue;
      const v = [start];
      for (const d of order.slice(1)) v.push(atOrAbove(key, d, v[v.length - 1] + 1));
      if (v[v.length - 1] <= high && v[v.length - 1] - v[0] <= 6) out.push(v);
    }
  }
  return out;
}

const motion = (a: number[], b: number[]) => a.reduce((s, x, i) => s + Math.abs(x - (b[i] ?? x)), 0);

/**
 * A block chord for the left hand, close and inside [low, high], moving as
 * little as it can from the last one; the first is in root position, near
 * `home` (C3 for the left hand).
 * So I, IV and V7 come out C-E-G, C-F-A and B-F-G, the shapes a method book
 * teaches.
 */
export function blockChord(key: string, name: string, previous: number[] | null, low: number, high: number, home = 7): number[] {
  const degrees = playedDegrees(name);
  const all = closeVoicings(key, degrees, low, high);
  if (!all.length) throw new Error(`No voicing of ${name} in ${key} between ${low} and ${high}`);
  if (!previous) {
    const rootPos = all.filter((v) => degreeOf(key, v[0]) === degrees[0]);
    const pool = rootPos.length ? rootPos : all;
    return pool.reduce((best, v) => (Math.abs(v[0] - home) < Math.abs(best[0] - home) ? v : best));
  }
  return all.reduce((best, v) => (motion(v, previous) < motion(best, previous) ? v : best));
}
