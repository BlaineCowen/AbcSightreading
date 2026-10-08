import { expect, test } from "bun:test";
import { listedSkip, skipLevelFor } from "../../src/lib/uil-skips";

// A note by degree (do 0 ... ti 6) and diatonic pitch, with do at pitch 21.
const n = (degree: number, octave = 0) => ({ name: "", degree, pitchValue: 21 + degree + 7 * octave });

test("Levels 1 and 2 skip by UIL's list; other levels by a largest skip", () => {
  expect(skipLevelFor("UIL 1")).toBe(1);
  expect(skipLevelFor("UIL 2")).toBe(2);
  expect(skipLevelFor("UIL 3")).toBe(null);
});

test("Level 2 never jumps la to mi (Blaine's report, S1 bars 5-6)", () => {
  expect(listedSkip(2, n(5), n(2))).toBe(false); // la down to mi
  expect(listedSkip(2, n(2), n(5))).toBe(false);
  expect(listedSkip(2, n(5, -1), n(2))).toBe(false); // la below up to mi
});

test("the listed skips, each in its chord", () => {
  expect(listedSkip(1, n(0), n(2), [0])).toBe(true); // do-mi in I
  expect(listedSkip(1, n(2), n(4), [0])).toBe(true); // mi-sol in I
  expect(listedSkip(1, n(0), n(4, -1), [0])).toBe(true); // do down to sol in I
  expect(listedSkip(1, n(0), n(4), [0])).toBe(false); // do UP to sol is a fifth
  expect(listedSkip(1, n(3), n(5), [3])).toBe(true); // fa-la in IV
  expect(listedSkip(1, n(0), n(5, -1), [3])).toBe(true); // do down to la in IV
  expect(listedSkip(1, n(6, -1), n(1), [4])).toBe(true); // ti-re in V
  expect(listedSkip(1, n(4), n(6), [4])).toBe(true); // sol-ti in V
  expect(listedSkip(1, n(2), n(4), [4])).toBe(false); // mi-sol is I's, not V's
  expect(listedSkip(1, n(1), n(3))).toBe(false); // re-fa: no Level 1 chord
});

test("Level 2 adds do-fa in IV and sol-re in V", () => {
  expect(listedSkip(1, n(0), n(3), [3])).toBe(false);
  expect(listedSkip(2, n(0), n(3), [3])).toBe(true);
  expect(listedSkip(2, n(0), n(3, -1), [3])).toBe(false); // fa below do is a fifth
  expect(listedSkip(2, n(4), n(1), [4])).toBe(true); // sol down to re, a fourth
  expect(listedSkip(1, n(4), n(1), [4])).toBe(false);
  expect(listedSkip(2, n(4), n(1, 1), [4])).toBe(false); // sol up to re is a fifth
});

test("a skip may leave its chord: do down to sol as I goes to V", () => {
  expect(listedSkip(2, n(0), n(4, -1), [4, 0])).toBe(true);
  expect(listedSkip(2, n(0), n(4, -1), [4])).toBe(false);
});
