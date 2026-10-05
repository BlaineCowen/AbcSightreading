import { describe, expect, test } from "bun:test";
import {
  NO_SHORT_CAPS,
  figureCap,
  readShortSkipParams,
  setShortSkip,
  shortCapsFrom,
  shortSkipsFrom,
  writeShortSkipParams,
} from "../../src/lib/short-note-skips";

/** A run of rhythm objects as the generator flattens them: one per note. */
const figure = (lengths: number[], over: Record<string, unknown> = {}) =>
  lengths.map((totalValue, k) => ({ totalValue, isPatternNote: lengths.length > 1, isPatternStart: k === 0, ...over }));

describe("figureCap: which cap governs the move into note i", () => {
  const caps = { eighth: 2, sixteenth: 1 };

  test("the second eighth of a ti-ti takes the 8th cap", () => {
    const r = [...figure([8]), ...figure([4, 4])];
    expect(figureCap(2, r, caps)).toBe(2);
  });

  test("a figure's first note follows Max skip (no cap)", () => {
    const r = [...figure([8]), ...figure([4, 4])];
    expect(figureCap(1, r, caps)).toBe(Infinity);
    expect(figureCap(0, r, caps)).toBe(Infinity);
  });

  test("sixteenths inside a figure take the 16th cap", () => {
    const r = figure([2, 2, 2, 2]);
    expect([1, 2, 3].map((i) => figureCap(i, r, caps))).toEqual([1, 1, 1]);
    // eighth then two sixteenths: the sixteenths land on 16ths
    const s = figure([4, 2, 2]);
    expect([1, 2].map((i) => figureCap(i, s, caps))).toEqual([1, 1]);
  });

  test("not after a longer note, not across figures, not at a cadence end", () => {
    // ti ta ti: the last eighth follows a quarter
    expect(figureCap(2, figure([4, 8, 4]), caps)).toBe(Infinity);
    // dotted eighth then sixteenth: the predecessor is longer than an eighth
    expect(figureCap(1, figure([6, 2]), caps)).toBe(Infinity);
    // two separate single eighths
    const singles = [...figure([4]), ...figure([4])];
    expect(figureCap(1, singles, caps)).toBe(Infinity);
    const r = figure([4, 4]);
    (r[1] as any).isCadenceEnd = true;
    expect(figureCap(1, r, caps)).toBe(Infinity);
  });

  test("past the end there is no cap", () => {
    expect(figureCap(5, figure([4, 4]), caps)).toBe(Infinity);
  });
});

describe("shortCapsFrom: the generator's params", () => {
  test("explicit caps win", () => {
    expect(shortCapsFrom({ maxEighthSkip: 1, maxSixteenthSkip: 0, moveOnEighthNotes: false })).toEqual({ eighth: 1, sixteenth: 0 });
  });
  test("old callers: Move eighths off is both caps 0, on is no cap", () => {
    expect(shortCapsFrom({ moveOnEighthNotes: false })).toEqual({ eighth: 0, sixteenth: 0 });
    expect(shortCapsFrom({})).toEqual({ eighth: 0, sixteenth: 0 });
    expect(shortCapsFrom({ moveOnEighthNotes: true })).toEqual(NO_SHORT_CAPS);
  });
});

describe("shortSkipsFrom: saved settings and back-compat", () => {
  test("no saved state: linked to Max skip", () => {
    expect(shortSkipsFrom({}, 3)).toEqual({ max8th: 3, max16th: 3, linked: true });
    expect(shortSkipsFrom(undefined, 2)).toEqual({ max8th: 2, max16th: 2, linked: true });
  });
  test("moveEighthNotes false: 0 and 0, unlinked", () => {
    expect(shortSkipsFrom({ moveEighthNotes: false }, 4)).toEqual({ max8th: 0, max16th: 0, linked: false });
  });
  test("moveEighthNotes true: linked to Max skip", () => {
    expect(shortSkipsFrom({ moveEighthNotes: true }, 5)).toEqual({ max8th: 5, max16th: 5, linked: true });
  });
  test("new fields win over moveEighthNotes, clamped to 0-8", () => {
    expect(shortSkipsFrom({ max8th: 1, max16th: 12, shortSkipsLinked: false, moveEighthNotes: false }, 4))
      .toEqual({ max8th: 1, max16th: 8, linked: false });
    expect(shortSkipsFrom({ max8th: -2, max16th: 0 }, 4)).toEqual({ max8th: 0, max16th: 0, linked: false });
  });
});

