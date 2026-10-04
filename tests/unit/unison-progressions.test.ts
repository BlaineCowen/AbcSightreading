import { describe, expect, test } from "bun:test";
import { barsFor, chordAt, PROGRESSIONS, splitAt } from "../../src/lib/unison-progressions";
import { createNewSr } from "../../src/lib/generateUnison";
import { rhythms as allRhythms } from "../../src/resources/rhythms";
import { beatUnitOf, timeSignatureFor } from "../../src/lib/meter";
import { DEFAULT_RHYTHM_NAMES } from "../../src/lib/selectable-rhythms";
import { isAllowedMove, toSkipPolicy } from "../../src/lib/skip-policy";

/**
 * Harmony first: a progression repeated through the exercise, the line written
 * against it - chord notes on the strong beats and long notes, passing and
 * neighbour notes by step between.
 */

const byId = (id: string) => PROGRESSIONS.find((p) => p.id === id)!;

describe("laying a progression over the bars", () => {
  test("it repeats every four bars", () => {
    expect(barsFor(byId("I-IV-V-I"), 8).map((b) => b.join(" "))).toEqual(["1", "4", "5", "1", "1", "4", "5", "1"]);
  });

  test("a length that is not whole phrases finishes on the progression's last bars", () => {
    expect(barsFor(byId("I-IV-V-I"), 6).map((b) => b.join(" "))).toEqual(["1", "4", "5", "1", "5", "1"]);
    expect(barsFor(byId("I-vi-IV-V-I"), 2).map((b) => b.join(" "))).toEqual(["4 5", "1"]);
  });

  test("every progression ends at home", () => {
    for (const p of PROGRESSIONS) expect(p.bars.at(-1)).toEqual(["1"]);
  });

  test("a split bar changes chord half way, or after two beats of three", () => {
    expect(splitAt(32, 8)).toBe(16);
    expect(splitAt(24, 8)).toBe(16);
    expect(splitAt(16, 8)).toBe(8);
    expect(splitAt(24, 12)).toBe(12);
    const bars = [["1"], ["4", "5"]];
    expect(chordAt(bars, 32, 32, 8)).toBe("4");
    expect(chordAt(bars, 48, 32, 8)).toBe("5");
  });
});

// ------------------------------------------------------------- on exercises

const SIMPLE = ["quarter", "half", "eighthEighth", "dotHalf", "dotQuarterEighth"];
type N = {
  name: string; noteLength: number; pitchValue: number; degree: number; rhythm?: { rest?: boolean };
  chord: { name: string; triadNotes: number[]; sharpScaleDegree?: number; flatScaleDegree?: number };
};

function generate(o: { key: string; meter: string; measures: number; degrees: number[]; maxSkip: number; eighth?: number; progressions?: boolean; sharps?: number[]; flats?: number[] }) {
  const names = o.meter.endsWith("/8") ? [...DEFAULT_RHYTHM_NAMES.compound] : SIMPLE;
  return createNewSr({
    bpm: 80, tempo: 80, clef: "treble", selectedClef: "treble", timeSig: timeSignatureFor(o.meter), selectedTimeSignature: o.meter,
    measures: o.measures, maxSkip: o.maxSkip, maxEighthSkip: o.eighth ?? 1, maxSixteenthSkip: o.eighth ?? 1,
    range: { min: 14, max: 21 }, selectedRhythms: names, rhythms: allRhythms.filter((r) => names.includes(r.name)),
    scaleDegrees: new Set(o.degrees), selectedSharpDegrees: o.sharps ?? [], selectedFlatDegrees: o.flats ?? [], key: o.key, chords: ["1", "2", "3", "4", "5", "6", "7"],
    showSolfege: true, rhythmOnly: false, progressions: o.progressions ?? true,
    partsObject: { numofParts: 1, parts: { Unison: { chordNoteObject: [], order: 0, smallName: "U", selectedRange: [14, 21] } } },
  } as any) as any;
}

