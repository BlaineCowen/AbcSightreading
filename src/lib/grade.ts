import { scoreFromAbc } from "./musicxml";
import { midiOf } from "./tools/context";
import type { HistoryPoint } from "./tuner/pitch-history";

/**
 * Grade: sing the Unison exercise into the microphone, one note at a time.
 *
 * Built on the scale challenge (tuner/scale-challenge.ts), made for reading
 * rather than drilling a scale: the cursor waits on each note until it is sung
 * (in any octave, so a tenor can read a treble line) and held for as long as it
 * is written; how quickly each note was found is what the score mostly
 * measures, with some room on intonation; and a note can only lose so much, so
 * one note someone was stuck on does not sink the exercise.
 *
 * The numbers here are starting points, meant to be tuned by singing.
 * Tests: tests/unit/grade.test.ts.
 */

/** Within this of the target, in any octave, counts as the note: half a semitone. */
export const TOLERANCE_CENTS = 50;
/**
 * How long a note must be on pitch to earn its credit: a moment, whatever its
 * length. Holding the whole written length felt too long (the detector takes a
 * moment to lock on), and half of it moved the cursor on ahead of the beat.
 * Now the credit comes quickly and the cursor keeps time: see noteMsFor.
 */
export const CREDIT_MS = 250;
/** Never more than this share of a short note, so a quick eighth can still be caught. */
export const CREDIT_SHARE = 0.8;
/** Shortest credit asked for: detection needs about this long to be sure. */
export const MIN_CREDIT_MS = 150;
/** A hold survives a lapse this long (a consonant, a vibrato swing). */
export const HOLD_GRACE_MS = 250;
/** Finding a note within this many beats of it being shown costs nothing. */
export const FREE_FIND_BEATS = 1;
/** Each further beat of hunting costs this many points, */
export const FIND_POINTS_PER_BEAT = 25;
/** up to this many. */
export const FIND_MAX = 50;
/** Held this close to the target, intonation costs nothing; */
export const FREE_CENTS = 20;
/** each cent further costs a point, up to this many. */
export const CENTS_MAX = 25;
/** Hearing the note itself: the most the note can then score. */
export const HELP_NOTE_CAP = 50;
/** Hearing the tonic or the tonic chord: points off, once per note. */
export const HELP_KEY_COST = 10;
/** No note loses more than this, however stuck; a skipped note loses exactly this. */
export const MAX_LOSS = 60;

/** One note to sing. `cursor` is its place among the score's notes and rests. */
export type GradeNote = { midi: number; beats: number; cursor: number };

/**
 * The notes to sing, in order, from the exercise's ABC: rests left out (the
 * singer rests; nothing waits), tied notes as one held note, and the playback
 * transposition added so it matches what the page plays.
 */
export function gradeNotes(abc: string, transpose = 0): GradeNote[] {
  const score = scoreFromAbc(abc);
  const part = score.parts[0];
  if (!part) return [];
  const out: GradeNote[] = [];
  let cursor = 0;
  let tied: GradeNote | null = null;
  for (const measure of part.measures) {
    for (const n of measure.notes) {
      const here = cursor++;
      if (n.rest || !n.pitch) {
        tied = null;
        continue;
      }
      const beats = n.length / 8;
      if (tied && n.tieStop) {
        tied.beats += beats;
      } else {
        tied = { midi: midiOf(n.pitch) + transpose, beats, cursor: here };
        out.push(tied);
      }
      if (!n.tieStart) tied = null;
    }
  }
  return out;
}

/** How far a sung pitch is from the target's pitch class, in cents, -600..600. */
export function centsOffAnyOctave(sungMidi: number, targetMidi: number): number {
  const c = ((((sungMidi - targetMidi) * 100) % 1200) + 1200) % 1200;
  return c > 600 ? c - 1200 : c;
}

/** A note's written length at this tempo (quarter notes a minute), in ms. */
export const noteMsFor = (beats: number, bpm: number) => (beats * 60_000) / Math.max(1, bpm);

