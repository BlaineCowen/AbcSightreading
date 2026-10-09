import type { VoiceNote } from "./types";
import { keySignatures } from "../resources/key-signatures";
import { semitoneOf } from "./non-chord-tone-gen";

/**
 * Parallel fifths and octaves in a finished exercise, counted as a theory
 * teacher would circle them: at each moment a part starts a note, two parts
 * that both move straight from note to note (a rest between breaks it), the
 * same way, from a perfect fifth to a perfect fifth or an octave to an
 * octave, compound intervals included, measured in semitones so a diminished
 * fifth to a perfect one is not counted. Unisons are left out: two parts
 * singing one line together (unison-spans.ts) is a texture, not a fault.
 *
 * The writers avoid parallels chord to chord, and decoration checks every
 * move a figure makes (non-chord-tone-gen `parallelInFigure`). What is left
 * comes from the passes after it: a restated phrase's varied note against a
 * decoration copied into another part, or a dotted figure moving a note onto
 * another part's passing note - about one exercise in a hundred (8 October
 * 2026). generateChoralExercise draws again when this finds one.
 */
export function parallelFaults(voices: VoiceNote[][], key: string): number {
  const keyInfo = keySignatures[key];
  if (!keyInfo) return 0;
  type Ev = { start: number; end: number; note: VoiceNote };
  const events: Ev[][] = voices.map((voice) => {
    let t = 0;
    return voice.map((note) => {
      const e = { start: t, end: t + note.length, note };
      t += note.length;
      return e;
    });
  });
  const at = (evs: Ev[], t: number) => evs.find((e) => e.start <= t && t < e.end) ?? null;
  const times = [...new Set(events.flatMap((evs) => evs.filter((e) => !e.note.rest).map((e) => e.start)))].sort((a, b) => a - b);
  let faults = 0;
  for (let i = 1; i < times.length; i++) {
    for (let a = 0; a < events.length; a++) {
      for (let b = a + 1; b < events.length; b++) {
        const a0 = at(events[a], times[i - 1]), a1 = at(events[a], times[i]);
        const b0 = at(events[b], times[i - 1]), b1 = at(events[b], times[i]);
        if (!a0 || !a1 || !b0 || !b1 || a0 === a1 || b0 === b1) continue;
        if (a0.note.rest || a1.note.rest || b0.note.rest || b1.note.rest) continue;
        if (a0.end !== a1.start || b0.end !== b1.start) continue;
        const da = a1.note.pitchValue - a0.note.pitchValue, db = b1.note.pitchValue - b0.note.pitchValue;
        if (da === 0 || db === 0 || Math.sign(da) !== Math.sign(db)) continue;
        const span0 = Math.abs(semitoneOf(a0.note, keyInfo) - semitoneOf(b0.note, keyInfo));
        const span1 = Math.abs(semitoneOf(a1.note, keyInfo) - semitoneOf(b1.note, keyInfo));
        const steps0 = Math.abs(a0.note.pitchValue - b0.note.pitchValue) % 7;
        const steps1 = Math.abs(a1.note.pitchValue - b1.note.pitchValue) % 7;
        const fifths = steps0 === 4 && steps1 === 4 && span0 % 12 === 7 && span1 % 12 === 7;
        const octaves = steps0 === 0 && steps1 === 0 && span0 % 12 === 0 && span1 % 12 === 0 && span0 > 0 && span1 > 0;
        if (fifths || octaves) faults++;
      }
    }
  }
  return faults;
}
