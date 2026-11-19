import { describe, expect, test } from "bun:test";
import { rhythmTimes, type RhythmRound } from "../../src/lib/games/live-game";
import { holdNeeded, scoreRhythm, type Press } from "../../src/lib/games/game-score";
import type { GradeNote } from "../../src/lib/grade";

// Holding the long notes (Blaine, 19 November 2026): a half held at least a
// beat, a dotted half at least two; a tap is enough for anything shorter.
// 4/4 at 120: a beat is 500 ms, a quarter 8 units.
const round: RhythmRound = { bpm: 120, meter: "4/4", beatsPerBar: 4, bars: 2, at: 1_000_000 };
const t = rhythmTimes(round);
let cursor = 0;
const note = (startUnits: number, lengthUnits: number): GradeNote => ({ midi: 71, beats: lengthUnits / 8, cursor: cursor++, startUnits, lengthUnits });
// Bar 1: half, quarter, quarter. Bar 2: dotted half, quarter.
const schedule = { notes: [note(0, 16), note(16, 8), note(24, 8), note(32, 24), note(56, 8)], rests: [] };
const beatMs = t.beatMs;
const onset = (i: number) => t.musicAt + schedule.notes[i]!.startUnits * (beatMs / 8);

/** Every note tapped on time (count-in too, `lag` ms late), each held `holdBeats(i)` beats. */
function presses(holdBeats: (i: number) => number | null, lag = 0): Press[] {
  const count = t.tapClicks.map((c) => ({ t: c + lag, up: c + lag + 100 }));
  const music = schedule.notes.map((_, i) => {
    const b = holdBeats(i);
    return { t: onset(i) + lag, up: b === null ? null : onset(i) + lag + b * beatMs };
  });
  return [...count, ...music];
}
const score = (p: Press[]) =>
  scoreRhythm({ round, schedule, beatUnits: 8, taps: p.map((x) => x.t), presses: p, strictness: "standard" });

describe("how long a note must be held", () => {
  test("half 1 beat, dotted half 2, whole 3; shorter notes need only a tap", () => {
    expect(holdNeeded(2)).toBe(1);
    expect(holdNeeded(3)).toBe(2);
    expect(holdNeeded(4)).toBe(3);
    expect(holdNeeded(1)).toBe(0);
    expect(holdNeeded(1.5)).toBe(0);
  });
});

describe("holding the long notes", () => {
  test("held long enough (not the full value): full marks", () => {
    const s = score(presses((i) => (i === 0 ? 1 : i === 3 ? 2 : 0.1)));
    expect(s.short).toEqual([]);
    expect(s.points).toBe(100);
  });
  test("still held when the round ends counts as held", () => {
    const s = score(presses((i) => (i === 3 ? null : i === 0 ? 1.5 : 0.1)));
    expect(s.short).toEqual([]);
  });
  test("a half note only tapped loses its beat and is marked", () => {
    const s = score(presses((i) => (i === 3 ? 2.5 : 0.1)));
    expect(s.short).toEqual([schedule.notes[0]!.cursor]);
    expect(s.points).toBeLessThan(100);
    const half = s.result.notes.find((n) => n.cursor === schedule.notes[0]!.cursor)!;
    expect(half.rhythm).toBeLessThan(90);
    expect(s.result.beatsRight).toBe(s.result.beats - 1);
  });
  test("a dotted half held one beat is short; held 1.8 beats is close enough", () => {
    expect(score(presses((i) => (i === 0 ? 1 : i === 3 ? 1 : 0.1))).short).toEqual([schedule.notes[3]!.cursor]);
    expect(score(presses((i) => (i === 0 ? 1 : i === 3 ? 1.8 : 0.1))).short).toEqual([]);
  });
  test("found again when the student runs late (the count-in's lag taken off)", () => {
    expect(score(presses((i) => (i === 0 ? 1 : i === 3 ? 2 : 0.1), 180)).short).toEqual([]);
    expect(score(presses((i) => (i === 3 ? 2 : 0.1), 180)).short).toEqual([schedule.notes[0]!.cursor]);
  });
  test("with no presses given, holds are not checked", () => {
    const p = presses(() => 0.1);
    const s = scoreRhythm({ round, schedule, beatUnits: 8, taps: p.map((x) => x.t), strictness: "standard" });
    expect(s.short).toBeUndefined();
    expect(s.points).toBe(100);
  });
});
