import { describe, expect, test } from "bun:test";
import { rhythms } from "../../src/resources/rhythms";
import {
  selectableCompoundRhythms,
  selectableRhythms,
  selectableRhythmsFor,
} from "../../src/lib/selectable-rhythms";

const by = (name: string) => {
  const r = rhythms.find((x) => x.name === name);
  if (!r) throw new Error(`no rhythm named ${name}`);
  return r;
};
const units = (v: string) => parseInt(v.replace(/^z/, ""), 10);

describe("the rhythm catalogue", () => {
  test("every figure's parts add up to its length", () => {
    for (const r of rhythms) {
      expect([r.name, r.abcValue.reduce((s, v) => s + units(v), 0)]).toEqual([r.name, r.totalValue]);
    }
  });

  test("every figure's meter values match its written lengths", () => {
    for (const r of rhythms) {
      expect([r.name, r.meterValue.map((m) => Math.round(m * 32))]).toEqual([r.name, r.abcValue.map(units)]);
    }
  });

  test("a rest is written as a rest", () => {
    for (const r of rhythms.filter((x) => x.rest)) {
      for (const v of r.abcValue) expect([r.name, v]).toEqual([r.name, v.startsWith("z") ? v : `z${v}`]);
    }
  });

  test("the dotted rests compound meter leans on", () => {
    expect(by("dotEighthRest")).toMatchObject({ abcValue: ["z6"], meterValue: [3 / 16], totalValue: 6 });
    expect(by("dotQuarterRest")).toMatchObject({ abcValue: ["z12"], meterValue: [3 / 8], totalValue: 12 });
    expect(by("dotHalfRest")).toMatchObject({ abcValue: ["z24"], meterValue: [3 / 4], totalValue: 24 });
  });

  test("every figure says which meter it belongs to", () => {
    for (const r of rhythms) expect([r.name, r.meterKind === "simple" || r.meterKind === "compound"]).toEqual([r.name, true]);
  });

  test("every compound figure fills whole dotted-quarter beats", () => {
    for (const r of rhythms.filter((x) => x.meterKind === "compound")) {
      expect([r.name, r.totalValue === 12 || r.totalValue === 24]).toEqual([r.name, true]);
    }
  });

  test("the compound vocabulary is the spec's, in its three groups", () => {
    const group = (g: string) =>
      selectableCompoundRhythms.filter((r) => r.pickerGroup === g).map((r) => r.name).sort();
    expect(group("Core")).toEqual(["dotHalfCompound", "dotQuarter", "eighthQuarter", "quarterEighth", "threeEighths"]);
    expect(group("Rests")).toEqual(["dotHalfRest", "dotQuarterRest", "eighthRestTwoEighths", "quarterEighthRest", "twoEighthsEighthRest"]);
    expect(group("Sixteenths")).toEqual([
      "eighthTwoSixteenthsEighth", "quarterTwoSixteenths", "sixSixteenths", "twoEighthsTwoSixteenths", "twoSixteenthsTwoEighths",
    ]);
    expect(selectableCompoundRhythms.length).toBe(15);
  });

  test("the vocabularies never mix", () => {
    expect(selectableRhythms.some((r) => r.meterKind === "compound")).toBe(false);
    expect(selectableCompoundRhythms.every((r) => r.meterKind === "compound")).toBe(true);
    expect(selectableRhythmsFor("simple")).toBe(selectableRhythms);
    expect(selectableRhythmsFor("compound")).toBe(selectableCompoundRhythms);
  });
});
