import type { Rhythm } from "../resources/rhythms";

/**
 * Can a selection of rhythms fill an exercise at all?
 *
 * Lifted verbatim out of scripts/check-rhythm.ts, which still uses it - it is
 * deliberately a *separate, exhaustive* implementation from the generator: the
 * generator searches randomly and gives up, this one enumerates, and where they
 * disagree one of them is wrong. That property is about generator vs solver, so
 * sharing this with the UI costs nothing and keeps a single copy.
 *
 * The UI needs it because an impossible selection is otherwise only discovered
 * by pressing Generate and being handed an alert - every time, with nothing on
 * the page changing, which reads as the app being stuck. Reported exactly that
 * way: a dotted quarter + eighth chosen in 3/4 alongside only half notes cannot
 * tile a 24-unit bar, so it failed on every press.
 */
export function canFillExercise(
  rhythms: Rhythm[],
  tsPerMeasure: number,
  totalUnits: number,
  allowTies: boolean,
  /** One beat in 32nds, from the meter model (beatUnitOf): 8 in simple meter. */
  beatUnits = 8
): boolean {
  // Compound meter: every figure is whole beats, so walk beat positions. A
  // plain note may cross the barline when ties are on; split at a beat it is
  // two dotted values, which compound meter writes plainly - so no dotted-split
  // rule here. Kept in step with compound-rhythm.ts's fill, but written out
  // separately on purpose: this is the reference that fill is checked against.
  if (beatUnits === 12) {
    const usable = rhythms.filter((r) => r.totalValue > 0 && r.totalValue % beatUnits === 0);
    const seenAt = new Set<number>();
    const walkBeats = (pos: number): boolean => {
      if (pos === totalUnits) return true;
      if (pos > totalUnits || seenAt.has(pos)) return false;
      seenAt.add(pos);
      const room = tsPerMeasure - (pos % tsPerMeasure);
      for (const r of usable) {
        if (r.totalValue > room && !(allowTies && !r.pattern && !r.rest)) continue;
        if (walkBeats(pos + r.totalValue)) return true;
      }
      return false;
    };
    return walkBeats(0);
  }

  const DOTTED = new Set([6, 12, 24]);
  const seen = new Set<number>();

  const legal = (r: Rhythm, pos: number, lastShort: boolean) => {
    const room = tsPerMeasure - (pos % tsPerMeasure);
    const canCross = allowTies && !r.pattern && !r.rest;
    if (r.totalValue > room && !canCross) return false;
    // A crossing must split into two plainly written halves.
    if (
      r.totalValue > room &&
      (DOTTED.has(room) || DOTTED.has(r.totalValue - room))
    ) {
      return false;
    }
    const p = (pos % tsPerMeasure) % beatUnits;
    if (tsPerMeasure >= beatUnits) {
      if ((p === beatUnits / 4 || p === (3 * beatUnits) / 4) && r.totalValue >= 8) return false;
      if (p === beatUnits / 2 && r.totalValue >= 16) return false;
    }
    if (lastShort && r.totalValue >= 16) return false;
    return true;
  };

  const walk = (pos: number, lastShort: boolean): boolean => {
    if (pos === totalUnits) return true;
    if (pos > totalUnits) return false;
    const key = pos * 2 + (lastShort ? 1 : 0);
    if (seen.has(key)) return false;
    seen.add(key);
    for (const r of rhythms) {
      if (!legal(r, pos, lastShort)) continue;
      if (walk(pos + r.totalValue, r.totalValue <= 4)) return true;
    }
    return false;
  };
  return walk(0, false);
}
