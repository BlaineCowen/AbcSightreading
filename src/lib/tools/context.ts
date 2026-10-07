import { derived, writable } from "svelte/store";
import { scoreFromAbc, type XmlPitch } from "../musicxml";
import { NOTES, solfegeFor } from "../tuner/pitch";
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
 * reader), so the pitches are the sounding ones, octave clefs included.
 */

export const practice = writable<{ abc: string | null; bpm: number; minorSolfege: MinorSolfege }>({
  abc: null,
  bpm: 72,
  minorSolfege: "la",
});

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
/**
 * Pages call this whenever their exercise or tempo changes, and with how the
 * page sings minor (la-based unless it says do), which moves do in a minor key.
 */
export function setPracticeContext(abc: string | null | undefined, bpm: number, minorSolfege: MinorSolfege = "la") {
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
  practice.set({ abc: next, bpm, minorSolfege });
}

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

const STEP_SEMITONE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** Major tonic by number of sharps (+) or flats (-). */
const MAJOR_BY_FIFTHS: Record<number, string> = {
  [-7]: "C♭", [-6]: "G♭", [-5]: "D♭", [-4]: "A♭", [-3]: "E♭", [-2]: "B♭", [-1]: "F",
  0: "C", 1: "G", 2: "D", 3: "A", 4: "E", 5: "B", 6: "F♯", 7: "C♯",
};

/** Minor tonic by number of sharps (+) or flats (-). */
const MINOR_BY_FIFTHS: Record<number, string> = {
  [-7]: "A♭", [-6]: "E♭", [-5]: "B♭", [-4]: "F", [-3]: "C", [-2]: "G", [-1]: "D",
  0: "A", 1: "E", 2: "B", 3: "F♯", 4: "C♯", 5: "G♯", 6: "D♯", 7: "A♯",
};

export const midiOf = (p: XmlPitch) => (p.octave + 1) * 12 + STEP_SEMITONE[p.step] + p.alter;
const labelOf = (p: XmlPitch) =>
  `${p.step}${p.alter > 0 ? "♯".repeat(p.alter) : p.alter < 0 ? "♭".repeat(-p.alter) : ""}${p.octave}`;
const noteNameOf = (midi: number): NoteName => NOTES[((midi % 12) + 12) % 12];

export function exerciseInfo(abc: string, minorSolfege: MinorSolfege = "la"): ExerciseInfo | null {
  let score;
  try {
    score = scoreFromAbc(abc);
  } catch {
    return null;
  }
  const first = score.parts[0];
  if (!first) return null;
  const fifths = first.key.fifths;
  const minor = first.key.mode === "minor";
  const majorLabel = MAJOR_BY_FIFTHS[fifths] ?? "C";
  const pcOf = (label: string) => (STEP_SEMITONE[label[0]] + (label.includes("♯") ? 1 : label.includes("♭") ? -1 : 0) + 12) % 12;
  const tonicLabel = minor ? MINOR_BY_FIFTHS[fifths] ?? "A" : majorLabel;
  const tonicNote = noteNameOf(60 + pcOf(tonicLabel));
  // Do-based minor puts do on the minor tonic; la-based (and major) on the major tonic.
  const doBased = minor && minorSolfege === "do";
  const doLabel = doBased ? tonicLabel : majorLabel;
  const doNote = doBased ? tonicNote : noteNameOf(60 + pcOf(majorLabel));
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
    tonicNote,
    tonicLabel,
    tonicSyllable: minor && !doBased ? "la" : "do",
    minor,
    beatsPerBar: score.time.beats,
    meter: `${score.time.beats}/${score.time.beatType}`,
    startingPitches,
    rhythmOnly,
  };
}

export const exercise = derived(practice, (p) => (p.abc ? exerciseInfo(p.abc, p.minorSolfege) : null));
