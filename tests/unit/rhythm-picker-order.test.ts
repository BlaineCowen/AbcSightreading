import { describe, expect, test } from "bun:test";
import {
  rhythmPickerGroups,
  selectableCompoundRhythms,
  selectableRhythms,
  containsRest,
  PICKER_ORDER,
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

  test("follows the chosen order (PICKER_ORDER) exactly", () => {
    expect(groups.map((g) => ({ label: g.label, names: g.rhythms.map((r) => r.name) }))).toEqual(PICKER_ORDER.simple);
  });

  test("a figure the order does not name still appears, at the end of its group", () => {
    const extra = { ...selectableRhythms.find((r) => r.name === "quarter")!, name: "aNewFigure" };
    const g = rhythmPickerGroups([...selectableRhythms, extra]);
    expect(g[0].rhythms.at(-1)?.name).toBe("aNewFigure");
  });

  test("a single note comes before the patterns of its length", () => {
    const notes = groups[0].rhythms.map((r) => r.name);
    expect(notes.indexOf("quarter")).toBeLessThan(notes.indexOf("eighthEighth"));
  });
});

describe("the compound picker", () => {
  const groups = rhythmPickerGroups(selectableCompoundRhythms);

  test("Core, then Rests, then Sixteenths, nothing lost", () => {
    expect(groups.map((g) => g.label)).toEqual(["Core", "Rests", "Sixteenths"]);
    expect(groups.flatMap((g) => g.rhythms.map((r) => r.name)).sort()).toEqual(
      selectableCompoundRhythms.map((r) => r.name).sort()
    );
  });

  test("follows the chosen order (PICKER_ORDER) exactly", () => {
    expect(groups.map((g) => ({ label: g.label, names: g.rhythms.map((r) => r.name) }))).toEqual(PICKER_ORDER.compound);
  });
});
