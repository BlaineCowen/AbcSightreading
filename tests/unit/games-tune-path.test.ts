import { describe, expect, test } from "bun:test";
import { PATH_LEVELS, makePath, nextFrom, semiOf, shortOf, stepOf, sylOf, type PathLevel } from "../../src/lib/games/tune-path";

// Octavo Academy's own tests for these rules (tests/ear-games.test.ts there), copied with them.
describe("Catch the tune's tunes", () => {
  test("note names, below do and above it", () => {
    expect(["low so", "low la", "low ti", "do", "re", "fa", "ti", "high do", "high re"].map(stepOf)).toEqual([-3, -2, -1, 0, 1, 3, 6, 7, 8]);
    expect([-3, -2, 0, 7].map(semiOf)).toEqual([-5, -3, 0, 12]);
    expect([-2, 0, 7].map(sylOf)).toEqual(["low la", "do", "high do"]);
    expect([-2, 0, 7].map(shortOf)).toEqual(["l,", "d", "d'"]);
    expect(stepOf("sol")).toBe(4);
    expect(stepOf("banana")).toBeNaN();
  });
  for (const level of PATH_LEVELS)
    test(level.name, () => {
      let biggest = 0;
      for (let k = 0; k < 300; k++) {
        const t = makePath(level);
        expect(t.length).toBeGreaterThanOrEqual(level.length[0]);
        expect(t.length).toBeLessThanOrEqual(level.length[1]);
        t.forEach((s) => expect(level.notes).toContain(sylOf(s)));
        expect((level.starts ?? ["do", "mi", "so"]).map(stepOf)).toContain(t[0]);
        expect(t[t.length - 1]).toBe(0);
        if (level.newNote) expect(t.map(sylOf)).toContain(level.newNote);
        t.slice(1).forEach((s, i) => {
          expect(Math.abs(s - t[i])).toBeLessThanOrEqual(level.maxMove);
          expect(nextFrom(level, t[i])).toContain(s);
          if (i > 0) expect(s === t[i] && t[i] === t[i - 1]).toBe(false);
        });
        biggest = Math.max(biggest, ...t.slice(1).map((s, i) => Math.abs(s - t[i])));
      }
      expect(biggest).toBe(level.maxMove);
    });
  test("from re on steps: do, re or mi", () => expect(nextFrom(PATH_LEVELS[0], 1)).toEqual([0, 1, 2]));
  test("a lesson's own level: below do, ending anywhere", () => {
    const level: PathLevel = { name: "x", moves: "steps", notes: ["low la", "low ti", "do", "re"], length: [6, 6], maxMove: 1, endOn: null, starts: ["low la"] };
    for (let k = 0; k < 100; k++) {
      const t = makePath(level);
      expect(t[0]).toBe(-2);
      t.forEach((s) => expect(s).toBeGreaterThanOrEqual(-2));
    }
  });
  test("a lesson's fixed tunes, in turn", () => {
    const level: PathLevel = { name: "x", moves: "steps", notes: ["do", "re", "mi"], length: [3, 3], maxMove: 1, tunes: [["mi", "re", "do"], ["do", "re", "mi"]] };
    expect(makePath(level, Math.random, 0)).toEqual([2, 1, 0]);
    expect(makePath(level, Math.random, 1)).toEqual([0, 1, 2]);
  });
});
