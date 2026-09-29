import { describe, expect, test } from "bun:test";
import { barCount, evenLines, isDense, measuresPerLine } from "../../src/lib/score-layout";

/**
 * How many bars go on a line. abcjs fills each line with the number asked for
 * and leaves the rest to the last, so asking for 3 with 4 bars drew 3 and a
 * lonely 1. Written before the code.
 */
const lines = (measures: number, per: number) => {
  const out: number[] = [];
  for (let left = measures; left > 0; left -= per) out.push(Math.min(per, left));
  return out;
};

describe("bars per line", () => {
  test("Blaine's case: 4 dense bars are 2 and 2, not 3 and 1", () => {
    expect(lines(4, measuresPerLine({ measures: 4, narrow: false, dense: true }))).toEqual([2, 2]);
  });

  test("plain exercises on a wide screen: 4 a line", () => {
    for (const m of [4, 8, 12, 16, 24, 32]) expect(measuresPerLine({ measures: m, narrow: false, dense: false })).toBe(4);
  });

  test("a phone: 2 a line", () => {
    for (const m of [2, 4, 8, 16]) expect(measuresPerLine({ measures: m, narrow: true, dense: false })).toBe(2);
    expect(measuresPerLine({ measures: 8, narrow: true, dense: true })).toBe(2);
  });

  test("the last line is never more than one bar short", () => {
    for (const narrow of [false, true]) {
      for (const dense of [false, true]) {
        for (let m = 1; m <= 40; m++) {
          const ls = lines(m, measuresPerLine({ measures: m, narrow, dense }));
          expect(ls[0] - ls[ls.length - 1]).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  test("dense music never gets more than 3 a line, plain never more than 4", () => {
    for (let m = 1; m <= 40; m++) {
      expect(measuresPerLine({ measures: m, narrow: false, dense: true })).toBeLessThanOrEqual(3);
      expect(measuresPerLine({ measures: m, narrow: false, dense: false })).toBeLessThanOrEqual(4);
    }
  });

  test("dense lengths come out even where they can", () => {
    expect(lines(8, measuresPerLine({ measures: 8, narrow: false, dense: true }))).toEqual([3, 3, 2]);
    expect(lines(12, measuresPerLine({ measures: 12, narrow: false, dense: true }))).toEqual([3, 3, 3, 3]);
    // 3 a line would leave 1 on the last; 2 a line shares 16 out evenly.
    expect(lines(16, measuresPerLine({ measures: 16, narrow: false, dense: true }))).toEqual([2, 2, 2, 2, 2, 2, 2, 2]);
  });

  test("short exercises sit on one line", () => {
    expect(measuresPerLine({ measures: 2, narrow: false, dense: false })).toBe(2);
    expect(measuresPerLine({ measures: 3, narrow: false, dense: true })).toBe(3);
  });
});

describe("what makes a line dense", () => {
  test("words under the notes, or sixteenths", () => {
    expect(isDense({ lyrics: true, abc: "C8 D8 E8 F8|" })).toBe(true);
    expect(isDense({ lyrics: false, abc: "C4 D4 E2 F2 G8|" })).toBe(true); // L:1/32: 2 is a sixteenth
    expect(isDense({ lyrics: false, abc: "C8 D4 E4 F16|" })).toBe(false);
    expect(isDense({ lyrics: false, abc: "C4 D4 E24|" })).toBe(false); // 24 is not a sixteenth
  });
});

describe("counting the bars", () => {
  test("a Choral score: the first voice's barlines", () => {
    const abc = "X:1\nM:4/4\nL:1/32\nV:S\nV:A\nK:F\n% body\n[V:S] c8 c8 c8 c8 | a16 a16 | g32 | a32 |]\n[V:A] a8 a8 a8 a8 | d16 d16 | d32 | f32 |]\n";
    expect(barCount(abc)).toBe(4);
  });
  test("a Unison score over two lines, with words", () => {
    const abc = "X:1\nM:3/4\nL:1/32\nK:C\nC8 D8 E8 | F24 |\nw: do re mi fa\nG8 A8 B8 | c24 |]\n";
    expect(barCount(abc)).toBe(4);
  });
});

describe("when abcjs breaks the lines itself", () => {
  test("even lines are left alone; ragged ones are not", () => {
    expect(evenLines([4, 4])).toBe(true);
    expect(evenLines([3, 3, 2])).toBe(true);
    expect(evenLines([2, 2, 2, 2])).toBe(true);
    expect(evenLines([3, 2, 3])).toBe(false);
    expect(evenLines([3, 1])).toBe(false);
    expect(evenLines([2, 3])).toBe(false);
  });
  test("drawn again with no more a line than abcjs fitted: 8 bars as 3, 3 and 2", () => {
    expect(lines(8, measuresPerLine({ measures: 8, narrow: false, dense: false, most: 3 }))).toEqual([3, 3, 2]);
  });
});

