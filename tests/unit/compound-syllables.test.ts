import { describe, expect, test } from "bun:test";
import { syllablesForFigure } from "../../src/lib/generateUnison";
import { selectableCompoundRhythms } from "../../src/lib/selectable-rhythms";
import {
  checkCustomSyllables,
  counting,
  customSyllableSystem,
  kodaly,
  syllableTemplates,
  type SyllableSystem,
} from "../../src/resources/rhythm-syllables";

const fig = (name: string) => selectableCompoundRhythms.find((r) => r.name === name)!;
const read = (system: SyllableSystem, name: string) => syllablesForFigure(fig(name), system);
const template = (id: string) => syllableTemplates.find((t) => t.id === id)!.syllables;

describe("compound syllables, from the spec's table", () => {
  test("Counting is Eastman: 1 la li", () => {
    expect(read(counting, "threeEighths")).toEqual(["1", "la", "li"]);
    expect(read(counting, "sixSixteenths")).toEqual(["1", "ta", "la", "ta", "li", "ta"]);
    expect(read(counting, "quarterEighth")).toEqual(["1", "li"]);
    expect(read(counting, "eighthQuarter")).toEqual(["1", "la"]);
    expect(read(counting, "dotQuarter")).toEqual(["1"]);
    expect(read(counting, "dotHalfCompound")).toEqual(["1_(2)"]);
    expect(read(counting, "twoSixteenthsTwoEighths")).toEqual(["1", "ta", "la", "li"]);
    expect(read(counting, "eighthTwoSixteenthsEighth")).toEqual(["1", "la", "ta", "li"]);
    expect(read(counting, "quarterEighthRest")).toEqual(["1", "(li)"]);
    expect(read(counting, "dotQuarterRest")).toEqual(["(1)"]);
  });

  test("Kodály: ti ti ti", () => {
    expect(read(kodaly, "threeEighths")).toEqual(["ti", "ti", "ti"]);
    expect(read(kodaly, "sixSixteenths")).toEqual(["ti", "ri", "ti", "ri", "ti", "ri"]);
    expect(read(kodaly, "dotQuarter")).toEqual(["ta"]);
    expect(read(kodaly, "dotHalfCompound")).toEqual(["tu-u"]);
  });

  test("Takadimi: ta ki da", () => {
    const takadimi = customSyllableSystem(template("takadimi"));
    expect(read(takadimi, "threeEighths")).toEqual(["ta", "ki", "da"]);
    expect(read(takadimi, "sixSixteenths")).toEqual(["ta", "va", "ki", "di", "da", "ma"]);
    expect(read(takadimi, "quarterEighth")).toEqual(["ta", "da"]);
  });

  test("Gordon: du da di", () => {
    const gordon = customSyllableSystem(template("gordon"));
    expect(read(gordon, "threeEighths")).toEqual(["du", "da", "di"]);
    expect(read(gordon, "sixSixteenths")).toEqual(["du", "ta", "da", "ta", "di", "ta"]);
  });
});

describe("a teacher's own set in compound meter", () => {
  const { compoundSlots, ...before } = template("kodaly-ta-a");

  test("a set saved before compound meter reads it in Counting", () => {
    const checked = checkCustomSyllables(before);
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    const mine = customSyllableSystem(checked.value);
    for (const r of selectableCompoundRhythms) {
      expect([r.name, syllablesForFigure(r, mine)]).toEqual([r.name, syllablesForFigure(r, counting)]);
    }
  });

  test("six empty compound syllables are the same as none", () => {
    const checked = checkCustomSyllables({ ...before, compoundSlots: ["", "", "", "", "", ""] });
    expect(checked.ok && checked.value.compoundSlots).toBeFalsy();
  });

  test("a half-filled row is refused, and says how to fix it", () => {
    const checked = checkCustomSyllables({ ...before, compoundSlots: ["ti", "ka", "", "", "", ""] });
    expect(checked.ok).toBe(false);
    if (!checked.ok) expect(checked.error).toMatch(/all six/);
  });

  test("a malformed syllable in a row gets its own error, without the fill-all-six advice", () => {
    for (const bad of ["t i", "x".repeat(40)]) {
      const checked = checkCustomSyllables({ ...before, compoundSlots: ["ti", "ka", bad, "ti", "ka", "ti"] });
      expect(checked.ok).toBe(false);
      if (!checked.ok) expect(checked.error).not.toMatch(/Fill all six/);
    }
  });

  test("a non-string entry is refused, not read as empty", () => {
    for (const row of [[1, "", "", "", "", ""], ["", "", "", "", "", null], [{}, "ti", "ti", "ti", "ti", "ti"]]) {
      expect(checkCustomSyllables({ ...before, compoundSlots: row }).ok).toBe(false);
    }
  });

  test("a row of the wrong length is refused", () => {
    expect(checkCustomSyllables({ ...before, compoundSlots: ["ti", "ka"] }).ok).toBe(false);
  });

  test("a filled row is used", () => {
    const checked = checkCustomSyllables({ ...before, compoundSlots: compoundSlots });
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    expect(read(customSyllableSystem(checked.value), "threeEighths")).toEqual(["ti", "ti", "ti"]);
  });
});
