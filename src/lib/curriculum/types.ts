import type { Span } from "../unison-pools";

/**
 * Curriculum tracks: a step-by-step sequence for one instrument, which a
 * teacher subscribes to and finds in the preset menu (see
 * src/lib/curriculum/tracks.ts). Each step is a pair: a rhythm drill that
 * brings in the step's new rhythm, and a note exercise that brings in its new
 * notes on rhythms learned at least two steps before (RHYTHM_LEAD), so a new
 * rhythm is never loaded with new notes at once.
 *
 * Ids are stored against class progress, assignments and teachers' own
 * versions of a step: never rename or reuse one.
 */

export type TrackFamily = "band" | "strings" | "choir" | "piano";
export type TrackPartKind = "rhythm" | "notes";

/** What the Unison page is set to for one half of a step. Pitches are written pitch. */
export interface TrackPart {
  rhythmOnly: boolean;
  /** Rhythm names (src/resources/rhythms.ts), all of one meter kind. */
  rhythms: string[];
  /** The meter pool: one is drawn per exercise. */
  meters: string[];
  measures: number;
  bpm: number;
  /** Ties across the barline. */
  ties: boolean;
  /** Notes only: written keys (the Unison page's key names), drawn from. */
  keys?: string[];
  /** Notes only: scale degrees 1-7 and chromatic ones (raised / lowered against the key). */
  scaleDegrees?: number[];
  sharps?: number[];
  flats?: number[];
  /** Notes only: scale steps around do, placed for each key from the instrument's anchor. */
  span?: Span;
  /** Notes only: the largest skip, in scale steps (1 a 2nd, 2 a 3rd, 4 a 5th). */
  maxSkip?: number;
  /** Notes only: written over a chord progression (the page's option). Off while the line only steps, where it narrows it. */
  progressions?: boolean;
}

export interface TrackStep {
  /** Permanent. */
  id: string;
  number: number;
  /** A heading for a few steps together: "First notes", "New keys". */
  unit: string;
  title: string;
  /** What the rhythm drill brings in, in a teacher's words. */
  newRhythm: string;
  /** What the note exercise brings in; absent before notes start. */
  newNotes?: string;
  rhythm: TrackPart;
  notes?: TrackPart;
}

export interface Track {
  /** Permanent: "band-trumpet". */
  id: string;
  family: TrackFamily;
  /** "Trumpet". */
  name: string;
  /** "Beginner band". */
  level: string;
  /** One line for the catalogue. */
  blurb: string;
  clef: "treble" | "bass" | "alto" | "tenor";
  /** MIDI program the exercise plays on (src/lib/instruments.ts). */
  instrumentProgram: number;
  /** Playback transpose: written to sounding, in semitones (B♭ trumpet −2). */
  transposeSemitones: number;
  /** noteArray index the span's do is placed at or above, for each key (rangeForSpan). */
  anchor: number;
  /** Written range the track stays within, noteArray indices, for the catalogue and checks. */
  range: { min: number; max: number };
  /** A pastel for its card: sky, mint, peach, butter. */
  color: "sky" | "mint" | "peach" | "butter";
  steps: TrackStep[];
}
