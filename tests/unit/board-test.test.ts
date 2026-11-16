import { describe, expect, test } from "bun:test";
import { byName, doneCount, isBoardTest } from "../../src/lib/board-test";
import { checkAssignmentRequest } from "../../src/lib/practice";

const custom = { presetKey: "custom:unison", custom: { name: "Test", params: { selectedKeys: ["C"] } } };

describe("board tests", () => {
  test("only params.board === true is a board test", () => {
    expect(isBoardTest({ board: true })).toBe(true);
    expect(isBoardTest({ board: "true" })).toBe(false);
    expect(isBoardTest(null)).toBe(false);
    expect(isBoardTest({})).toBe(false);
  });

  test("a board test needs no minutes; anything else still does", () => {
    const board = checkAssignmentRequest({ ...custom, board: true, minutes: 0 });
    expect(board.ok && board.value.board).toBe(true);
    expect(board.ok && board.value.minutes).toBe(0);
    expect(checkAssignmentRequest({ ...custom, minutes: 0 }).ok).toBe(false);
  });

  test("a song is never a board test", () => {
    const r = checkAssignmentRequest({ presetKey: "piece:abc", piece: { from: 1, to: 4 }, board: true });
    expect(r.ok && r.value.board).toBeFalsy();
  });

  test("names in order, and who is done", () => {
    const s = [
      { id: "1", name: "bao Nguyen", tries: 0, best: null },
      { id: "2", name: "Ana Diaz", tries: 2, best: 80 },
    ];
    expect([...s].sort(byName).map((x) => x.id)).toEqual(["2", "1"]);
    expect(doneCount(s)).toBe(1);
  });
});
