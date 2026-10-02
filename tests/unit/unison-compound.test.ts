import { describe, expect, test } from "bun:test";
import { createNewSr } from "../../src/lib/generateUnison";
import { timeSignatureFor } from "../../src/lib/meter";
import { rhythms } from "../../src/resources/rhythms";

const CORE = ["dotQuarter", "threeEighths", "quarterEighth", "eighthQuarter", "dotHalfCompound"];

function unison(meter: string, names: string[], over: Record<string, unknown> = {}) {
  const { log, warn, error } = console;
  Object.assign(console, { log() {}, warn() {}, error() {} });
  try {
    return createNewSr({
      bpm: 60, tempo: 60, clef: "treble", selectedClef: "treble", key: "F",
      timeSig: timeSignatureFor(meter), selectedTimeSignature: meter, measures: 8, maxSkip: 4,
      range: { min: 14, max: 21 }, scaleDegrees: [1, 2, 3, 4, 5, 6, 7],
      selectedSharpDegrees: [], selectedFlatDegrees: [],
      rhythms: rhythms.filter((r) => names.includes(r.name)), selectedRhythms: names,
      showSolfege: true, lyricSystem: "movable", showRhythmSyllables: false,
      moveOnEighthNotes: false, accidentalsFollowStep: false, allowTiesAcrossBarline: false,
      partsObject: { numofParts: 1, parts: { Unison: { order: 0, smallName: "U" } } },
      ...over,
    } as any) as [string, unknown, any];
  } finally {
    Object.assign(console, { log, warn, error });
  }
}

const music = (abc: string) =>
  abc.split("start of tune body: \n")[1].split("\n").filter((l) => !l.startsWith("w:")).join(" ");
const measuresOf = (body: string) => body.split("|").map((m) => m.trim()).filter(Boolean);
/** Space-free runs of notes and rests: what abcjs beams together. */
const groupsOf = (measure: string) =>
  measure
    .replace(/"[^"]*"/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .map((g) => [...g.matchAll(/[_^=]*([A-Ga-gz])[,']*(\d+)/g)].map((m) => ({ rest: m[1] === "z", len: Number(m[2]) })));
const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0);
/** A held note written as a dotted half tied to a dotted quarter. */
const DOTTED_HALF_TIED_TO_DOTTED_QUARTER = /[A-Ga-g][,']*24-\s*[A-Ga-g][,']*12/;

describe("Unison in compound meter", () => {
  test("6/8: eighths beam in threes, one group to a beat", () => {
    const [abc] = unison("6/8", ["threeEighths"], { rhythmOnly: true });
    for (const m of measuresOf(music(abc))) {
      expect(groupsOf(m).map((g) => g.map((n) => n.len))).toEqual([[4, 4, 4], [4, 4, 4]]);
    }
  });

  test("a quarter never beams", () => {
    const [abc] = unison("6/8", ["quarterEighth", "eighthQuarter", "quarterTwoSixteenths"], { rhythmOnly: true });
    for (const m of measuresOf(music(abc))) {
      for (const g of groupsOf(m)) if (g.some((n) => n.len >= 8)) expect(g.length).toBe(1);
    }
  });

  test("a rest ends the beam", () => {
    const [abc] = unison("6/8", ["twoEighthsEighthRest", "eighthRestTwoEighths"], { rhythmOnly: true });
    for (const m of measuresOf(music(abc))) {
      for (const g of groupsOf(m)) if (g.some((n) => n.rest)) expect(g.length).toBe(1);
    }
  });

  test("every bar adds up in every meter, pitched, ties on, and no note is written 36 long", () => {
    for (const meter of ["6/8", "9/8", "12/8"]) {
      const bar = timeSignatureFor(meter).tsPerMeasure;
      for (let run = 0; run < 10; run++) {
        const [abc] = unison(meter, [...CORE, "sixSixteenths", "dotQuarterRest"], { allowTiesAcrossBarline: true });
        for (const m of measuresOf(music(abc))) {
          expect([meter, sum(groupsOf(m).flat().map((n) => n.len))]).toEqual([meter, bar]);
          expect(groupsOf(m).flat().map((n) => n.len)).not.toContain(36);
        }
      }
    }
  });

  test("9/8's last bar: a dotted half tied to a dotted quarter, one syllable sung through", () => {
    const [abc] = unison("9/8", CORE, { measures: 4 });
    const body = abc.split("start of tune body: \n")[1];
    const last = measuresOf(music(abc)).pop()!;
    expect(last).toMatch(DOTTED_HALF_TIED_TO_DOTTED_QUARTER);
    expect(groupsOf(last).map((g) => g.map((n) => n.len))).toEqual([[24], [12]]);
    const notes = (music(abc).match(/[A-Ga-g][,']*\d+/g) ?? []).length;
    const lyric = body.split("\n").find((l) => l.startsWith("w:"))!;
    expect(lyric.replace(/^w:\s*/, "").trim().split(/\s+/).length).toBe(notes);
  });

  test("12/8's held cadence mid-piece: a dotted half tied to a dotted quarter, then the breath", () => {
    // Bar 4 closes the first phrase: a 36-unit held note and a dotted-quarter breath.
    const [abc] = unison("12/8", CORE, { measures: 8, rhythmOnly: true });
    const cadenceBar = measuresOf(music(abc))[3];
    expect(cadenceBar).toMatch(DOTTED_HALF_TIED_TO_DOTTED_QUARTER);
    expect(groupsOf(cadenceBar).map((g) => g.map((n) => n.len))).toEqual([[24], [12], [12]]);
  });

  test("12/8's last bar is one dotted whole", () => {
    const [abc] = unison("12/8", CORE, { measures: 4, rhythmOnly: true });
    expect(groupsOf(measuresOf(music(abc)).pop()!).map((g) => g.map((n) => n.len))).toEqual([[48]]);
  });

  test("a note tied over the barline splits at the beat into dotted values", () => {
    let ties = 0;
    for (let run = 0; run < 10; run++) {
      const [abc] = unison("9/8", ["dotHalfCompound", "dotQuarter"], { allowTiesAcrossBarline: true, rhythmOnly: true });
      for (const t of music(abc).matchAll(/(\d+)-\s*\|?\s*[A-Ga-g][,']*(\d+)/g)) {
        ties++;
        expect([12, 24]).toContain(Number(t[1]));
        expect([12, 24]).toContain(Number(t[2]));
      }
    }
    expect(ties).toBeGreaterThan(0);
  });

  test("Move eighths off: three eighths sung on one pitch, and only inside the figure", () => {
    let moved = 0;
    for (let run = 0; run < 10; run++) {
      const [, , held] = unison("6/8", ["threeEighths"], { moveOnEighthNotes: false });
      const notes = held.partsObject.parts.Unison.chordNoteObject;
      for (let i = 0; i < notes.length; i += 3) {
        expect(notes[i + 1].pitchValue).toBe(notes[i].pitchValue);
        expect(notes[i + 2].pitchValue).toBe(notes[i].pitchValue);
      }
      const [, , free] = unison("6/8", ["threeEighths"], { moveOnEighthNotes: true });
      const fn = free.partsObject.parts.Unison.chordNoteObject;
      for (let i = 0; i < fn.length; i += 3) if (fn[i + 1].pitchValue !== fn[i].pitchValue) moved++;
    }
    expect(moved).toBeGreaterThan(0);
  });

  test("a bar of 9/8 cannot be filled by two-beat notes, and says so", () => {
    expect(() => unison("9/8", ["dotHalfCompound"], { measures: 1, rhythmOnly: true })).toThrow(/can't fill 1 measure/);
  });
});
