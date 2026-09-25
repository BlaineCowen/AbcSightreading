import { NOTE_TO_SOLFEGE, type NoteName, type SolfegeName } from "./types";

export const NOTES: NoteName[] = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];

export const A4_MIN = 415;
export const A4_MAX = 466;
export const A4_DEFAULT = 440;

export function clampA4(hz: number): number {
  if (!Number.isFinite(hz)) return A4_DEFAULT;
  return Math.min(A4_MAX, Math.max(A4_MIN, Math.round(hz)));
}

export interface NoteFromFreq {
  name: NoteName;
  octave: number;
  /** Signed deviation from the nearest equal-tempered note, -50..50. */
  cents: number;
  midi: number;
}

export function freqToNote(freq: number, a4 = A4_DEFAULT): NoteFromFreq {
  const midiFloat = 69 + 12 * Math.log2(freq / a4);
  const midi = Math.round(midiFloat);
  return {
    name: NOTES[((midi % 12) + 12) % 12],
    octave: Math.floor(midi / 12) - 1,
    cents: Math.round((midiFloat - midi) * 100),
    midi,
  };
}

export function noteToFreq(
  name: NoteName,
  octave: number,
  a4 = A4_DEFAULT
): number {
  const midi = (octave + 1) * 12 + NOTES.indexOf(name);
  return a4 * Math.pow(2, (midi - 69) / 12);
}

const FLAT_NAMES: Partial<Record<NoteName, string>> = {
  "C#": "Db",
  "D#": "Eb",
  "F#": "Gb",
  "G#": "Ab",
  "A#": "Bb",
};
const FLAT_SOLFEGE: Partial<Record<NoteName, string>> = {
  "C#": "Ra",
  "D#": "Me",
  "F#": "Se",
  "G#": "Le",
  "A#": "Te",
};

/** Display labels for a wheel wedge: [primary, alternate?]. */
export function wedgeLabels(
  note: NoteName,
  key: NoteName,
  solfege: boolean
): [string, string?] {
  if (!solfege) {
    const flat = FLAT_NAMES[note];
    return flat ? [note.replace("#", "\u266f"), flat.replace("b", "\u266d")] : [note];
  }
  const relative = NOTES[(NOTES.indexOf(note) - NOTES.indexOf(key) + 12) % 12];
  const alt = FLAT_SOLFEGE[relative];
  return alt ? [NOTE_TO_SOLFEGE[relative], alt] : [NOTE_TO_SOLFEGE[relative]];
}

/** Movable-do: solfège syllable of `note` relative to `key`. */
export function solfegeFor(note: NoteName, key: NoteName): SolfegeName {
  const relative = (NOTES.indexOf(note) - NOTES.indexOf(key) + 12) % 12;
  return NOTE_TO_SOLFEGE[NOTES[relative]];
}
