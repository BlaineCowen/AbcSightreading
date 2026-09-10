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
  allowTies: boolean
): boolean {
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
    const p = (pos % tsPerMeasure) % 8;
    if (tsPerMeasure >= 8) {
      if ((p === 2 || p === 6) && r.totalValue >= 8) return false;
      if (p === 4 && r.totalValue >= 16) return false;
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
