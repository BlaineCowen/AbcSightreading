import { describe, expect, test } from "bun:test";
import { beatLabel } from "../../src/lib/games/beat-label";

describe("beatLabel", () => {
  test("whole beats", () => {
    expect(beatLabel(1)).toBe("1");
    expect(beatLabel(2)).toBe("2");
    expect(beatLabel(4)).toBe("4");
  });
  test("parts of a beat in simple meter (32nds over a beat of 8)", () => {
    expect(beatLabel(4 / 8)).toBe("½");
    expect(beatLabel(2 / 8)).toBe("¼");
    expect(beatLabel(6 / 8)).toBe("¾");
    expect(beatLabel(12 / 8)).toBe("1½");
    expect(beatLabel(24 / 8)).toBe("3");
  });
  test("compound meter: a dotted quarter beat of 12", () => {
    expect(beatLabel(4 / 12)).toBe("⅓");
    expect(beatLabel(8 / 12)).toBe("⅔");
    expect(beatLabel(12 / 12)).toBe("1");
    expect(beatLabel(16 / 12)).toBe("1⅓");
    expect(beatLabel(6 / 12)).toBe("½");
  });
  test("nothing for no length", () => {
    expect(beatLabel(0)).toBe("");
    expect(beatLabel(NaN)).toBe("");
  });
});
