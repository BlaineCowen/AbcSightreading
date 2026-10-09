/**
 * A teacher's own piece, read from MusicXML (read-musicxml.ts).
 *
 * This model is the truth about the piece: ABC is written from it only for
 * abcjs to draw and play (write-abc.ts), and grading reads the notes from
 * here, never from ABC. Times are in ticks, TICKS to the quarter note, from
 * the start of the piece in written order (repeats are not unrolled: abcjs
 * plays them from the barlines, and a bar keeps the number printed on it).
 */

/** Ticks per quarter note: holds sixteenths, triplets and sextuplets exactly. */
export const TICKS = 48;

export const PIECE_VERSION = 1;

export type Clef = "treble" | "treble-8" | "bass" | "alto" | "tenor" | "perc";

export type Pitch = { step: "C" | "D" | "E" | "F" | "G" | "A" | "B"; alter: number; octave: number };

export type Lyric = { text: string; syllabic: "single" | "begin" | "middle" | "end"; extend?: boolean };

export type PieceNote = {
  /** Index into `PieceScore.measures`. */
  measure: number;
  /** Staff within the part, from 1. */
  staff: number;
  /** The MusicXML voice, as written ("1", "2", "5"...). */
  voice: string;
  /** Ticks from the start of the piece. */
  start: number;
  /** Sounding length in ticks. */
  length: number;
  rest: boolean;
  /** A rest the score does not show (print-object="no"), or a whole-bar rest. */
  hidden?: boolean;
  wholeBar?: boolean;
  /** As written on the part (a B-flat clarinet's written D is concert C). */
  written?: Pitch;
  /** Sounding MIDI number. */
  midi?: number;
  /** Stacked on the note before it, sharing its start (a chord). */
  chord?: boolean;
  tieStart?: boolean;
  tieStop?: boolean;
  /** Inside a tuplet: `actual` notes in the time of `normal`. */
  tuplet?: { actual: number; normal: number; start?: boolean; stop?: boolean };
  lyric?: Lyric;
};

export type PieceMeasure = {
  /** The number printed on the bar ("0" for a pickup, "12a" if the score says so). */
  label: string;
  start: number;
  length: number;
  time: { beats: number; beatType: number };
  /** Quarter notes a minute, where the score sets a tempo. */
  tempo?: number;
  /** A pickup or a bar the score marks as not counted. */
  implicit?: boolean;
  repeatStart?: boolean;
  repeatEnd?: boolean;
  /** A volta bracket that starts here ("1", "2", "1, 2"). */
  endingStart?: string;
  /** The bracket ends on this bar: closed (stop) or open (discontinue). */
  endingStop?: "stop" | "discontinue";
};

export type KeyChange = { measure: number; fifths: number; mode: "major" | "minor" };
export type ClefChange = { measure: number; staff: number; clef: Clef };

export type PiecePart = {
  id: string;
  name: string;
  abbreviation?: string;
  /** The MIDI program the file asked for (0-127), if it asked. */
  sourceProgram?: number;
  /** The nearest instrument we can play (src/lib/instruments.ts). */
  program: number;
  /** Written to sounding, in semitones (-2 for a B-flat clarinet). */
  transpose: number;
  staves: number;
  /** Clefs and keys as written, from bar 1. */
  clefs: ClefChange[];
  keys: KeyChange[];
  /** Notes in the order the file lists them within each bar. */
  notes: PieceNote[];
};

export type PieceScore = {
  version: number;
  title: string;
  composer?: string;
  parts: PiecePart[];
  measures: PieceMeasure[];
  /** What was left out, for the import summary ("3 grace notes"). */
  warnings: string[];
};

/** Sounding MIDI for a written pitch. */
export function midiOfPitch(p: Pitch): number {
  const semis = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[p.step];
  return (p.octave + 1) * 12 + semis + p.alter;
}

/** Notes of one part that sound, chords included. */
export function soundingNotes(part: PiecePart): PieceNote[] {
  return part.notes.filter((n) => !n.rest);
}

/** The bar index whose printed number is `label`, the first one if repeated. */
export function measureByLabel(score: PieceScore, label: string): number {
  return score.measures.findIndex((m) => m.label === label);
}

/** "4 parts, 64 bars". */
export function describeScore(score: PieceScore): string {
  const parts = `${score.parts.length} part${score.parts.length === 1 ? "" : "s"}`;
  const bars = `${score.measures.length} bar${score.measures.length === 1 ? "" : "s"}`;
  return `${parts}, ${bars}`;
}
