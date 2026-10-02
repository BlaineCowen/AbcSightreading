import { describe, expect, test } from "bun:test";
import { createNewSr } from "../../src/lib/generateUnison";
import { timeSignatureFor } from "../../src/lib/meter";
import { selectableRhythms } from "../../src/lib/selectable-rhythms";

/**
 * Unison output, fixed seed, Max skip mode - written BEFORE the skip checks
 * moved into src/lib/skip-policy.ts (NYSSMA Voice levels), so the move can be
 * proven to change nothing: every ABC string in the snapshot must stay
 * byte-identical. If a deliberate generator change moves it later, refresh
 * with `bun test tests/unit/unison-skip-regression.test.ts --update-snapshots`
 * and say why in the commit.
 *
 * createNewSr draws only from Math.random, so a seeded Math.random makes it
 * repeatable.
 */

/** A small seeded generator, so a run can be repeated exactly. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Case = {
  label: string;
  key: string;
  meter: "4/4" | "3/4" | "2/4";
  maxSkip: number;
  degrees: number[];
  rhythms: string[];
  measures: number;
  range?: { min: number; max: number };
  clef?: string;
  sharps?: number[];
  flats?: number[];
  moveEighths?: boolean;
  followStep?: boolean;
  ties?: boolean;
  rhythmOnly?: boolean;
};

const ALL = [1, 2, 3, 4, 5, 6, 7];
export const CASES: Case[] = [
  { label: "stepwise do-so", key: "C", meter: "4/4", maxSkip: 1, degrees: [1, 2, 3, 4, 5], rhythms: ["quarter", "half"], measures: 8, range: { min: 14, max: 18 } },
  { label: "triad skips", key: "F", meter: "4/4", maxSkip: 4, degrees: [1, 3, 5], rhythms: ["quarter", "eighthEighth"], measures: 8 },
  { label: "thirds with rests", key: "G", meter: "3/4", maxSkip: 2, degrees: ALL, rhythms: ["quarter", "half", "quarterRest"], measures: 8 },
  { label: "fourths in 2/4, eighths move", key: "D", meter: "2/4", maxSkip: 3, degrees: ALL, rhythms: ["quarter", "eighthEighth"], measures: 8, moveEighths: true },
  { label: "fifths, dotted, Eb", key: "Eb", meter: "4/4", maxSkip: 4, degrees: ALL, rhythms: ["quarter", "half", "dotQuarterEighth"], measures: 8 },
  { label: "octave, 16 bars", key: "Bb", meter: "4/4", maxSkip: 7, degrees: ALL, rhythms: ["quarter", "half", "eighthEighth", "quarterRest"], measures: 16, range: { min: 12, max: 24 } },
  { label: "ninth, bass clef", key: "A", meter: "3/4", maxSkip: 8, degrees: ALL, rhythms: ["quarter", "half", "dotHalf"], measures: 8, clef: "bass", range: { min: 7, max: 14 } },
  { label: "fi in G, step rule on", key: "G", meter: "4/4", maxSkip: 2, degrees: ALL, rhythms: ["quarter", "half"], measures: 8, sharps: [4], followStep: true, range: { min: 14, max: 25 } },
  { label: "te in F, step rule off", key: "F", meter: "4/4", maxSkip: 3, degrees: ALL, rhythms: ["quarter", "eighthEighth"], measures: 8, flats: [7], followStep: false, range: { min: 14, max: 25 } },
  { label: "ties across barline", key: "C", meter: "3/4", maxSkip: 2, degrees: [1, 2, 3, 4, 5], rhythms: ["quarter", "half", "dotHalf"], measures: 8, ties: true },
  { label: "one bar", key: "E", meter: "4/4", maxSkip: 2, degrees: [1, 2, 3, 4, 5], rhythms: ["quarter"], measures: 1 },
  { label: "sixths, wide range", key: "D", meter: "4/4", maxSkip: 5, degrees: ALL, rhythms: ["quarter", "half", "eighthEighth"], measures: 8, range: { min: 12, max: 24 } },
  { label: "sevenths, wide range", key: "Ab", meter: "3/4", maxSkip: 6, degrees: ALL, rhythms: ["quarter", "half", "dotHalf"], measures: 8, range: { min: 12, max: 24 } },
  { label: "rhythm only", key: "C", meter: "4/4", maxSkip: 4, degrees: [1, 3, 5], rhythms: ["quarter", "eighthEighth", "quarterRest"], measures: 4, rhythmOnly: true },
];

const SEEDS = [1, 2, 3];

const quiet = () => {};

/** One exercise's ABC, or "ERROR: <message>" - a failure must stay the same failure. */
export function generate(c: Case, seed: number, maxSkip: unknown = c.maxSkip): string {
  const rhythms = selectableRhythms.filter((r) => c.rhythms.includes(r.name));
  if (rhythms.length !== c.rhythms.length) {
    // A renamed rhythm would quietly shrink the case and pin the wrong thing.
    throw new Error(`unison-skip-regression: case "${c.label}" names a rhythm selectableRhythms does not have`);
  }
  const realRandom = Math.random;
  const saved = { log: console.log, warn: console.warn, error: console.error };
  Math.random = mulberry32(seed);
  Object.assign(console, { log: quiet, warn: quiet, error: quiet });
  try {
    const clef = c.clef ?? "treble";
    const result: any = createNewSr({
      bpm: 60, tempo: 60, clef, selectedClef: clef,
      timeSig: timeSignatureFor(c.meter), selectedTimeSignature: c.meter,
      measures: c.measures, maxSkip, range: c.range ?? { min: 14, max: 21 },
      rhythms,
      selectedRhythms: c.rhythms, scaleDegrees: c.degrees,
      selectedSharpDegrees: c.sharps ?? [], selectedFlatDegrees: c.flats ?? [],
      key: c.key, showSolfege: !c.rhythmOnly, lyricSystem: "movable",
      rhythmOnly: c.rhythmOnly === true, showRhythmSyllables: true, syllableSystemId: "kodaly",
      allowTiesAcrossBarline: c.ties === true, moveOnEighthNotes: c.moveEighths === true,
      accidentalsFollowStep: c.followStep === true,
      partsObject: { numofParts: 1, parts: { Unison: { order: 0, smallName: "U" } } },
    } as any);
    return result[0] as string;
  } catch (e) {
    return `ERROR: ${e instanceof Error ? e.message : String(e)}`;
  } finally {
    Math.random = realRandom;
    Object.assign(console, saved);
  }
}

