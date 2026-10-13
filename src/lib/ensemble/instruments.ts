import { READERS, type Reader, type ReaderFamily } from "../readers";

/**
 * What an ensemble can be built from: the voices and instruments of the Unison
 * page's Reading as pill (readers.ts), each with the range it plays at concert
 * pitch, so parts can be fitted to it, and how it reads.
 *
 * Ranges are the readers' own, a first-year player's (the band and orchestra
 * courses' `range`, TMEA's for the four voice parts), so an exercise stays
 * inside what a young section can play. Ids are a reader's id and are stored
 * in presets and links: never rename one.
 */
export type EnsembleInstrument = {
  id: string;
  name: string;
  /** On the staff after the first system (abcjs `snm`). */
  short: string;
  family: ReaderFamily;
  /** The ABC clef the part is read in. */
  clef: string;
  /** Concert (sounding) range, noteArray indices (C4 = 14). */
  concert: { min: number; max: number };
  /**
   * Written to sounding in semitones (B♭ trumpet −2, alto sax −9, a tenor's
   * treble-8 −12): the written note is this far above the sound, and playback
   * moves it back (`transpose=` on the voice).
   */
  transpose: number;
  /** Its sound (instruments.ts); voices sing on choir "ah". */
  program: number;
};

/** Diatonic steps for a transposition in semitones (−2 is a step, −9 a sixth, −12 an octave). */
export const stepsFor = (semitones: number) => Math.round((semitones * 7) / 12);

const SHORT: Record<string, string> = {
  soprano: "S", alto: "A", tenor: "T", bass: "B",
  "band-flute": "Fl", "band-oboe": "Ob", "band-clarinet": "Cl", "band-bassoon": "Bsn",
  "band-alto-sax": "A.Sx", "band-tenor-sax": "T.Sx", "band-bari-sax": "B.Sx",
  "band-trumpet": "Tpt", "band-horn": "Hn", "band-trombone": "Tbn", "band-euphonium": "Euph", "band-tuba": "Tba",
  "orch-violin": "Vln", "orch-viola": "Vla", "orch-cello": "Vc", "orch-bass": "Cb",
};

/** Choir "ah" (instruments.ts). */
const VOICE_PROGRAM = 52;

function fromReader(r: Reader): EnsembleInstrument {
  // A tenor's treble-8: its range is where it sounds, read an octave up.
  const transpose = r.clef === "treble-8" ? -12 : r.transposeSemitones;
  const shift = r.clef === "treble-8" ? 0 : stepsFor(r.transposeSemitones);
  return {
    id: r.id,
    name: r.name,
    short: SHORT[r.id] ?? r.name.slice(0, 4),
    family: r.family,
    clef: r.clef,
    concert: { min: r.range.min + shift, max: r.range.max + shift },
    transpose,
    program: r.instrumentProgram ?? VOICE_PROGRAM,
  };
}

/** Every instrument, in score order: woodwinds and brass, then voices, then strings. */
export const ENSEMBLE_INSTRUMENTS: EnsembleInstrument[] = [
  ...READERS.filter((r) => r.family === "band"),
  // The four parts, not the plain treble and bass voices (a choir has parts).
  ...READERS.filter((r) => r.family === "voice" && r.tmeaPart),
  ...READERS.filter((r) => r.family === "strings"),
].map(fromReader);

export const ensembleInstrument: Record<string, EnsembleInstrument> = Object.fromEntries(ENSEMBLE_INSTRUMENTS.map((i) => [i.id, i]));

/** Where an instrument sits in the score (its place in ENSEMBLE_INSTRUMENTS). */
export const scoreOrder = (id: string) => ENSEMBLE_INSTRUMENTS.findIndex((i) => i.id === id);
