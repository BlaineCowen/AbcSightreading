import { describe, expect, test } from "bun:test";
import {
  checkCustomSyllables,
  customSyllableSystem,
  kodaly,
  syllableTemplates,
} from "../../src/resources/rhythm-syllables";
import { syllablesForFigure } from "../../src/lib/generateUnison";
import { selectableCompoundRhythms, selectableRhythms } from "../../src/lib/selectable-rhythms";

/**
 * A teacher's own syllables are the Kodály shape with their words. The first
 * template must BE the app's Kodály, figure for figure - otherwise "start from
 * what the app writes" starts somewhere else.
 */

const template = (id: string) => syllableTemplates.find((t) => t.id === id)!.syllables;

describe("custom syllables", () => {
  test("the Kodály template reads every figure exactly as built-in Kodály does", () => {
    const mine = customSyllableSystem(template("kodaly"));
    for (const r of [...selectableRhythms, ...selectableCompoundRhythms]) {
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

  test("eighths and the mixed figures can have words of their own (ap-ple, wa-ter-mel-on)", () => {
    const base = template("kodaly-ta-a");
    const fruit = { ...base, slots: ["wa", "ter", "mel", "on"], eighths: ["ap", "ple"] };
    const checked = checkCustomSyllables(fruit);
    expect(checked.ok).toBe(true);
    const mine = customSyllableSystem(checked.ok ? checked.value : base);
    const by = (name: string) => syllablesForFigure(selectableRhythms.find((r) => r.name === name)!, mine);
    expect(by("eighthEighth")).toEqual(["ap", "ple"]);
    expect(by("fourSixteenths")).toEqual(["wa", "ter", "mel", "on"]);
    // Worked out note by note: the eighth off the beat is "ple", on it "ap".
    expect(by("sixteenthSixteenthEighth")).toEqual(["wa", "ter", "ple"]);
    expect(by("eighthSixteenthSixteenth")).toEqual(["ap", "mel", "on"]);
    // Named whole, a figure reads as the teacher wrote it.
    const named = checkCustomSyllables({ ...fruit, named: { ...base.named, sixteenthSixteenthEighth: ["wa", "ter", "ap"] } });
    expect(named.ok).toBe(true);
    const mine2 = customSyllableSystem(named.ok ? named.value : base);
    expect(syllablesForFigure(selectableRhythms.find((r) => r.name === "sixteenthSixteenthEighth")!, mine2)).toEqual(["wa", "ter", "ap"]);
  });

  test("the new rows are optional: empty means worked out, half-filled is refused", () => {
    const base = template("kodaly");
    const empty = checkCustomSyllables({ ...base, eighths: ["", ""], named: { ...base.named, eighthSixteenthSixteenth: ["", "", ""] } });
    expect(empty.ok).toBe(true);
    if (empty.ok) {
      expect(empty.value.eighths).toBeUndefined();
      expect(empty.value.named.eighthSixteenthSixteenth).toBeUndefined();
    }
    expect(checkCustomSyllables({ ...base, eighths: ["ap", ""] }).ok).toBe(false);
    expect(checkCustomSyllables({ ...base, named: { ...base.named, sixteenthEighthSixteenth: ["a", "", "c"] } }).ok).toBe(false);
  });
});
