import { describe, expect, test } from "bun:test";
import {
  rhythmPickerGroups,
  selectableRhythms,
  containsRest,
} from "../../src/lib/selectable-rhythms";

describe("the rhythm picker's order", () => {
  const groups = rhythmPickerGroups(selectableRhythms);

  test("notes first, then rests, and nothing lost or repeated", () => {
    expect(groups.map((g) => g.label)).toEqual(["Notes", "Rests"]);
    const names = groups.flatMap((g) => g.rhythms.map((r) => r.name));
    expect(names.sort()).toEqual(selectableRhythms.map((r) => r.name).sort());
  });

  test("a rest buried inside a pattern counts as a rest", () => {
    // eighthRestEighth has rest: false at the top level - see containsRest.
    expect(groups[0].rhythms.some(containsRest)).toBe(false);
    expect(groups[1].rhythms.every(containsRest)).toBe(true);
    expect(groups[1].rhythms.map((r) => r.name)).toContain("eighthRestEighth");
  });

  test("each group runs shortest to longest", () => {
    for (const g of groups) {
      const lengths = g.rhythms.map((r) => r.totalValue);
      expect(lengths).toEqual([...lengths].sort((a, b) => a - b));
    }
  });

  test("a single note comes before the patterns of its length", () => {
    const notes = groups[0].rhythms.map((r) => r.name);
    expect(notes.indexOf("quarter")).toBeLessThan(notes.indexOf("eighthEighth"));
  });
});
