import { scoreFromAbc, type XmlPitch } from "../musicxml";
import { NOTES, solfegeFor } from "../tuner/pitch";
import type { NoteName } from "../tuner/types";
import type { MinorSolfege } from "../../resources/solfege";
import { STEP_SEMITONE, SESSION_KEY, exercise, exercisesThisSession, midiOf, practice, type ExerciseInfo, type StartingPitch } from "./context";

/**
 * The exercise as the practice tools read it (context.ts), worked out from the
 * score. Here and not in context.ts because it needs abcjs: only the pages
 * that publish an exercise import this.
 */

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

let lastAbc: string | null = null;
let lastKey: string | null = null;
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
  // Read the score only when it or the minor syllables changed, not on every tempo change.
  const key = next ? `${minorSolfege}\n${next}` : null;
  if (key !== lastKey) {
    lastKey = key;
    exercise.set(next ? exerciseInfo(next, minorSolfege) : null);
  }
  practice.set({ abc: next, bpm, minorSolfege });
}

