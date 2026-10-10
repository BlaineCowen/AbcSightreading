import type { GradeNote, GradeRest } from "../grade";
import { TICKS, type PieceScore } from "./model";

/**
 * What Grade grades for a student's part of a piece assignment: the notes and
 * rests of that part over the assigned bars, in the units grade.ts counts in
 * (32nds, from the excerpt's first downbeat), tied notes as one held note, at
 * sounding pitch. The model is read, never ABC (grade.ts's gradeSchedule
 * reads the Unison page's ABC).
 *
 * `cursor` is the model note's index in the part, so the page finds its drawn
 * element through write-abc's element map.
 */

/** Ticks in a 32nd. */
const PER_UNIT = TICKS / 8;

export function scheduleForPiece(score: PieceScore, partId: string, from: number, to: number): { notes: GradeNote[]; rests: GradeRest[]; beatUnits: number } {
  const part = score.parts.find((p) => p.id === partId);
  const bar = score.measures[from];
  if (!part || !bar) return { notes: [], rests: [], beatUnits: 8 };
  const t0 = bar.start;
  const end = score.measures[to].start + score.measures[to].length;
  const inside = part.notes
    .map((n, i) => ({ n, i }))
    .filter(({ n }) => n.measure >= from && n.measure <= to && !n.hidden)
    .sort((a, b) => a.n.start - b.n.start);

  const notes: GradeNote[] = [];
  const unitsOf = (ticks: number) => ticks / PER_UNIT;
  const beatUnits = beatUnitsOf(bar.time);
  let held: GradeNote | null = null;
  let heldEnd = -1;
  for (const { n, i } of inside) {
    if (n.rest) continue;
    // A tie carries on the note before: one held note.
    if (n.tieStop && held && heldEnd === n.start && held.midi === n.midi) {
      held.lengthUnits += unitsOf(n.length);
      held.beats = held.lengthUnits / beatUnits;
      heldEnd = n.start + n.length;
      continue;
    }
    const g: GradeNote = {
      midi: n.midi!,
      cursor: i,
      startUnits: unitsOf(n.start - t0),
      lengthUnits: unitsOf(Math.min(n.length, end - n.start)),
      beats: 0,
    };
    g.beats = g.lengthUnits / beatUnits;
    notes.push(g);
    held = g;
    heldEnd = n.start + n.length;
  }

  // Rests the line itself has: one not covered by a sung note (a second
  // voice's filler rests under a note are not rests in the line).
  const sounding = notes.map((g) => [g.startUnits, g.startUnits + g.lengthUnits]);
  const rests: GradeRest[] = [];
  for (const { n, i } of inside) {
    if (!n.rest) continue;
    const s = unitsOf(n.start - t0);
    const e = s + unitsOf(n.length);
    if (sounding.some(([a, b]) => s < b && e > a)) continue;
    if (rests.some((r) => s < r.startUnits + r.lengthUnits && e > r.startUnits)) continue;
    rests.push({ cursor: i, startUnits: s, lengthUnits: e - s });
  }
  rests.sort((a, b) => a.startUnits - b.startUnits);
  return { notes, rests, beatUnits };
}

/** 32nds in a beat: a quarter in simple time, a dotted quarter in compound, a half in 2/2. */
export function beatUnitsOf(time: { beats: number; beatType: number }): number {
  if (time.beatType === 8 && time.beats % 3 === 0 && time.beats > 3) return 12;
  return 32 / time.beatType;
}

/** Beats in a bar, as counted (6/8 is two). */
export function beatsInBar(time: { beats: number; beatType: number }): number {
  if (time.beatType === 8 && time.beats % 3 === 0 && time.beats > 3) return time.beats / 3;
  return time.beats;
}
