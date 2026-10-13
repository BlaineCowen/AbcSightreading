import type { VoiceNote } from "../types";
import { noteArray } from "../../resources/noteArray";
import { keySignatures } from "../../resources/key-signatures";
import { getDiatonicDegree } from "../prep-params";
import { stepsFor } from "./instruments";

/**
 * A concert part as one instrument reads it: moved by octaves to its register,
 * then written where it reads (B♭ trumpet a step up, alto sax a sixth up), in
 * its written key, each note spelled from its sound.
 *
 * A note's `accidental` is absolute (a natural is the plain letter) and a
 * diatonic note has none; the assembler prints a sign only where the key or
 * the bar does not already give it. So a note is moved by its letter (the
 * interval's steps) and its pitch (the semitones), and the sign is whatever
 * makes the new letter sound right. What was chromatic stays chromatic, raised
 * or lowered as before (fi stays fi), so solfège reads the written part as it
 * read the concert one.
 */

const NATURAL = [0, 2, 4, 5, 7, 9, 11];
const ALTERATION: Record<string, number> = { "double-flat": -2, flat: -1, natural: 0, sharp: 1, "double-sharp": 2 };
const SIGN: Record<number, VoiceNote["accidental"]> = { [-2]: "double-flat", [-1]: "flat", 0: "natural", 1: "sharp", 2: "double-sharp" };

const mod = (a: number, n: number) => ((a % n) + n) % n;
/** Semitones from C,, (noteArray index 0) of a letter-and-octave with an alteration. */
const semitoneOf = (index: number, alteration: number) => Math.floor(index / 7) * 12 + NATURAL[mod(index, 7)] + alteration;

/** What a key's signature does to the letter at `index`: −1, 0 or 1. */
export function keyAlteration(key: string, index: number): number {
  const info = keySignatures[key];
  if (!info) return 0;
  const degree = getDiatonicDegree(mod(index, 7) + 14, info);
  return info.sharps.includes(degree) ? 1 : info.flats.includes(degree) ? -1 : 0;
}

export function writtenNote(note: VoiceNote, o: { concertKey: string; writtenKey: string; octave: number; transpose: number }): VoiceNote {
  if (note.rest) return { ...note };
  const from = note.pitchValue;
  const alteration = note.accidental ? ALTERATION[note.accidental] : keyAlteration(o.concertKey, from);
  const chromatic = alteration - keyAlteration(o.concertKey, from);
  // Written = sounding − transpose (a B♭ trumpet's −2 writes a step up), plus the octave it plays in.
  const index = from + 7 * o.octave - stepsFor(o.transpose);
  const sound = semitoneOf(from, alteration) + 12 * o.octave - o.transpose;
  const writtenAlteration = sound - semitoneOf(index, 0);
  const name = noteArray[index] ?? note.name;
  const out: VoiceNote = { ...note, name, pitchValue: index };
  const info = keySignatures[o.writtenKey];
  if (info && index >= 0 && index < noteArray.length) out.degree = getDiatonicDegree(index, info);
  if (chromatic === 0) {
    out.accidental = null;
    delete out.wasRaised;
  } else {
    out.accidental = SIGN[writtenAlteration] ?? null;
    if (out.accidental === "natural") out.wasRaised = chromatic > 0;
  }
  return out;
}
