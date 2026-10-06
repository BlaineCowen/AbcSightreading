import { describe, expect, test } from "bun:test";
import { clampScale, withLineSpacing } from "../../src/lib/score-view";
import { measuresPerLine } from "../../src/lib/score-layout";

describe("the score's layout, from the Layout menu", () => {
  test("bars per line: the reader's choice, up to the bars there are", () => {
    expect(measuresPerLine({ measures: 8, narrow: false, dense: true, want: 6 })).toBe(6);
    expect(measuresPerLine({ measures: 4, narrow: false, dense: false, want: 6 })).toBe(4);
    expect(measuresPerLine({ measures: 8, narrow: true, dense: false, want: 1 })).toBe(1);
    // abcjs could fit no more than 3 last time: no more than that.
    expect(measuresPerLine({ measures: 8, narrow: false, dense: false, want: 6, most: 3 })).toBe(3);
    // No choice: the automatic rule, unchanged.
    expect(measuresPerLine({ measures: 8, narrow: false, dense: false, want: null })).toBe(4);
  });
  test("line spacing goes into the header; normal leaves the tune alone", () => {
    const abc = "X:1\nM:4/4\nK:C\nC8 D8 |";
    expect(withLineSpacing(abc, "wide")).toBe("X:1\n%%staffsep 90\nM:4/4\nK:C\nC8 D8 |");
    expect(withLineSpacing(abc, "normal")).toBe(abc);
  });
  test("size stays between half and five times, in tenths", () => {
    expect(clampScale(7)).toBe(5);
    expect(clampScale(0.2)).toBe(0.5);
    expect(clampScale(2.04)).toBe(2);
  });
});
