import type { GradeNote, GradeRest } from "../grade";
import { TICKS, type PieceNote, type PieceScore } from "./model";

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

export function scheduleForPiece(
  score: PieceScore,
  partId: string,
  from: number,
  to: number,
  /** Bars in the order heard (timeline.ts playedBars: the whole piece takes its repeats); from..to straight through by default. */
  order?: number[],
): { notes: GradeNote[]; rests: GradeRest[]; beatUnits: number } {
  const part = score.parts.find((p) => p.id === partId);
  const bar = score.measures[from];
  if (!part || !bar) return { notes: [], rests: [], beatUnits: 8 };
  const bars = order ?? Array.from({ length: to - from + 1 }, (_, k) => from + k);
  const byBar = new Map<number, { n: PieceNote; i: number }[]>();
  part.notes.forEach((n, i) => {
    if (n.measure < from || n.measure > to || n.hidden) return;
    (byBar.get(n.measure) ?? byBar.set(n.measure, []).get(n.measure)!).push({ n, i });
  });
  for (const list of byBar.values()) list.sort((a, b) => a.n.start - b.n.start);

  const notes: GradeNote[] = [];
  const rests: GradeRest[] = [];
  const unitsOf = (ticks: number) => ticks / PER_UNIT;
  const beatUnits = beatUnitsOf(bar.time);
  let held: GradeNote | null = null;
  let heldEnd = -1;
  // Each bar as heard: its own place in the sound (a repeat plays it again).
  let base = 0;
  for (const b of bars) {
    const m = score.measures[b];
    const inside = byBar.get(b) ?? [];
    const barEnd = m.start + m.length;
    const at = (tick: number) => base + unitsOf(tick - m.start);
    for (const { n, i } of inside) {
      if (n.rest) continue;
      const s = at(n.start);
      // A tie carries on the note before: one held note.
      if (n.tieStop && held && heldEnd === s && held.midi === n.midi) {
        held.lengthUnits += unitsOf(n.length);
        held.beats = held.lengthUnits / beatUnits;
        heldEnd = s + unitsOf(n.length);
        continue;
      }
      const g: GradeNote = { midi: n.midi!, cursor: i, startUnits: s, lengthUnits: unitsOf(Math.min(n.length, barEnd - n.start)), beats: 0 };
      g.beats = g.lengthUnits / beatUnits;
      notes.push(g);
      held = g;
      heldEnd = s + unitsOf(n.length);
    }
    // Rests the line itself has: one not covered by a sung note (a second
    // voice's filler rests under a note are not rests in the line).
    const sounding = notes.filter((g) => g.startUnits + g.lengthUnits > base).map((g) => [g.startUnits, g.startUnits + g.lengthUnits]);
    for (const { n, i } of inside) {
      if (!n.rest) continue;
      const s = at(n.start);
      const e = s + unitsOf(n.length);
      if (sounding.some(([a, z]) => s < z && e > a)) continue;
      if (rests.some((r) => s < r.startUnits + r.lengthUnits && e > r.startUnits)) continue;
      rests.push({ cursor: i, startUnits: s, lengthUnits: e - s });
    }
    base += unitsOf(m.length);
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
