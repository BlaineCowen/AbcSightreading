import { describe, expect, test } from "bun:test";
import { strToU8 } from "fflate";
import { readMusicXml } from "../../src/lib/pieces/read-musicxml";
import { checkPieceAssignment, excerptLabel, partProblem, pieceAssignmentOf, singleLineParts } from "../../src/lib/pieces/assign";
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
  test("one line can; chords and a meter change say why not", () => {
    expect(partProblem(score, "P1", 0, 1)).toBeNull();
    expect(partProblem(score, "P2", 0, 1)).toMatch(/more than one note at a time in bar 1/);
    expect(partProblem(score, "P2", 1, 1)).toBeNull();
    expect(partProblem(score, "P1", 0, 2)).toMatch(/meter changes in bar 3/);
    expect(partProblem(score, "nope", 0, 0)).toBe("Choose a part.");
    expect(singleLineParts(score)).toEqual(["P1", "P2"]);
  });

  test("the request is checked and tidied: the part never plays along with itself", () => {
    const ok = checkPieceAssignment({ partId: "P1", from: 0, to: 1, accompaniment: ["P2", "P1", "P9"], tempo: 92.4, maxAttempts: 3, strictness: "strict" }, "pc1", score);
    expect(ok).toEqual({ ok: true, value: { pieceId: "pc1", partId: "P1", from: 0, to: 1, accompaniment: ["P2"], tempo: 92, maxAttempts: 3, strictness: "strict" } });
    const open = checkPieceAssignment({ partId: "P1", from: 0, to: 0, accompaniment: [], tempo: 100, maxAttempts: null }, "pc1", score);
    expect(open.ok && open.value.maxAttempts).toBeNull();
    expect(checkPieceAssignment({ partId: "P1", from: 0, to: 0, tempo: 100, maxAttempts: 99 }, "pc1", score).ok).toBe(false);
    expect(checkPieceAssignment({ partId: "P1", from: 0, to: 0, tempo: 5 }, "pc1", score).ok).toBe(false);
    if (ok.ok) expect(pieceAssignmentOf(JSON.parse(JSON.stringify(ok.value)))).toEqual(ok.value);
  });

  test("labels name the part and the printed bars", () => {
    expect(excerptLabel(score, { partId: "P1", from: 0, to: 1 })).toBe("Soprano, bars 1 to 2");
    expect(excerptLabel(score, { partId: "P1", from: 2, to: 2 })).toBe("Soprano, bar 3");
  });
});

describe("a piece as an assignment", () => {
  test("its key, its minutes (none needed), where it opens and its progress", () => {
    expect(parsePresetKey("piece:abc123")).toEqual({ kind: "piece", id: "abc123" });
    expect(parsePresetKey("piece:../x")).toBeNull();
    const req = checkAssignmentRequest({ presetKey: "piece:abc123", piece: { partId: "P1" } });
    expect(req.ok && req.value.minutes).toBe(0);
    expect(req.ok && req.value.piece).toEqual({ partId: "P1" });
    // Sight reading still needs minutes.
    expect(checkAssignmentRequest({ presetKey: "step:sbs-01-rhythm", minutes: 0 }).ok).toBe(false);
    expect(assignmentPath({ page: "piece", presetKey: "piece:abc123" })).toBe("/pieces/abc123");
    expect(assignmentPath({ page: "unison", presetKey: "step:x" })).toBe("/sightreading");
    expect(assignmentProgress(0, 0)).toEqual({ status: "not-started", percent: 0 });
    expect(assignmentProgress(40, 0)).toEqual({ status: "in-progress", percent: 0 });
  });
});
