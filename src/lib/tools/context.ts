import { derived, writable } from "svelte/store";
import { scoreFromAbc, type XmlPitch } from "../musicxml";
import { NOTES, solfegeFor } from "../tuner/pitch";
import type { NoteName } from "../tuner/types";

/**
 * What the practice tools know about the exercise on the page: its ABC and
 * tempo, published by the page, and what they work out from it - the key's
 * do, the meter, and where each part starts. The tuner reads solfège against
 * that do, the metronome can follow the tempo and meter, and the pitch pipe
 * gives each part its first note.
 *
 * Everything is read from the score as written (scoreFromAbc, the MusicXML
 * reader), so the pitches are the sounding ones, octave clefs included.
 */

export const practice = writable<{ abc: string | null; bpm: number }>({ abc: null, bpm: 72 });

const SESSION_KEY = "abc-tools-session-exercises";
function readCount() {
  try {
    return Number(sessionStorage.getItem(SESSION_KEY) ?? 0) || 0;
  } catch {
    return 0;
  }
}
/** Exercises generated in this browser tab - the practice timer shows it. */
export const exercisesThisSession = writable(typeof window === "undefined" ? 0 : readCount());

let lastAbc: string | null = null;
/** Pages call this whenever their exercise or tempo changes. */
export function setPracticeContext(abc: string | null | undefined, bpm: number) {
  const next = abc || null;
  if (next && next !== lastAbc) {
    exercisesThisSession.update((n) => {
      try {
        sessionStorage.setItem(SESSION_KEY, String(n + 1));
      } catch {}
      return n + 1;
    });
  }
  lastAbc = next;
  practice.set({ abc: next, bpm });
}

export interface StartingPitch {
  part: string;
  midi: number;
  /** As written: "B♭3". */
  label: string;
  /** Movable do, la-based minor: "Mi", "Sol". */
  solfege: string;
}

export interface ExerciseInfo {
  /** Do: the major tonic of the key signature (la-based minor). */
  doNote: NoteName;
  /** Do as it is spelled in the key: "B♭". */
  doLabel: string;
  minor: boolean;
  beatsPerBar: number;
  /** The time signature as written: "3/4". */
  meter: string;
  startingPitches: StartingPitch[];
  /** A rhythm-only exercise has no pitches to give. */
  rhythmOnly: boolean;
}

const STEP_SEMITONE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** Major tonic by number of sharps (+) or flats (-). */
const MAJOR_BY_FIFTHS: Record<number, string> = {
  [-7]: "C♭", [-6]: "G♭", [-5]: "D♭", [-4]: "A♭", [-3]: "E♭", [-2]: "B♭", [-1]: "F",
  0: "C", 1: "G", 2: "D", 3: "A", 4: "E", 5: "B", 6: "F♯", 7: "C♯",
};

export const midiOf = (p: XmlPitch) => (p.octave + 1) * 12 + STEP_SEMITONE[p.step] + p.alter;
const labelOf = (p: XmlPitch) =>
  `${p.step}${p.alter > 0 ? "♯".repeat(p.alter) : p.alter < 0 ? "♭".repeat(-p.alter) : ""}${p.octave}`;
const noteNameOf = (midi: number): NoteName => NOTES[((midi % 12) + 12) % 12];

export function exerciseInfo(abc: string): ExerciseInfo | null {
  let score;
  try {
    score = scoreFromAbc(abc);
  } catch {
    return null;
  }
  const first = score.parts[0];
  if (!first) return null;
  const fifths = first.key.fifths;
  const doLabel = MAJOR_BY_FIFTHS[fifths] ?? "C";
  const doMidi = 60 + ((STEP_SEMITONE[doLabel[0]] + (doLabel.includes("♯") ? 1 : doLabel.includes("♭") ? -1 : 0)) + 12) % 12;
  const doNote = noteNameOf(doMidi);
  const rhythmOnly = score.parts.every((p) => p.percussion);
  const startingPitches: StartingPitch[] = [];
  if (!rhythmOnly) {
    for (const part of score.parts) {
      const note = part.measures.flatMap((m) => m.notes).find((n) => !n.rest && n.pitch);
      if (!note?.pitch) continue;
      const midi = midiOf(note.pitch);
      startingPitches.push({
        part: part.name,
        midi,
        label: labelOf(note.pitch),
        solfege: solfegeFor(noteNameOf(midi), doNote),
      });
    }
  }
  return {
    doNote,
    doLabel,
    minor: first.key.mode === "minor",
    beatsPerBar: score.time.beats,
    meter: `${score.time.beats}/${score.time.beatType}`,
    startingPitches,
    rhythmOnly,
  };
}

export const exercise = derived(practice, (p) => (p.abc ? exerciseInfo(p.abc) : null));
