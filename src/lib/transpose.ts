/**
 * Playback in a different key from the one on the page.
 *
 * The notation is left exactly as written and only the sound moves. That is the
 * point: a singer reads the exercise in the key it was generated in, while it
 * sounds wherever the choir can actually sing it - or wherever a transposing
 * instrument needs it.
 *
 * abcjs does this for us. `midiTranspose` is read in abc_midi_sequencer and
 * shifts every note as the MIDI sequence is built, downstream of the visual
 * object, so nothing about the rendered score changes. It composes with the
 * per-voice `transpose=-12` on the tenor clef rather than fighting it.
 */

/** Semitones, either direction. An octave each way is more than anyone needs. */
export const MIN_TRANSPOSE = -12;
export const MAX_TRANSPOSE = 12;

export function clampTranspose(semitones: number): number {
  if (!Number.isFinite(semitones)) return 0;
  return Math.max(MIN_TRANSPOSE, Math.min(MAX_TRANSPOSE, Math.round(semitones)));
}

const PITCH_CLASS: Record<string, number> = {
  C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5,
  "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11, Cb: 11,
};

const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

/**
 * What key the exercise will sound in.
 *
 * Only ever a label - the transposition itself is in semitones, which is
 * unambiguous, and this exists so the control can say "sounds in C" rather than
 * leaving the reader to count. Note that -7 and +5 produce the same NAME an
 * octave apart, which is exactly why the control is in semitones and not a key
 * picker.
 *
 * Spelling follows the written key: a flat key transposes to flat names and a
 * sharp key to sharp ones, so F + 2 reads as G rather than the same pitch spelled
 * oddly.
 */
export function soundingKey(writtenKey: string, semitones: number): string {
  const minor = /m$/.test(writtenKey);
  const tonic = minor ? writtenKey.slice(0, -1) : writtenKey;
  const base = PITCH_CLASS[tonic];
  if (base === undefined) return "";
  const pc = (((base + semitones) % 12) + 12) % 12;
  // Flat-side keys are the ones whose key signature is written in flats: any
  // tonic already spelled with a flat, plus F major and the flat-side minors.
  const FLAT_SIDE = new Set(["F", "Dm", "Gm", "Cm", "Fm"]);
  const flatSide = tonic.includes("b") || FLAT_SIDE.has(writtenKey);
  return (flatSide ? FLAT_NAMES : SHARP_NAMES)[pc] + (minor ? "m" : "");
}

/** "Sounds in C", or what to show when nothing is being shifted. */
export function transposeLabel(writtenKey: string, semitones: number): string {
  if (semitones === 0) return "Sounds as written.";
  const key = soundingKey(writtenKey, semitones);
  const dir = semitones > 0 ? "up" : "down";
  const n = Math.abs(semitones);
  const amount = `${n} semitone${n === 1 ? "" : "s"}`;
  return key
    ? `Written in ${writtenKey}, sounds in ${key} — ${dir} ${amount}.`
    : `Playback ${dir} ${amount}.`;
}
