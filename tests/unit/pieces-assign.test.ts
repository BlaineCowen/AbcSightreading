import { describe, expect, test } from "bun:test";
import { strToU8 } from "fflate";
import { readMusicXml } from "../../src/lib/pieces/read-musicxml";
import { QUIET_LEVEL, barsLabel, barsProblem, checkPieceAssignment, levelFor, partProblem, partsFor, pieceAssignmentOf, type Hearing } from "../../src/lib/pieces/assign";
import { assignmentPath, assignmentProgress, checkAssignmentRequest } from "../../src/lib/practice";
import { parsePresetKey } from "../../src/lib/class-validate";
import { attrs, note, scoreXml } from "./fixtures/musicxml-pieces";

/** A tune, a piano part in chords, and a 3/4 bar at the end. */
const score = readMusicXml(
  strToU8(
    scoreXml([
      {
        id: "P1",
        name: "Soprano",
        measures: [
          attrs() + note("C5", 4, { type: "half" }) + note("D5", 4, { type: "half" }),
          note("E5", 8, { type: "whole" }),
          `<attributes><time><beats>3</beats><beat-type>4</beat-type></time></attributes>` + note("F5", 6, { type: "half" }),
        ],
      },
      {
        id: "P2",
        name: "Piano",
        measures: [
          attrs() + note("C4", 8, { type: "whole" }) + note("E4", 8, { chord: true, type: "whole" }),
          note("C4", 8, { type: "whole" }),
          `<attributes><time><beats>3</beats><beat-type>4</beat-type></time></attributes>` + note("C4", 6, { type: "half" }),
        ],
      },
    ]),
  ),
  "score.musicxml",
);

describe("what can be assigned", () => {
  test("a part a student may take is one line; bars need one meter and at least one such part", () => {
    expect(partProblem(score, "P1", 0, 1)).toBeNull();
    expect(partProblem(score, "P2", 0, 1)).toMatch(/more than one note at a time in bar 1/);
    expect(partsFor(score, 0, 1)).toEqual(["P1"]);
    expect(partsFor(score, 1, 1)).toEqual(["P1", "P2"]);
    expect(barsProblem(score, 0, 1)).toBeNull();
    expect(barsProblem(score, 0, 2)).toMatch(/meter changes in bar 3/);
    expect(barsProblem(score, 2, 0)).toBe("Choose the bars.");
    // A lead-in starts at or before the graded bars, in the same meter.
    expect(barsProblem(score, 1, 1, 0)).toBeNull();
    expect(barsProblem(score, 1, 1, 2)).toMatch(/lead-in/);
    expect(checkPieceAssignment({ from: 1, to: 1, leadIn: 0, tempo: 90 }, "pc1", score).ok && "ok").toBe("ok");
  });

  test("the request is checked and tidied", () => {
    const ok = checkPieceAssignment({ from: 0, to: 1, hearing: "selected", playing: ["P2", "P2", "P9"], tempo: 92.4, maxAttempts: 3, strictness: "strict" }, "pc1", score);
    expect(ok).toEqual({ ok: true, value: { pieceId: "pc1", from: 0, to: 1, leadIn: 0, hearing: "selected", playing: ["P2"], tempo: 92, maxAttempts: 3, strictness: "strict" } });
    // Only "selected" keeps a list; an unknown choice is "the other parts".
    const others = checkPieceAssignment({ from: 0, to: 0, hearing: "loud", playing: ["P2"], tempo: 100 }, "pc1", score);
    expect(others.ok && [others.value.hearing, others.value.playing, others.value.maxAttempts]).toEqual(["others", [], null]);
    expect(checkPieceAssignment({ from: 0, to: 0, hearing: "selected", playing: [], tempo: 100 }, "pc1", score).ok).toBe(false);
    expect(checkPieceAssignment({ from: 0, to: 0, tempo: 100, maxAttempts: 99 }, "pc1", score).ok).toBe(false);
    expect(checkPieceAssignment({ from: 0, to: 0, tempo: 5 }, "pc1", score).ok).toBe(false);
    if (ok.ok) expect(pieceAssignmentOf(JSON.parse(JSON.stringify(ok.value)))).toEqual(ok.value);
  });

  test("what each student hears, by the teacher's choice and their own part", () => {
    const a = (hearing: Hearing, playing: string[] = []) => ({ hearing, playing });
    expect([levelFor(a("others"), "P1", "P1"), levelFor(a("others"), "P2", "P1")]).toEqual([0, 1]);
    expect([levelFor(a("quiet"), "P1", "P1"), levelFor(a("quiet"), "P2", "P1")]).toEqual([QUIET_LEVEL, 1]);
    expect([levelFor(a("selected", ["P2"]), "P2", "P1"), levelFor(a("selected", ["P1"]), "P1", "P1")]).toEqual([1, 0]);
    expect(levelFor(a("selected", ["P2"]), "P3", "P1")).toBe(0);
    expect([levelFor(a("acappella"), "P1", "P1"), levelFor(a("acappella"), "P2", "P1")]).toEqual([0, 0]);
  });

  test("labels name the printed bars", () => {
    expect(barsLabel(score, { from: 0, to: 1 })).toBe("bars 1 to 2");
    expect(barsLabel(score, { from: 2, to: 2 })).toBe("bar 3");
  });
});

describe("a piece as an assignment", () => {
  test("its key, its minutes (none needed), where it opens and its progress", () => {
    expect(parsePresetKey("piece:abc123")).toEqual({ kind: "piece", id: "abc123" });
    expect(parsePresetKey("piece:../x")).toBeNull();
    const req = checkAssignmentRequest({ presetKey: "piece:abc123", piece: { from: 0 } });
    expect(req.ok && req.value.minutes).toBe(0);
    expect(req.ok && req.value.piece).toEqual({ from: 0 });
    // Sight reading still needs minutes.
    expect(checkAssignmentRequest({ presetKey: "step:sbs-01-rhythm", minutes: 0 }).ok).toBe(false);
    expect(assignmentPath({ page: "piece", presetKey: "piece:abc123" })).toBe("/pieces/abc123");
    expect(assignmentPath({ page: "unison", presetKey: "step:x" })).toBe("/sightreading");
    expect(assignmentProgress(0, 0)).toEqual({ status: "not-started", percent: 0 });
    expect(assignmentProgress(40, 0)).toEqual({ status: "in-progress", percent: 0 });
  });
});
