import type { BeatLevel } from "./click-pattern";
import { BPM_MAX, BPM_MIN } from "./metronome";

/**
 * The metronome's practice assistant (notes/metronome-plan.md, phase 3):
 * pure rules over the bar and beat, so a run is repeatable and tested.
 *
 * - Tempo ramp: `step` BPM every `everyBars` bars, toward `target` (down too).
 * - Silent bars: play `play` bars, then `mute` bars silent, repeating - the
 *   class keeps the pulse through them.
 * - Dropped beats: each beat but a bar's first silent `percent` of the time.
 * - Time limit, and a count-in before the music.
 *
 * Bars are counted from the first after the count-in; the count-in always
 * clicks plainly. Silent bars and dropped beats also reach the click under an
 * exercise; the ramp, limit and count-in are the metronome's own (Drill ramps
 * between exercises).
 */
export interface AssistantSettings {
  ramp: { on: boolean; step: number; everyBars: number; target: number };
  silent: { on: boolean; play: number; mute: number };
  drop: { on: boolean; percent: number };
  limit: { on: boolean; minutes: number };
  countIn: { on: boolean; bars: number };
}

export const DEFAULT_ASSISTANT: AssistantSettings = {
  ramp: { on: false, step: 2, everyBars: 4, target: 120 },
  silent: { on: false, play: 2, mute: 2 },
  drop: { on: false, percent: 20 },
  limit: { on: false, minutes: 5 },
  countIn: { on: false, bars: 1 },
};

const int = (v: unknown, lo: number, hi: number, fallback: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= lo && n <= hi ? n : fallback;
};
const flag = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);

/** Settings as saved, made whole: anything missing or out of range takes the default. */
export function assistantFrom(value: unknown): AssistantSettings {
  const o = (value && typeof value === "object" ? value : {}) as Record<string, any>;
  const d = DEFAULT_ASSISTANT;
  return {
    ramp: {
      on: flag(o.ramp?.on, d.ramp.on),
      step: int(o.ramp?.step, 1, 20, d.ramp.step),
      everyBars: int(o.ramp?.everyBars, 1, 32, d.ramp.everyBars),
      target: int(o.ramp?.target, BPM_MIN, BPM_MAX, d.ramp.target),
    },
    silent: { on: flag(o.silent?.on, d.silent.on), play: int(o.silent?.play, 1, 16, d.silent.play), mute: int(o.silent?.mute, 1, 16, d.silent.mute) },
    drop: { on: flag(o.drop?.on, d.drop.on), percent: int(o.drop?.percent, 5, 75, d.drop.percent) },
    limit: { on: flag(o.limit?.on, d.limit.on), minutes: int(o.limit?.minutes, 1, 120, d.limit.minutes) },
    countIn: { on: flag(o.countIn?.on, d.countIn.on), bars: int(o.countIn?.bars, 1, 4, d.countIn.bars) },
  };
}

/** The tempo for bar `bar` (from 0): the start, moved `step` every `everyBars` bars, never past the target. */
export function rampBpm(start: number, bar: number, ramp: AssistantSettings["ramp"]): number {
  if (!ramp.on || bar < 0 || ramp.target === start) return start;
  const moved = Math.floor(bar / ramp.everyBars) * ramp.step;
  return ramp.target > start ? Math.min(ramp.target, start + moved) : Math.max(ramp.target, start - moved);
}

/** Whether bar `bar` (from 0) is one of the silent ones. */
export function barIsSilent(bar: number, silent: AssistantSettings["silent"]): boolean {
  if (!silent.on || bar < 0) return false;
  return bar % (silent.play + silent.mute) >= silent.play;
}

/** A number in [0, 1) from three integers, the same every time (a small integer hash). */
function chance(seed: number, bar: number, beat: number): number {
  let h = (seed ^ Math.imul(bar + 1, 0x9e3779b1) ^ Math.imul(beat + 1, 0x85ebca77)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Whether beat `beat` of bar `bar` is dropped. Never a bar's first beat: the bar stays findable. */
export function beatIsDropped(bar: number, beat: number, drop: AssistantSettings["drop"], seed: number): boolean {
  if (!drop.on || bar < 0 || beat <= 0) return false;
  return chance(seed, bar, beat) < drop.percent / 100;
}

/**
 * A bar's beat levels after the assistant: all silent in a silent bar, a
 * dropped beat silent, the rest as set. `bar` below 0 is the count-in: as set.
 */
export function assistedLevels(levels: BeatLevel[], bar: number, a: Pick<AssistantSettings, "silent" | "drop">, seed: number): BeatLevel[] {
  if (barIsSilent(bar, a.silent)) return levels.map(() => "off");
  return levels.map((l, beat) => (beatIsDropped(bar, beat, a.drop, seed) ? "off" : l));
}

/** Whether the click under an exercise changes from bar to bar at all. */
export const assistsTheClick = (a: Pick<AssistantSettings, "silent" | "drop">) => a.silent.on || a.drop.on;

/** Whether a run that started `elapsedSeconds` ago has used its time. */
export const timeIsUp = (elapsedSeconds: number, limit: AssistantSettings["limit"]) => limit.on && elapsedSeconds >= limit.minutes * 60;