/** How long a note must be on pitch to earn its credit. The cursor still waits out its written length. */
export const creditMsFor = (beats: number, bpm: number) =>
  Math.max(MIN_CREDIT_MS, Math.min(CREDIT_MS, noteMsFor(beats, bpm) * CREDIT_SHARE));

const SYLLABLES = ["do", "di", "re", "ri", "mi", "fa", "fi", "so", "si", "la", "li", "ti"];
/** Movable do for a pitch, given do's pitch class (the exercise's key). */
export const solfegeOf = (midi: number, doPc: number) => SYLLABLES[(((Math.round(midi) - doPc) % 12) + 12) % 12];

const STEP_NAMES = ["", "a half step", "a step", "a third", "a third", "a fourth", "a tritone"];

/**
 * What the card says while a note is waited on: the note sung, and which way
 * and how far to the one asked for, in solfège. "A little high" said nothing
 * about a singer who was a third away.
 */
export function guidance(o: { sung: number | null; target: number; doPc: number; onTarget: boolean }): string {
  const want = solfegeOf(o.target, o.doPc);
  if (o.onTarget) return "That's it, hold it";
  if (o.sung === null) return `Sing ${want}`;
  const cents = centsOffAnyOctave(o.sung, o.target);
  if (Math.abs(cents) < 100) return cents > 0 ? `Close: a little high for ${want}` : `Close: a little low for ${want}`;
  const semis = Math.round(-cents / 100);
  const way = semis > 0 ? "up" : "down";
  return `You're singing ${solfegeOf(o.sung, o.doPc)}. Go ${way} ${STEP_NAMES[Math.abs(semis)]} to ${want}`;
}

export type Help = { heardNote: boolean; heardKey: boolean };

export type NoteResult = {
  midi: number;
  /** Beats from the note being shown to the hold starting; null when skipped. */
  findBeats: number | null;
  /** Median signed cents over the hold, in any octave; null when skipped or unheard. */
  cents: number | null;
  help: Help;
  skipped: boolean;
  /** Passed by: the singer went on to the next note without singing this one. */
  missed?: boolean;
  score: number;
};

/** One note's score, 100 down to 100 - MAX_LOSS. */
export function noteScore(o: { findBeats: number | null; cents: number | null; help: Help; skipped?: boolean }): number {
  if (o.skipped || o.findBeats === null) return 100 - MAX_LOSS;
  const find = Math.min(FIND_MAX, Math.max(0, o.findBeats - FREE_FIND_BEATS) * FIND_POINTS_PER_BEAT);
  const tune = Math.min(CENTS_MAX, Math.max(0, Math.abs(o.cents ?? 0) - FREE_CENTS));
  let score = 100 - find - tune - (o.help.heardKey ? HELP_KEY_COST : 0);
  if (o.help.heardNote) score = Math.min(score, HELP_NOTE_CAP);
  return Math.round(Math.max(100 - MAX_LOSS, score));
}

/** Median cents over a completed hold, from the pitch history, in any octave. */
export function holdCents(points: HistoryPoint[], targetMidi: number, from: number, to: number): number | null {
  const errs: number[] = [];
  for (const p of points) {
    if (p.t < from || p.t > to || p.midi === null) continue;
    errs.push(centsOffAnyOctave(p.midi + p.cents / 100, targetMidi));
  }
  if (!errs.length) return null;
  errs.sort((a, b) => a - b);
  const m = errs.length >> 1;
  return Math.round(errs.length % 2 ? errs[m] : (errs[m - 1] + errs[m]) / 2);
}

export type GradeResult = { notes: NoteResult[]; score: number; letter: string };

export const letterFor = (score: number) =>
  score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 60 ? "D" : "F";

/** The exercise's score: the average of its notes. */
export function summarize(notes: NoteResult[]): GradeResult {
  const score = notes.length ? Math.round(notes.reduce((a, n) => a + n.score, 0) / notes.length) : 0;
  return { notes, score, letter: letterFor(score) };
}