const CASES = [
  { key: "C", meter: "4/4", degrees: [1, 2, 3, 4, 5, 6, 7], maxSkip: 4 },
  { key: "G", meter: "3/4", degrees: [1, 2, 3, 4, 5, 6, 7], maxSkip: 3 },
  { key: "F", meter: "2/4", degrees: [1, 2, 3], maxSkip: 1 },
  { key: "D", meter: "6/8", degrees: [1, 2, 3, 4, 5], maxSkip: 2 },
  { key: "Am", meter: "4/4", degrees: [1, 2, 3, 4, 5, 6, 7], maxSkip: 4 },
  { key: "Bb", meter: "4/4", degrees: [1, 3, 5], maxSkip: 4 },
];

describe("the line against the progression", () => {
  for (const c of CASES) {
    test(`${c.key} ${c.meter}, degrees ${c.degrees.join("")}, skip ${c.maxSkip}`, () => {
      const policy = toSkipPolicy(c.maxSkip);
      for (let run = 0; run < 12; run++) {
        const measures = [4, 8, 16][run % 3];
        const score = generate({ ...c, measures })[2];
        const barUnits = score.timeSig.tsPerMeasure;
        const beat = beatUnitOf(c.meter);
        const split = splitAt(barUnits, beat);
        const harmony: string[][] = score.harmony;
        expect(harmony).toBeDefined();
        expect(harmony.length).toBe(measures);
        expect(harmony.at(-1)).toEqual(["1"]);

        const notes: N[] = score.partsObject.parts.Unison.chordNoteObject;
        const tone = (n: N) => n.chord.triadNotes.includes(n.degree);
        let pos = 0;
        const placed = notes.map((n) => {
          const p = { n, pos, at: pos % barUnits };
          pos += n.noteLength;
          return p;
        });
        expect(pos).toBe(measures * barUnits);
        const sung = placed.filter((p) => !p.n.rhythm?.rest);
        for (let k = 0; k < placed.length; k++) {
          const { n, pos: at0, at } = placed[k];
          // Each note carries the chord sounding where it starts.
          expect(n.chord.name).toBe(chordAt(harmony, at0, barUnits, beat));
          if (n.rhythm?.rest) continue;
          const bar = harmony[Math.floor(at0 / barUnits)];
          const strong = at === 0 || (at === split && (bar.length > 1 || barUnits / beat >= 4));
          if (strong || n.noteLength > beat) expect(tone(n)).toBe(true);
        }
        for (let j = 0; j < sung.length; j++) {
          const { n } = sung[j];
          if (j > 0) expect(isAllowedMove(sung[j - 1].n, n, n.noteLength, policy)).toBe(true);
          if (tone(n)) continue;
          // A passing or neighbour note: by step in, by step (or held, then step) out, never at an edge.
          expect(j).toBeGreaterThan(0);
          expect(j).toBeLessThan(sung.length - 1);
          expect(Math.abs(n.pitchValue - sung[j - 1].n.pitchValue)).toBeLessThanOrEqual(1);
          let after = j + 1;
          while (after < sung.length - 1 && sung[after].n.pitchValue === n.pitchValue) after++;
          expect(Math.abs(sung[after].n.pitchValue - n.pitchValue)).toBe(1);
        }
        // Starts on do, mi or so; ends on do over I.
        expect([0, 2, 4]).toContain(sung[0].n.degree);
        expect(sung.at(-1)!.n.degree).toBe(0);
        expect(sung.at(-1)!.n.chord.name).toBe("1");
      }
    });
  }

  test("minor uses minor's progressions", () => {
    for (let run = 0; run < 6; run++) {
      const score = generate({ key: "Dm", meter: "4/4", measures: 8, degrees: [1, 2, 3, 4, 5, 6, 7], maxSkip: 4 })[2];
      const ids = PROGRESSIONS.filter((p) => p.mode === "minor").map((p) => JSON.stringify(barsFor(p, 8)));
      expect(ids).toContain(JSON.stringify(score.harmony));
    }
  });

  test("the line moves: mostly steps and skips, not one pitch", () => {
    let moves = 0, repeats = 0;
    for (let run = 0; run < 10; run++) {
      const notes: N[] = generate({ key: "C", meter: "4/4", measures: 8, degrees: [1, 2, 3, 4, 5, 6, 7], maxSkip: 4 })[2]
        .partsObject.parts.Unison.chordNoteObject.filter((n: N) => !n.rhythm?.rest);
      for (let k = 1; k < notes.length; k++) {
        moves++;
        if (notes[k].pitchValue === notes[k - 1].pitchValue) repeats++;
      }
    }
    expect(repeats / moves).toBeLessThan(0.35);
  });

  test("off, the older walk writes it", () => {
    expect(generate({ ...CASES[0], measures: 8, progressions: false })[2].harmony).toBeUndefined();
  });
});

