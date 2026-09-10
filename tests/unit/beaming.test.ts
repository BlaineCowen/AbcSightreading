import { describe, expect, test } from "bun:test";
import { generateChoralExercise } from "../../src/lib/generateChoral";
import { chords as fullChordSet } from "../../src/resources/chords";
import { rhythms as allRhythms } from "../../src/resources/rhythms";

/**
 * A beam shows the beat.
 *
 * ABC beams whatever is written without a space between it, so beaming here is
 * entirely a question of where the spaces go - and choral put one after every
 * note, which meant nothing was ever beamed. Two eighths on a beat came out as
 * two separately flagged notes.
 *
 * These read the emitted ABC rather than the renderer: a space-free run of note
 * tokens IS a beam group, and that is the thing to assert.
 */

const PARTS = {
  numofParts: 4,
  parts: {
    Soprano: { order: 3, smallName: "S", clef: "treble octave=-1", range: [25, 32], currentRange: [25, 32] },
    Alto: { order: 2, smallName: "A", clef: "treble octave=-1", range: [21, 28], currentRange: [21, 28] },
    Tenor: { order: 1, smallName: "T", clef: "treble transpose=-12", range: [14, 23], currentRange: [14, 23] },
    Bass: { order: 0, smallName: "B", clef: "bass octave=-1", range: [9, 18], currentRange: [9, 18] },
  },
} as any;

const BEAT = 8; // one quarter, in 32nd-note units

function generate(rhythmNames: string[], timeSig = { name: "4/4", tsPerMeasure: 32, beamGroupSize: 8 }) {
  const selectedRhythms = allRhythms.filter((r) => rhythmNames.includes(r.name));
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const out = generateChoralExercise({
        key: "C",
        timeSig,
        partsObject: PARTS,
        measures: 8,
        maxSkip: 4,
        bpm: 72,
        selectedRhythms,
        chords: fullChordSet,
        accidentalsByStep: true,
        nctProbability: 0.4,
        chromaticFrequency: 0,
      } as any);
      if (out?.abcString) return out.abcString;
    } catch {
      /* randomised - try again */
    }
  }
  throw new Error("could not generate in 40 attempts");
}

/**
 * Every beam group in the score, as { durations, startsAt } where startsAt is
 * the group's offset within its measure.
 *
 * A "group" is a run of note tokens written with no space between them. Single
 * notes are groups of one and are not beams; they are returned anyway so the
 * rules can be checked against them.
 */
function beamGroups(abc: string, tsPerMeasure: number) {
  const groups: { durations: number[]; startsAt: number; text: string }[] = [];
  for (const line of abc.split("\n")) {
    if (!line.startsWith("[V:")) continue;
    const body = line.replace(/^\[V:[^\]]*\]\s*/, "").replace(/"[^"]*"/g, "");
    for (const measure of body.split("|")) {
      let at = 0;
      for (const token of measure.trim().split(/\s+/).filter(Boolean)) {
        if (token === "]" || token === "") continue;
        // One token may hold several notes written together - that is the beam.
        const durations = [...token.matchAll(/(?:[\^_=]*[A-Ga-g][,']*|z)(\d+)/g)].map(
          (m) => Number(m[1])
        );
        if (durations.length === 0) continue;
        groups.push({ durations, startsAt: at, text: token });
        at += durations.reduce((a, b) => a + b, 0);
      }
    }
  }
  return groups;
}

const beamed = (g: { durations: number[] }) => g.durations.length > 1;

describe("choral beaming", () => {
  test("something is beamed at all", () => {
    // The original bug: a space after every note, so no beam ever formed.
    const groups = beamGroups(generate(["quarter", "half", "eighthEighth"]), 32);
    expect(groups.some(beamed)).toBe(true);
  });

  test("a beam never crosses a beat", () => {
    const abc = generate(["quarter", "half", "eighthEighth", "fourSixteenths", "dotEighthSixteenth"]);
    for (const g of beamGroups(abc, 32).filter(beamed)) {
      const total = g.durations.reduce((a, b) => a + b, 0);
      expect(Math.floor(g.startsAt / BEAT)).toBe(
        Math.floor((g.startsAt + total - 1) / BEAT)
      );
    }
  });

  test("nothing a quarter or longer is inside a beam", () => {
    // Quarters and above carry no flag, so there is nothing to beam.
    const abc = generate(["quarter", "half", "whole", "eighthEighth", "dotQuarterEighth"]);
    for (const g of beamGroups(abc, 32).filter(beamed)) {
      for (const d of g.durations) expect(d).toBeLessThan(BEAT);
    }
  });

  test("a rest is never inside a beam", () => {
    const abc = generate(["quarter", "half", "eighthEighth", "quarterRest", "halfRest"]);
    for (const g of beamGroups(abc, 32).filter(beamed)) {
      expect(g.text).not.toContain("z");
    }
  });

  test("consecutive short notes on one beat are joined, not left flagged", () => {
    // The positive case. eighthEighth fills exactly one beat, so every one of
    // them must come out as a single two-note group.
    const abc = generate(["quarter", "eighthEighth"]);
    const groups = beamGroups(abc, 32);
    const eighthRuns = groups.filter((g) => g.durations.every((d) => d === 4));
    expect(eighthRuns.length).toBeGreaterThan(0);
    for (const g of eighthRuns) expect(g.durations.length).toBe(2);
  });

  test("holds in 3/4 as well", () => {
    const abc = generate(
      ["quarter", "half", "eighthEighth", "fourSixteenths"],
      { name: "3/4", tsPerMeasure: 24, beamGroupSize: 8 } as any
    );
    for (const g of beamGroups(abc, 24).filter(beamed)) {
      const total = g.durations.reduce((a, b) => a + b, 0);
      expect(Math.floor(g.startsAt / BEAT)).toBe(
        Math.floor((g.startsAt + total - 1) / BEAT)
      );
      for (const d of g.durations) expect(d).toBeLessThan(BEAT);
    }
  });
});
