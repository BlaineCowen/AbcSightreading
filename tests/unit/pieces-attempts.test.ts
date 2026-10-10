import { describe, expect, test } from "bun:test";
import { strToU8 } from "fflate";
import { readMusicXml } from "../../src/lib/pieces/read-musicxml";
import { scheduleForPiece, beatUnitsOf, beatsInBar } from "../../src/lib/pieces/schedule";
import { attemptsLeft, attemptsLine, bestOf, checkAttemptResult, marksOf, takePath, TAKE_PATH } from "../../src/lib/pieces/attempts";
import type { PerfResult } from "../../src/lib/grade";
import { attrs, note, scoreXml } from "./fixtures/musicxml-pieces";

const score = readMusicXml(
  strToU8(
    scoreXml([
      {
        id: "P1",
        name: "Alto",
        measures: [
          attrs({ divisions: 2 }) + note("C4", 2) + note("rest", 2) + note("E4", 4, { type: "half", tie: "start" }),
          note("E4", 2, { tie: "stop" }) + note("G4", 6, { type: "half" }),
          note("A4", 8, { type: "whole" }),
        ],
      },
    ]),
  ),
  "score.musicxml",
);

describe("scheduleForPiece", () => {
  test("from the excerpt's first downbeat, in 32nds, ties held, rests kept", () => {
    const s = scheduleForPiece(score, "P1", 0, 1);
    expect(s.beatUnits).toBe(8);
    expect(s.notes.map((n) => [n.midi, n.startUnits, n.lengthUnits, n.beats])).toEqual([
      [60, 0, 8, 1],
      [64, 16, 24, 3],
      [67, 40, 24, 3],
    ]);
    expect(s.rests.map((r) => [r.startUnits, r.lengthUnits])).toEqual([[8, 8]]);
    // cursor: the model note's index in the part.
    expect(s.notes.map((n) => score.parts[0].notes[n.cursor].midi)).toEqual([60, 64, 67]);
  });

  test("an excerpt from a later bar starts at 0", () => {
    const s = scheduleForPiece(score, "P1", 2, 2);
    expect(s.notes.map((n) => [n.midi, n.startUnits, n.lengthUnits])).toEqual([[69, 0, 32]]);
  });

  test("beats as counted", () => {
    expect([beatUnitsOf({ beats: 4, beatType: 4 }), beatUnitsOf({ beats: 6, beatType: 8 }), beatUnitsOf({ beats: 2, beatType: 2 })]).toEqual([8, 12, 16]);
    expect([beatsInBar({ beats: 6, beatType: 8 }), beatsInBar({ beats: 3, beatType: 4 })]).toEqual([2, 3]);
  });
});

describe("attempts", () => {
  test("how many are left, and how it reads", () => {
    expect(attemptsLeft(null, 4)).toBeNull();
    expect(attemptsLeft(3, 5)).toBe(0);
    expect(attemptsLine(3, 1)).toBe("1 of 3 attempts used");
    expect(attemptsLine(null, 0)).toBe("As many attempts as you like");
    expect(bestOf([{ overall: 70 }, { overall: null }, { overall: 88 }])).toEqual({ overall: 88 });
  });

  test("what is kept of a run, and what the server accepts", () => {
    const perf = {
      overall: 81.6, pitch: 90.2, rhythm: 73,
      notes: [{ cursor: 4, pitch: 100, rhythm: 50, cents: 12.4, onsetBeats: 0.3333, sung: 64.04 }, { cursor: 6, pitch: 0, rhythm: 0, cents: null, onsetBeats: null, sung: null }],
    } as unknown as PerfResult;
    const kept = marksOf(perf);
    expect(kept).toEqual({ overall: 82, pitch: 90, rhythm: 73, marks: [[4, 100, 50, 12, 0.33, 64.04], [6, 0, 0, null, null, null]] });
    expect(checkAttemptResult(kept).ok).toBe(true);
    expect(checkAttemptResult({ ...kept, overall: 101 }).ok).toBe(false);
    expect(checkAttemptResult({ ...kept, marks: [[1, 2, 3]] }).ok).toBe(false);
    expect(checkAttemptResult({ ...kept, marks: [["x", 1, 1, null, null, null]] }).ok).toBe(false);
  });

  test("a take's path names its assignment and attempt, and nothing else", () => {
    expect(takePath("a1", "t1", "audio/webm;codecs=opus")).toBe("attempts/a1/t1.webm");
    expect(takePath("a1", "t1", "audio/mp4")).toBe("attempts/a1/t1.mp4");
    expect(takePath("a1", "../t1", "audio/webm")).toBeNull();
    expect(takePath("a1", "t1", "text/html")).toBeNull();
    expect(TAKE_PATH.exec("attempts/a1/t1.webm")?.slice(1)).toEqual(["a1", "t1", "webm"]);
    expect(TAKE_PATH.test("attempts/a1/t1.webm/../x")).toBe(false);
  });
});