describe("chromatic notes: a diatonic phrase, then a chromatic one", () => {
  // 1-based, as the page sends them; with the chord each is written over, or none for a passing note.
  const NOTES = [
    { label: "fi", sharps: [4], chord: "5/5" },
    { label: "si", sharps: [5], chord: "5/6" },
    { label: "di", sharps: [1], chord: "5/2" },
    { label: "te", flats: [7], chord: ["1-7", "u_b7"] },
    { label: "le", flats: [6], chord: "m4" },
    { label: "me", flats: [3], chord: "u_borrowed_i" },
    { label: "ri (passing)", sharps: [2] },
    { label: "li (passing)", sharps: [6] },
    { label: "se (passing)", flats: [5] },
    { label: "ra (passing, in major)", flats: [2] },
  ];
  const altered = (n: N, sharps: Set<number>, flats: Set<number>) =>
    (n.chord.sharpScaleDegree === n.degree && sharps.has(n.degree)) || (n.chord.flatScaleDegree === n.degree && flats.has(n.degree));

  for (const c of NOTES) {
    test(c.label, () => {
      const sharps = new Set((c.sharps ?? []).map((d) => d - 1));
      const flats = new Set((c.flats ?? []).map((d) => d - 1));
      for (let run = 0; run < 10; run++) {
        const [key, meter] = [["C", "4/4"], ["F", "3/4"], ["G", "2/4"], ["Bb", "4/4"], ["D", "6/8"]][run % 5];
        const score = generate({ key, meter, measures: 8, degrees: [1, 2, 3, 4, 5, 6, 7], maxSkip: 4, sharps: c.sharps, flats: c.flats })[2];
        const harmony: string[][] = score.harmony;
        expect(harmony).toBeDefined();
        // The first phrase is diatonic; the second carries the note's chord, when it has one.
        expect(harmony.slice(0, 4).flat().every((name) => /^[1-7]$/.test(name))).toBe(true);
        if (c.chord) {
          const want = [c.chord].flat();
          expect(harmony.slice(4).flat().some((name) => want.includes(name))).toBe(true);
        }
        const barUnits = score.timeSig.tsPerMeasure;
        let pos = 0;
        const placed = (score.partsObject.parts.Unison.chordNoteObject as N[]).map((n) => {
          const p = { n, bar: Math.floor(pos / barUnits) };
          pos += n.noteLength;
          return p;
        });
        const sung = placed.filter((p) => !p.n.rhythm?.rest);
        let count = 0;
        sung.forEach(({ n, bar }, j) => {
          if (!altered(n, sharps, flats)) return;
          count++;
          expect(bar).toBeGreaterThanOrEqual(4);
          // Stepped into, and resolved by step the way it leans (after any held repeat).
          expect(j).toBeGreaterThan(0);
          expect(Math.abs(n.pitchValue - sung[j - 1].n.pitchValue)).toBeLessThanOrEqual(1);
          let after = j + 1;
          while (after < sung.length && sung[after].n.pitchValue === n.pitchValue && altered(sung[after].n, sharps, flats)) after++;
          const lean = n.chord.sharpScaleDegree === n.degree ? 1 : -1;
          expect(sung[after].n.pitchValue - n.pitchValue).toBe(lean);
        });
        expect(count).toBeGreaterThan(0);
        expect(sung.at(-1)!.n.degree).toBe(0);
      }
    });
  }

  test("two chromatic notes take turns, phrase by phrase", () => {
    const score = generate({ key: "C", meter: "4/4", measures: 16, degrees: [1, 2, 3, 4, 5, 6, 7], maxSkip: 4, sharps: [4], flats: [7] })[2];
    const names = score.harmony.flat();
    expect(names.includes("5/5")).toBe(true);
    expect(names.some((n: string) => n === "1-7" || n === "u_b7")).toBe(true);
    // Phrases 1 and 3 are the diatonic progression.
    expect(score.harmony.slice(8, 12)).toEqual(score.harmony.slice(0, 4));
  });
});
