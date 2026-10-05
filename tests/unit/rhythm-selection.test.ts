import { describe, expect, test } from "bun:test";
import {
  DEFAULT_RHYTHM_NAMES,
  resolveRhythmSelection,
  selectableRhythmsFor,
  switchRhythmKind,
} from "../../src/lib/selectable-rhythms";

const names = (rs: { name: string }[]) => rs.map((r) => r.name);
const CORE = ["dotHalfCompound", "dotQuarter", "eighthQuarter", "quarterEighth", "threeEighths"];

describe("the rhythm selection follows the meter's kind", () => {
  test("Core is compound's default, eighths and quarters simple's", () => {
    expect([...DEFAULT_RHYTHM_NAMES.compound].sort()).toEqual(CORE);
    expect(DEFAULT_RHYTHM_NAMES.simple).toEqual(["eighthEighth", "quarter"]);
  });

  test("the first switch to compound selects the Core set", () => {
    const { selection } = switchRhythmKind({}, "simple", "compound", ["quarter", "half", "dotHalf"]);
    expect(names(selection).sort()).toEqual(CORE);
  });

  test("4/4 -> 6/8 -> 4/4 restores the simple selection, and back restores the compound one", () => {
    let step = switchRhythmKind({}, "simple", "compound", ["quarter", "half", "dotHalf"]);
    step = switchRhythmKind(step.memory, "compound", "simple", ["threeEighths", "sixSixteenths"]);
    expect(names(step.selection)).toEqual(["quarter", "half", "dotHalf"]);
    step = switchRhythmKind(step.memory, "simple", "compound", ["quarter", "half", "dotHalf"]);
    expect(names(step.selection)).toEqual(["threeEighths", "sixSixteenths"]);
  });

  test("moving within a kind keeps the selection", () => {
    const { selection } = switchRhythmKind({}, "compound", "compound", ["threeEighths"]);
    expect(names(selection)).toEqual(["threeEighths"]);
  });

  test("a preset or link naming the other kind's rhythms falls back to this kind's defaults", () => {
    expect(names(resolveRhythmSelection(["quarter", "half"], "compound")).sort()).toEqual(CORE);
    expect(names(resolveRhythmSelection(["threeEighths"], "simple"))).toEqual(["eighthEighth", "quarter"]);
    expect(names(resolveRhythmSelection("junk", "compound")).sort()).toEqual(CORE);
  });

  test("a preset saved in 6/8 keeps its compound selection", () => {
    expect(names(resolveRhythmSelection(["quarterEighth", "dotQuarterRest", "quarter"], "compound"))).toEqual([
      "quarterEighth",
      "dotQuarterRest",
    ]);
  });

  test("the picker shows only the meter's own figures", () => {
    expect(selectableRhythmsFor("compound").every((r) => r.meterKind === "compound")).toBe(true);
    expect(selectableRhythmsFor("simple").some((r) => r.meterKind === "compound")).toBe(false);
  });
});
