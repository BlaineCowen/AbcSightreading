import { describe, expect, test } from "bun:test";
import { canFillExercise } from "../../src/lib/rhythm-feasibility";
import { rhythms } from "../../src/resources/rhythms";

const by = (name: string) => {
  const r = rhythms.find((x) => x.name === name);
  if (!r) throw new Error(`no rhythm named ${name}`);
  return r;
};

// totalValue is in 32nd-note units: quarter 8, half 16, whole 32, and a
// dotted quarter + eighth is 16. A 4/4 bar is 32, 3/4 is 24, 2/4 is 16.
const FOUR_FOUR = 32;
const THREE_FOUR = 24;

describe("whether a selection can fill a bar", () => {
  test("the reported case: dotted quarter + eighth with only long notes in 3/4", () => {
    // 16 and 16 cannot reach 24, so generation refuses on every press. The UI
    // has to say so rather than let it look like the app is stuck.
    expect(
      canFillExercise([by("dotQuarterEighth"), by("half")], THREE_FOUR, 8 * THREE_FOUR, false)
    ).toBe(false);
    expect(
      canFillExercise([by("dotQuarterEighth")], THREE_FOUR, 8 * THREE_FOUR, false)
    ).toBe(false);
  });

  test("the same selection is fine in 4/4, where two of them make a bar", () => {
    expect(
      canFillExercise([by("dotQuarterEighth")], FOUR_FOUR, 8 * FOUR_FOUR, false)
    ).toBe(true);
  });

  test("adding a quarter rescues it in 3/4", () => {
    // This is the advice the warning gives, so it had better be true.
    expect(
      canFillExercise(
        [by("dotQuarterEighth"), by("half"), by("quarter")],
        THREE_FOUR,
        8 * THREE_FOUR,
        false
      )
    ).toBe(true);
  });

  test("the ordinary selections stay possible", () => {
    expect(canFillExercise([by("quarter")], FOUR_FOUR, 8 * FOUR_FOUR, false)).toBe(true);
    expect(
      canFillExercise([by("whole"), by("half"), by("quarter")], FOUR_FOUR, 8 * FOUR_FOUR, false)
    ).toBe(true);
    expect(canFillExercise([by("quarter")], THREE_FOUR, 8 * THREE_FOUR, false)).toBe(true);
  });

  test("a note longer than the bar cannot fill it", () => {
    expect(canFillExercise([by("whole")], THREE_FOUR, 8 * THREE_FOUR, false)).toBe(false);
  });
});

describe("compound meter fills by dotted-quarter beats", () => {
  test("a dotted half alone fills 6/8, but not 9/8 without ties", () => {
    expect(canFillExercise([by("dotHalfCompound")], 24, 4 * 24, false, 12)).toBe(true);
    expect(canFillExercise([by("dotHalfCompound")], 36, 4 * 36, false, 12)).toBe(false);
  });

  test("with ties a dotted half crosses the 9/8 barline; a rest never does", () => {
    // Split dotted quarter + dotted quarter: plainly written in compound meter.
    expect(canFillExercise([by("dotHalfCompound")], 36, 4 * 36, true, 12)).toBe(true);
    expect(canFillExercise([by("dotHalfRest"), by("threeEighths")], 36, 36, true, 12)).toBe(true);
    expect(canFillExercise([by("dotHalfRest")], 36, 4 * 36, true, 12)).toBe(false);
  });

  test("one bar of 9/8 is three beats: two-beat notes cannot make it", () => {
    expect(canFillExercise([by("dotHalfCompound")], 36, 36, true, 12)).toBe(false);
  });

  test("a simple figure never fills a compound bar, even one a multiple of a beat", () => {
    // dotHalf is 24 units - two dotted-quarter beats - but it is simple meter's
    // figure; the two vocabularies never mix.
    expect(canFillExercise([by("dotHalf")], 24, 4 * 24, false, 12)).toBe(false);
    expect(canFillExercise([by("dotHalf"), by("threeEighths")], 24, 4 * 24, false, 12)).toBe(true);
  });

  test("any one-beat figure fills every compound meter", () => {
    for (const ts of [24, 36, 48]) {
      expect(canFillExercise([by("threeEighths")], ts, 8 * ts, false, 12)).toBe(true);
    }
  });
});
