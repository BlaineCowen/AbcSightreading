import { writable } from "svelte/store";
import type { XmlPitch } from "../musicxml";
import type { NoteName } from "../tuner/types";
import type { MinorSolfege } from "../../resources/solfege";

/**
 * What the practice tools know about the exercise on the page: its ABC and
 * tempo, published by the page, and what they work out from it - the key's
 * do, the meter, and where each part starts. The tuner reads solfège against
 * that do, the metronome can follow the tempo and meter, and the pitch pipe
 * gives each part its first note.
 *
 * Everything is read from the score as written (scoreFromAbc, the MusicXML
 * reader), so the pitches are the sounding ones, octave clefs included. That
 * reading is in exercise-info.ts, with setPracticeContext: it needs abcjs,
 * which only the practice pages that publish an exercise load. Keep abcjs out
 * of this file, or every page with a tool (/tuner) downloads it.
 */

export const practice = writable<{ abc: string | null; bpm: number; minorSolfege: MinorSolfege }>({
  abc: null,
  bpm: 72,
  minorSolfege: "la",
});

export const SESSION_KEY = "abc-tools-session-exercises";
function readCount() {
  try {
    return Number(sessionStorage.getItem(SESSION_KEY) ?? 0) || 0;
  } catch {
    return 0;
  }
}
/** Exercises generated in this browser tab - the practice timer shows it. */
export const exercisesThisSession = writable(typeof window === "undefined" ? 0 : readCount());

export interface StartingPitch {
  part: string;
  midi: number;
  /** As written: "B♭3". */
  label: string;
  /** Movable do (in minor, la- or do-based as the page sings it): "Mi", "Sol". */
  solfege: string;
}

export interface ExerciseInfo {
  /** Do: the major tonic of the key signature, or in do-based minor the minor tonic. */
  doNote: NoteName;
  /** Do as it is spelled in the key: "B♭". */
  doLabel: string;
  /** The tonic, home: do in major, the minor tonic (la, or do-based do) in minor. What the drone holds. */
  tonicNote: NoteName;
  tonicLabel: string;
  /** The tonic's syllable: "do", or "la" in la-based minor. */
  tonicSyllable: "do" | "la";
  minor: boolean;
  beatsPerBar: number;
  /** The time signature as written: "3/4". */
  meter: string;
  startingPitches: StartingPitch[];
  /** A rhythm-only exercise has no pitches to give. */
  rhythmOnly: boolean;
}

export const STEP_SEMITONE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export const midiOf = (p: XmlPitch) => (p.octave + 1) * 12 + STEP_SEMITONE[p.step] + p.alter;

/** What the tools know about the exercise on the page; set by setPracticeContext (exercise-info.ts). */
export const exercise = writable<ExerciseInfo | null>(null);
