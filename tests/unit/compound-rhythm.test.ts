import { describe, expect, test } from "bun:test";
import { generateCompoundRhythm } from "../../src/lib/compound-rhythm";
import { meterByName, timeSignatureFor } from "../../src/lib/meter";
import { generateRandomRhythm } from "../../src/lib/rhythm-generation";
import type { RhythmWithPattern } from "../../src/lib/types";
import { rhythms } from "../../src/resources/rhythms";

const by = (...names: string[]) =>
  names.map((n) => {
    const r = rhythms.find((x) => x.name === n);
    if (!r) throw new Error(`no rhythm named ${n}`);
    return r;
  });
const CORE = ["dotQuarter", "threeEighths", "quarterEighth", "eighthQuarter", "dotHalfCompound"];
const ALL = [
  ...CORE, "dotQuarterRest", "quarterEighthRest", "eighthRestTwoEighths", "twoEighthsEighthRest", "dotHalfRest",
  "sixSixteenths", "twoSixteenthsTwoEighths", "eighthTwoSixteenthsEighth", "twoEighthsTwoSixteenths", "quarterTwoSixteenths",
];
const cadences = (measures: number) => Array(Math.ceil(measures / 4)).fill({ type: "V-I" });
const meter = (name: string) => meterByName(name)!;

/** Each note with where it starts in its bar, bar by bar. */
function layout(notes: RhythmWithPattern[], tsPerMeasure: number) {
  const bars: { at: number; len: number; note: RhythmWithPattern }[][] = [];
  let pos = 0;
  for (const note of notes) {
    (bars[Math.floor(pos / tsPerMeasure)] ??= []).push({ at: pos % tsPerMeasure, len: note.totalValue, note });
    pos += note.totalValue;
  }
  return { bars, total: pos };
}

describe("compound rhythm fill", () => {
  for (const name of ["6/8", "9/8", "12/8"]) {
    for (const ties of [false, true]) {
      test(`${name}, ties ${ties}: whole bars, and every figure keeps to its beat`, () => {
        const m = meter(name);
        for (let run = 0; run < 20; run++) {
          const notes = generateCompoundRhythm(m, 8, by(...ALL), cadences(8), ties);
          const { bars, total } = layout(notes, m.tsPerMeasure);
          expect(total).toBe(8 * m.tsPerMeasure);
          for (const bar of bars) {
            for (const { at, len, note } of bar) {
              const into = at % m.beatUnits;
              const startsFigure = !note.isPatternNote || note.patternIndex === 0;
              if (startsFigure) expect(into).toBe(0);
              if (into !== 0) expect(into + len).toBeLessThanOrEqual(m.beatUnits);
            }
          }
        }
      });
    }
  }

  test("the last bar is one note, held for the whole bar", () => {
    for (const name of ["6/8", "9/8", "12/8"]) {
      const m = meter(name);
      const notes = generateCompoundRhythm(m, 8, by(...CORE), cadences(8), false);
      const last = notes[notes.length - 1];
      expect([name, last.totalValue, last.isCadenceEnd, last.rest]).toEqual([name, m.tsPerMeasure, true, false]);
    }
  });

  test("an interior cadence: a held note and a one-beat breath (6/8: a dotted half alone)", () => {
    const expected: Record<string, number[]> = { "6/8": [24], "9/8": [24, 12], "12/8": [36, 12] };
    for (const name of ["6/8", "9/8", "12/8"]) {
      const m = meter(name);
      for (let run = 0; run < 10; run++) {
        const notes = generateCompoundRhythm(m, 8, by(...CORE), cadences(8), false);
        const bar4 = layout(notes, m.tsPerMeasure).bars[3].map((n) => n.note);
        expect([name, bar4.map((n) => n.totalValue)]).toEqual([name, expected[name]]);
        expect(bar4[0].isCadenceEnd).toBe(true);
        if (bar4[1]) {
          expect(bar4[1].isPhraseBreath).toBe(true);
          expect(bar4[1].isCadenceEnd).toBe(false);
          expect(bar4[1].name === "dotQuarterRest" || bar4[1].name === "dotQuarter").toBe(true);
        }
      }
    }
  });

  test("no plain note selected, no cadence: eighths all the way", () => {
    const notes = generateCompoundRhythm(meter("6/8"), 4, by("threeEighths"), cadences(4), false);
    expect(notes.every((n) => n.name === "threeEighths")).toBe(true);
    expect(notes.filter((n) => n.isPatternStart).length).toBe(8);
  });

  test("a cadence that would leave the block unfillable is dropped, as in simple meter", () => {
    // 9/8, dotted halves only, ties on: the last bar's 36 leaves nine beats of
    // two-beat notes. Without the cadence the twelve beats tie through.
    const m = meter("9/8");
    for (let run = 0; run < 10; run++) {
      const notes = generateCompoundRhythm(m, 4, by("dotHalfCompound"), cadences(4), true);
      expect(layout(notes, m.tsPerMeasure).total).toBe(4 * 36);
    }
  });

  test("refuses what cannot be filled", () => {
    expect(() => generateCompoundRhythm(meter("9/8"), 4, by("dotHalfCompound"), cadences(4), false)).toThrow(/can't fill/);
    expect(() => generateCompoundRhythm(meter("9/8"), 1, by("dotHalfCompound"), cadences(1), true)).toThrow(/can't fill/);
    expect(() => generateCompoundRhythm(meter("6/8"), 4, by("quarter", "half"), cadences(4), false)).toThrow(/No 6\/8 rhythms/);
  });

  test("generateRandomRhythm sends compound meters here", () => {
    const notes = generateRandomRhythm(timeSignatureFor("6/8"), 4, by(...CORE), cadences(4), true, false);
    expect(notes.reduce((s, n) => s + n.totalValue, 0)).toBe(96);
    expect(notes.every((n) => n.meterKind === "compound")).toBe(true);
  });

  test("simple meter never writes a compound figure", () => {
    for (let run = 0; run < 10; run++) {
      const notes = generateRandomRhythm(timeSignatureFor("4/4"), 4, by("quarter", "threeEighths"), cadences(4), true, false);
      expect(notes.some((n) => n.name === "threeEighths")).toBe(false);
    }
  });
});
