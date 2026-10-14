import { midiOfPitch, type KeyChange, type PiecePart, type PieceScore, type Pitch } from "./model";

/**
 * A piece moved into another key (the director's Key, PieceViewer): the
 * model itself, so the ABC written from it has the right key signature on
 * every line and the sound comes from the same notes. (abcjs's own
 * visualTranspose drew the first line's key and a different one on every line
 * after.)
 *
 * The new key is the one with fewer accidentals (Gb over F# only at six). Each
 * note moves by the same number of letter steps as the key's tonic, so it is
 * spelled as the new key spells it: E minor down two is D minor, its F sharp
 * an E, and a chromatic note keeps its sharp or flat relative to the key. A
 * transposing instrument's written key moves with the concert key.
 */

const LETTERS = ["C", "D", "E", "F", "G", "A", "B"] as const;
const NATURAL = [0, 2, 4, 5, 7, 9, 11];
/** The major tonic's letter for each key signature, -7 (Cb) to 7 (C#). */
const MAJOR_TONIC = "CGDAEBFCGDAEBFC";

/** A key signature moved by `semis` semitones, -5 to 6 sharps. */
export function movedFifths(fifths: number, semis: number): number {
  const n = ((((fifths + 7 * semis) % 12) + 12) % 12);
  return n > 6 ? n - 12 : n;
}

function tonicLetter(fifths: number, mode: KeyChange["mode"]): number {
  const major = LETTERS.indexOf(MAJOR_TONIC[Math.max(-7, Math.min(7, fifths)) + 7] as (typeof LETTERS)[number]);
  // The relative minor's tonic is two letters below the major's.
  return mode === "minor" ? (major + 5) % 7 : major;
}

/** Letter steps from a key to the same key moved by `semis` (in the same direction, under an octave). */
export function letterSteps(key: Pick<KeyChange, "fifths" | "mode">, semis: number): number {
  if (semis === 0) return 0;
  const steps = (tonicLetter(movedFifths(key.fifths, semis), key.mode) - tonicLetter(key.fifths, key.mode) + 7) % 7;
  return semis > 0 ? steps : steps === 0 ? 0 : steps - 7;
}

export function transposePitch(p: Pitch, steps: number, semis: number): Pitch {
  const target = midiOfPitch(p) + semis;
  let abs = p.octave * 7 + LETTERS.indexOf(p.step) + steps;
  const spell = (a: number): Pitch => {
    const octave = Math.floor(a / 7);
    const letter = ((a % 7) + 7) % 7;
    return { step: LETTERS[letter], octave, alter: target - ((octave + 1) * 12 + NATURAL[letter]) };
  };
  // A note already odd in its key (a C flat in F sharp) can come out past a
  // double sharp or flat, which no score shows: spell it on the next letter.
  let out = spell(abs);
  while (out.alter > 2) out = spell(++abs);
  while (out.alter < -2) out = spell(--abs);
  return out;
}

function transposePart(part: PiecePart, semis: number): PiecePart {
  const first = part.keys[0] ?? { measure: 0, fifths: 0, mode: "major" as const };
  const steps = letterSteps(first, semis);
  return {
    ...part,
    keys: part.keys.map((k) => ({ ...k, fifths: movedFifths(k.fifths, semis) })),
    notes: part.notes.map((n) =>
      n.rest ? n : { ...n, written: n.written ? transposePitch(n.written, steps, semis) : n.written, midi: n.midi === undefined ? n.midi : n.midi + semis },
    ),
  };
}

export function transposeScore(score: PieceScore, semis: number): PieceScore {
  if (!semis) return score;
  return { ...score, parts: score.parts.map((p) => transposePart(p, semis)) };
}
