import { describe, expect, test } from "bun:test";
import { playedBars, Timeline } from "../../src/lib/pieces/timeline";
import { scheduleForPiece } from "../../src/lib/pieces/schedule";
import { TICKS, type PieceMeasure, type PieceScore } from "../../src/lib/pieces/model";

const BAR = 4 * TICKS;
const bars = (marks: Partial<PieceMeasure>[]): PieceMeasure[] =>
  marks.map((m, i) => ({ label: String(i + 1), start: i * BAR, length: BAR, time: { beats: 4, beatType: 4 }, ...m }));

describe("playedBars", () => {
  test("a run of bars plays straight through, repeats or not", () => {
    const ms = bars([{}, { repeatStart: true }, { repeatEnd: true }, {}]);
    expect(playedBars(ms, 1, 2)).toEqual([1, 2]);
  });

  test("the whole piece takes each repeat once", () => {
    const ms = bars([{}, { repeatStart: true }, { repeatEnd: true }, {}]);
    expect(playedBars(ms, 0, 3)).toEqual([0, 1, 2, 1, 2, 3]);
  });

  test("a repeat with no start goes back to the top", () => {
    const ms = bars([{}, { repeatEnd: true }, {}]);
    expect(playedBars(ms, 0, 2)).toEqual([0, 1, 0, 1, 2]);
  });

  test("first and second endings", () => {
    const ms = bars([
      { repeatStart: true },
      {},
      { endingStart: "1", endingStop: "stop", repeatEnd: true },
      { endingStart: "2", endingStop: "discontinue" },
      {},
    ]);
    expect(playedBars(ms, 0, 4)).toEqual([0, 1, 2, 0, 1, 3, 4]);
  });

  test("two repeated sections", () => {
    const ms = bars([{ repeatStart: true }, { repeatEnd: true }, { repeatStart: true }, { repeatEnd: true }]);
    expect(playedBars(ms, 0, 3)).toEqual([0, 1, 0, 1, 2, 3, 2, 3]);
  });
});

describe("Timeline", () => {
  const ms = bars([{}, { repeatStart: true }, { repeatEnd: true }, {}]);
  // A quarter a second: a bar is 4000 ms.
  const t = new Timeline(ms, playedBars(ms, 0, 3), 60);

  test("time to tick follows the repeats", () => {
    expect(t.totalMs).toBe(24_000);
    expect(t.tickAt(0)).toBe(0);
    expect(t.tickAt(4_000)).toBe(BAR);
    // Bar 2 again, after the repeat.
    expect(t.tickAt(12_000)).toBe(BAR);
    expect(t.tickAt(22_000)).toBe(3 * BAR + BAR / 2);
    expect(t.tickAt(24_000)).toBeNull();
  });

  test("a tick is found where it is first heard", () => {
    expect(t.msOf(BAR + TICKS)).toBe(5_000);
    expect(t.msOf(3 * BAR)).toBe(20_000);
  });
});

describe("scheduleForPiece with repeats", () => {
  const note = (measure: number, midi: number) => ({ measure, staff: 1, voice: "1", start: measure * BAR, length: BAR, rest: false, midi });
  const score: PieceScore = {
    version: 1,
    title: "t",
    parts: [{ id: "P1", name: "S", program: 0, transpose: 0, staves: 1, clefs: [], keys: [], notes: [note(0, 60), note(1, 62), note(2, 64)] }],
    measures: bars([{ repeatStart: true }, { repeatEnd: true }, {}]),
    warnings: [],
  };

  test("a repeated bar is sung again, later in time", () => {
    const s = scheduleForPiece(score, "P1", 0, 2, playedBars(score.measures, 0, 2));
    expect(s.notes.map((n) => [n.midi, n.startUnits, n.cursor])).toEqual([
      [60, 0, 0],
      [62, 32, 1],
      [60, 64, 0],
      [62, 96, 1],
      [64, 128, 2],
    ]);
  });

  test("without an order, straight through as before", () => {
    const s = scheduleForPiece(score, "P1", 0, 2);
    expect(s.notes.map((n) => n.startUnits)).toEqual([0, 32, 64]);
  });
});
