import { scoreFromAbc } from "./musicxml";
import { midiOf } from "./tools/context";
import type { GradeNote, GradeRest } from "./grade";

// The notes Grade listens for, read from the exercise. Kept apart from
// grade.ts because reading the ABC needs abcjs, and grade.ts's rules and
// constants are also used by /challenge, which draws without it.

/**
 * The notes to sing and the rests between them, in order, from the exercise's
 * ABC: tied notes as one held note, and the playback transposition added so it
 * matches what the page plays.
 */
export function gradeSchedule(abc: string, transpose = 0): { notes: GradeNote[]; rests: GradeRest[]; totalUnits: number } {
  const score = scoreFromAbc(abc);
  const part = score.parts[0];
  const notes: GradeNote[] = [];
  const rests: GradeRest[] = [];
  if (!part) return { notes, rests, totalUnits: 0 };
  let cursor = 0;
  let at = 0;
  let tied: GradeNote | null = null;
  for (const measure of part.measures) {
    for (const n of measure.notes) {
      const here = cursor++;
      const start = at;
      at += n.length;
      if (n.rest || !n.pitch) {
        tied = null;
        const last = rests[rests.length - 1];
        // Rests in a row are one silence.
        if (last && last.startUnits + last.lengthUnits === start) last.lengthUnits += n.length;
        else rests.push({ cursor: here, startUnits: start, lengthUnits: n.length });
        continue;
      }
      if (tied && n.tieStop) {
        tied.beats += n.length / 8;
        tied.lengthUnits += n.length;
      } else {
        tied = { midi: midiOf(n.pitch) + transpose, beats: n.length / 8, cursor: here, startUnits: start, lengthUnits: n.length };
        notes.push(tied);
      }
      if (!n.tieStart) tied = null;
    }
  }
  return { notes, rests, totalUnits: at };
}

/**
 * The notes to sing, in order: rests left out (the singer rests; nothing
 * waits in Pitch only).
 */
export function gradeNotes(abc: string, transpose = 0): GradeNote[] {
  return gradeSchedule(abc, transpose).notes;
}

