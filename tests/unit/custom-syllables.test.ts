import { describe, expect, test } from "bun:test";
import {
  checkCustomSyllables,
  customSyllableSystem,
  kodaly,
  syllableTemplates,
} from "../../src/resources/rhythm-syllables";
import { syllablesForFigure } from "../../src/lib/generateUnison";
import { selectableRhythms } from "../../src/lib/selectable-rhythms";

/**
 * A teacher's own syllables are the Kodály shape with their words. The first
 * template must BE the app's Kodály, figure for figure - otherwise "start from
 * what the app writes" starts somewhere else.
 */

const template = (id: string) => syllableTemplates.find((t) => t.id === id)!.syllables;

describe("custom syllables", () => {
  test("the Kodály template reads every figure exactly as built-in Kodály does", () => {
    const mine = customSyllableSystem(template("kodaly"));
    for (const r of selectableRhythms) {
      expect(syllablesForFigure(r, mine)).toEqual(syllablesForFigure(r, kodaly));
    }
  });

  test("a set's words reach the figures", () => {
    const mine = customSyllableSystem(template("kodaly-ta-a"));
    const by = (name: string) => syllablesForFigure(selectableRhythms.find((r) => r.name === name)!, mine);
    expect(by("quarter")).toEqual(["ta"]);
    expect(by("half")).toEqual(["ta-a"]);
    expect(by("dotHalf")).toEqual(["ta-a-a"]);
    expect(by("eighthEighth")).toEqual(["ti", "ti"]);
    expect(by("fourSixteenths")).toEqual(["ti", "ka", "ti", "ka"]);
    expect(by("quarterRest")).toEqual(["rest"]);
    // A rest inside a figure is the rest's word, as the exercise prints it.
    expect(by("eighthRestEighth")).toEqual(["rest", "ti"]);
  });

  test("every template passes its own checks", () => {
    for (const t of syllableTemplates) expect(checkCustomSyllables(t.syllables).ok).toBe(true);
  });

  test("refuses what would break the score", () => {
    const base = template("kodaly");
    const bad = (patch: object) => checkCustomSyllables({ ...base, ...patch }).ok;
    expect(bad({ beat: 'ta"' })).toBe(false); // ends the annotation
    expect(bad({ beat: "ta ta" })).toBe(false); // two words under one note
    expect(bad({ rest: "a_b" })).toBe(false); // the held-beat separator
    expect(bad({ beat: "" })).toBe(false);
    expect(bad({ beat: "x".repeat(13) })).toBe(false);
    expect(bad({ slots: ["ti", "ki", "ti"] })).toBe(false);
    expect(bad({ named: { ...base.named, eighthQuarterEighth: ["syn", "co"] } })).toBe(false);
    // An empty held beat is fine: Takadimi and Gordon do not voice them.
    expect(bad({ holdEach: "" })).toBe(true);
  });
});