describe("unison output in Max skip mode, fixed seed", () => {
  test("is unchanged", () => {
    const out: Record<string, string> = {};
    for (const c of CASES) for (const seed of SEEDS) out[`${c.label} #${seed}`] = generate(c, seed);
    // Every case must have produced an entry: none skipped, none overwritten.
    expect(Object.keys(out).length).toBe(CASES.length * SEEDS.length);
    expect(Object.keys(out).length).toBe(42);
    // Music only: a snapshot of failures would guard nothing, and a refreshed
    // snapshot must not be able to absorb a case that has started to throw.
    expect(Object.values(out).filter((s) => s.startsWith("ERROR")).length).toBe(0);
    expect(out).toMatchSnapshot();
  });
});

describe("a Max skip policy object", () => {
  test("writes exactly what its number does", () => {
    for (const c of CASES.filter((c) => !c.rhythmOnly)) {
      for (const seed of [1, 2]) {
        expect(generate(c, seed, { kind: "max", maxSkip: c.maxSkip })).toBe(generate(c, seed));
      }
    }
  });
});

/** The sung pitches of a unison line, as diatonic steps (C = 0) and letters. */
function sungPitches(abc: string): { step: number; letter: number }[] {
  const body = abc.split("End of header, start of tune body:")[1] ?? "";
  const music = body.split("\n").filter((l) => !l.startsWith("w:")).join(" ").replace(/"[^"]*"/g, "");
  const letters = "CDEFGAB";
  const out: { step: number; letter: number }[] = [];
  for (const m of music.matchAll(/[_^=]*([A-Ga-g])([,']*)\d/g)) {
    const letter = letters.indexOf(m[1].toUpperCase());
    let octave = m[1] === m[1].toLowerCase() ? 1 : 0;
    for (const ch of m[2]) octave += ch === "'" ? 1 : -1;
    out.push({ step: octave * 7 + letter, letter });
  }
  return out;
}

describe("a custom skip policy names degrees from the key's tonic", () => {
  test("do-mi up in G skips G to B and never A to C or C to E", () => {
    const c: Case = {
      label: "do-mi in G", key: "G", meter: "4/4", maxSkip: 0, degrees: ALL,
      rhythms: ["quarter", "half"], measures: 8, range: { min: 14, max: 25 },
    };
    const policy = { kind: "custom", moves: [{ from: 1, to: 3, dir: "up" }] };
    const G = 4; // the tonic's letter index in CDEFGAB
    let skips = 0;
    let lines = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const abc = generate(c, seed, policy);
      if (abc.startsWith("ERROR")) continue;
      lines++;
      const notes = sungPitches(abc);
      for (let k = 1; k < notes.length; k++) {
        const rise = notes[k].step - notes[k - 1].step;
        if (Math.abs(rise) <= 1) continue;
        skips++;
        // Every skip is do up to mi: G up a third to B.
        expect({ from: notes[k - 1].letter, rise }).toEqual({ from: G, rise: 2 });
      }
    }
    expect(lines).toBeGreaterThan(0);
    expect(skips).toBeGreaterThan(0);
  });
});
