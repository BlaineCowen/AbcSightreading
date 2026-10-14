import { TICKS, type PieceMeasure } from "./model";

/**
 * The order bars are heard in, and where in the sound each one falls. The
 * model keeps repeats as written (model.ts), and abcjs plays them from the
 * barlines when the whole piece is written out (write-abc.ts: repeats only
 * then), so the sound is longer than the ticks: the cursor, a start from a
 * tapped note and a graded run all read the sound's time through here.
 */

/**
 * Bars in played order. A run of bars that is not the whole piece plays
 * straight through, as write-abc writes it. The whole piece takes each
 * `:|` once, back to the last `|:` (or the start), and on the way round
 * skips a volta bracket that is not for this time through.
 */
export function playedBars(measures: PieceMeasure[], from: number, to: number): number[] {
  const out: number[] = [];
  const whole = from === 0 && to === measures.length - 1;
  if (!whole) {
    for (let i = from; i <= to; i++) out.push(i);
    return out;
  }
  let back = from;
  let pass = 1;
  let skipping = false;
  const taken = new Set<number>();
  let i = from;
  // A guard against a malformed file: no piece plays its bars more than four times over.
  while (i <= to && out.length < measures.length * 4) {
    const m = measures[i];
    if (m.repeatStart && i !== back) {
      back = i;
      pass = 1;
    }
    if (m.endingStart) {
      const nums = m.endingStart.split(/[^0-9]+/).filter(Boolean).map(Number);
      skipping = nums.length > 0 && !nums.includes(pass);
    }
    if (!skipping) out.push(i);
    if (m.repeatEnd && !skipping && !taken.has(i)) {
      taken.add(i);
      pass++;
      i = back;
      continue;
    }
    if (m.endingStop) skipping = false;
    i++;
  }
  return out;
}

export type Segment = { bar: number; tick: number; length: number; ms: number };

/** The bars as heard at one tempo (quarter notes a minute), with time both ways. */
export class Timeline {
  readonly segments: Segment[];
  readonly totalMs: number;
  private msPerTick: number;

  constructor(measures: PieceMeasure[], order: number[], bpm: number) {
    this.msPerTick = 60_000 / bpm / TICKS;
    let ms = 0;
    this.segments = order.map((bar) => {
      const m = measures[bar];
      const s = { bar, tick: m.start, length: m.length, ms };
      ms += m.length * this.msPerTick;
      return s;
    });
    this.totalMs = ms;
  }

  /** The tick sounding `ms` into the sound, or null outside it. */
  tickAt(ms: number): number | null {
    if (ms < 0 || !this.segments.length) return null;
    let lo = 0;
    let hi = this.segments.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.segments[mid].ms <= ms) lo = mid;
      else hi = mid - 1;
    }
    const s = this.segments[lo];
    const t = (ms - s.ms) / this.msPerTick;
    return t < s.length ? s.tick + t : null;
  }

  /** Where a tick is first heard (ms into the sound), or null if it is not in the bars played. */
  msOf(tick: number): number | null {
    const s = this.segments.find((x) => tick >= x.tick && tick < x.tick + x.length);
    return s ? s.ms + (tick - s.tick) * this.msPerTick : null;
  }

  /** The played bar `ms` into the sound falls in (its index in `segments`). */
  segmentAt(ms: number): number {
    let k = 0;
    while (k + 1 < this.segments.length && this.segments[k + 1].ms <= ms) k++;
    return k;
  }
}
