import { describe, expect, test } from "bun:test";
import { countInBeats, countInMeasures, countInWord, countInWords } from "../../src/lib/count-in";

/**
 * The spoken count-in, shown on screen beat by beat: "1, 2, Ready, Go" in 4/4
 * and 2/4, "1, Ready, Go" in 3/4 - the way a director counts a choir in.
 * Written before the code.
 */

describe("what is said", () => {
  test("four beats in 4/4, three in 3/4", () => {
    expect(countInWords("4/4")).toEqual(["1", "2", "Ready", "Go"]);
    expect(countInWords("3/4")).toEqual(["1", "Ready", "Go"]);
  });

  test("2/4 takes two bars, so it is counted in the same four words", () => {
    expect(countInMeasures("2/4")).toBe(2);
    expect(countInWords("2/4")).toEqual(["1", "2", "Ready", "Go"]);
  });

  test("one bar in the other meters", () => {
    expect(countInMeasures("4/4")).toBe(1);
    expect(countInMeasures("3/4")).toBe(1);
    expect(countInBeats("4/4")).toBe(4);
    expect(countInBeats("3/4")).toBe(3);
    expect(countInBeats("2/4")).toBe(4);
  });
});

describe("the word on each beat", () => {
  test("from the first beat of the count-in to the last", () => {
    expect([0, 1, 2, 3].map((b) => countInWord("4/4", b))).toEqual(["1", "2", "Ready", "Go"]);
    expect([0, 1, 2].map((b) => countInWord("3/4", b))).toEqual(["1", "Ready", "Go"]);
  });

  test("abcjs reports fractions of a beat; the word holds for the whole beat", () => {
    expect(countInWord("4/4", 2.5)).toBe("Ready");
    expect(countInWord("3/4", 0.9375)).toBe("1");
  });

  test("nothing once the music starts, or before", () => {
    expect(countInWord("4/4", 4)).toBe(null);
    expect(countInWord("3/4", 3)).toBe(null);
    expect(countInWord("2/4", 4)).toBe(null);
    expect(countInWord("4/4", -1)).toBe(null);
  });
});