describe("setShortSkip: the steppers", () => {
  const start = { maxSkip: 2, max8th: 2, max16th: 2, linked: true };
  test("linked: any stepper sets all three", () => {
    expect(setShortSkip(start, "max8th", 3)).toEqual({ maxSkip: 3, max8th: 3, max16th: 3, linked: true });
    expect(setShortSkip(start, "maxSkip", 1)).toEqual({ maxSkip: 1, max8th: 1, max16th: 1, linked: true });
  });
  test("linked: Max skip never goes below 1, the others follow it", () => {
    expect(setShortSkip({ ...start, maxSkip: 1, max8th: 1, max16th: 1 }, "max16th", 0))
      .toEqual({ maxSkip: 1, max8th: 0, max16th: 0, linked: true });
  });
  test("unlinked: only the one", () => {
    expect(setShortSkip({ ...start, linked: false }, "max16th", 0)).toEqual({ maxSkip: 2, max8th: 2, max16th: 0, linked: false });
  });
  test("ranges: Max skip 1-8, 8th and 16th 0-8", () => {
    const u = { ...start, linked: false };
    expect(setShortSkip(u, "maxSkip", 0).maxSkip).toBe(1);
    expect(setShortSkip(u, "maxSkip", 9).maxSkip).toBe(8);
    expect(setShortSkip(u, "max8th", -1).max8th).toBe(0);
    expect(setShortSkip(u, "max8th", 9).max8th).toBe(8);
  });
});

describe("URL params", () => {
  test("round trip", () => {
    const p = new URLSearchParams();
    writeShortSkipParams({ max8th: 1, max16th: 0, linked: false }, p);
    expect(p.toString()).toBe("max8th=1&max16th=0&shortSkipsLinked=false");
    expect(readShortSkipParams(p)).toEqual({ max8th: 1, max16th: 0, shortSkipsLinked: false });
  });
  test("an old link carries none", () => {
    expect(readShortSkipParams(new URLSearchParams("moveEighthNotes=false"))).toEqual({});
  });
});

describe("eighth pairs on one pitch (what is left of Max 8th / 16th skip)", () => {
  const { eighthsFrom, capsFor } = require("../../src/lib/short-note-skips");
  test("a saved setting wins; an old Max 8th skip of 0 is one pitch, 1 leaves short notes out of Skips between", () => {
    expect(eighthsFrom({ eighthPairsOnePitch: true, max8th: 4 }, 4)).toEqual({ onePitch: true, dropShortSkips: false });
    expect(eighthsFrom({ max8th: 0, max16th: 0 }, 4)).toEqual({ onePitch: true, dropShortSkips: false });
    expect(eighthsFrom({ moveEighthNotes: false }, 4)).toEqual({ onePitch: true, dropShortSkips: false });
    expect(eighthsFrom({ max8th: 1, max16th: 1 }, 4)).toEqual({ onePitch: false, dropShortSkips: true });
    expect(eighthsFrom({}, 4)).toEqual({ onePitch: false, dropShortSkips: false });
  });
  test("one pitch holds the pair; otherwise no cap (finite, for JSON)", () => {
    expect(capsFor({ onePitch: true })).toEqual({ maxEighthSkip: 0, maxSixteenthSkip: 0 });
    expect(capsFor({ onePitch: false }).maxEighthSkip).toBeGreaterThan(8);
  });
});
