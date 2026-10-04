import { describe, expect, test } from "bun:test";
import { endingOf, periodPlan, planBars, planFromForm, RHYME_BARS } from "../../src/lib/unison-form";
import { createNewSr } from "../../src/lib/generateUnison";
import { rhythms as allRhythms } from "../../src/resources/rhythms";
import { timeSignatureFor } from "../../src/lib/meter";
import { isAllowedMove, toSkipPolicy } from "../../src/lib/skip-policy";
import { DEFAULT_RHYTHM_NAMES } from "../../src/lib/selectable-rhythms";

/**
 * Phrases and periods in Unison: a question ending on V, an answer that sings
 * its first two bars again and ends on do, contrast, and the opening back.
 */

describe("plans", () => {
  test("8 bars: a question and its answer", () => {
    const plan = periodPlan(8)!;
    expect(plan.map((p) => p.kind)).toEqual(["new", "answer"]);
    expect(endingOf(plan, 0)).toBe("half");
    expect(endingOf(plan, 1)).toBe("authentic");
  });

  test("12 bars: question, contrast, answer", () => {
    expect(periodPlan(12)!.map((p) => `${p.kind}:${p.letter}`)).toEqual(["new:A", "new:B", "answer:A"]);
  });

  test("16 bars: A A' B A' - the answer comes back to finish", () => {
    const plan = periodPlan(16)!;
    expect(plan.map((p) => `${p.kind}:${p.letter}`)).toEqual(["new:A", "answer:A", "new:B", "repeat:A"]);
    expect(plan[3]).toMatchObject({ kind: "repeat", of: 1 });
  });

  test("every length in fours from 8 to 64 fills its bars and ends at home", () => {
    for (let m = 8; m <= 64; m += 4) {
      const plan = periodPlan(m)!;
      expect(planBars(plan)).toBe(m);
      expect(endingOf(plan, plan.length - 1)).toBe("authentic");
    }
  });

  test("no plan for lengths that are not whole phrases", () => {
    expect(periodPlan(4)).toBeNull();
    expect(periodPlan(6)).toBeNull();
    expect(periodPlan(10)).toBeNull();
  });

  test("a track's form: a letter's return brings its music back", () => {
    // Soul: intro, A, A again, B, breakdown C, A.
    const plan = planFromForm([
      { letter: "I", bars: 4 }, { letter: "A", bars: 8 }, { letter: "A", bars: 8 },
      { letter: "B", bars: 4 }, { letter: "C", bars: 4 }, { letter: "A", bars: 4 },
    ]);
    expect(planBars(plan)).toBe(32);
    expect(plan.map((p) => `${p.kind}:${p.letter}`)).toEqual([
      "new:I", "new:A", "answer:A", "repeat:A", "answer:A", "new:B", "new:C", "repeat:A",
    ]);
    // The second A is the first's question again, with a new answer.
    expect(plan[3]).toMatchObject({ kind: "repeat", of: 1 });
    expect(endingOf(plan, plan.length - 1)).toBe("authentic");
  });
});

// ---------------------------------------------------------------- composed

const simpleNames = ["quarter", "half", "eighthEighth", "dotHalf"];
const names = simpleNames;
const compose = (o: { key: string; meter: string; measures: number; rhythmOnly?: boolean; form?: unknown }) => {
  const names = o.meter.endsWith("/8") ? [...DEFAULT_RHYTHM_NAMES.compound] : simpleNames;
  return createNewSr({
    bpm: 80, tempo: 80, clef: "treble", selectedClef: "treble", timeSig: timeSignatureFor(o.meter), selectedTimeSignature: o.meter,
    measures: o.measures, maxSkip: 4, range: { min: 14, max: 21 }, selectedRhythms: names,
    rhythms: allRhythms.filter((r) => names.includes(r.name)), scaleDegrees: new Set([1, 2, 3, 4, 5, 6, 7]), key: o.key,
    chords: ["1", "2", "3", "4", "5", "6", "7"], showSolfege: true, rhythmOnly: o.rhythmOnly === true, showRhythmSyllables: true,
    syllableSystemId: "kodaly", allowTiesAcrossBarline: false, phrases: true, form: o.form,
    partsObject: { numofParts: 1, parts: { Unison: { chordNoteObject: [], order: 0, smallName: "U", selectedRange: [14, 21] } } },
  } as any);
};

type N = { noteLength: number; pitchValue: number; degree: number; name: string; chord: { name: string } | null; rhythm?: { rest?: boolean } };
const notesOf = (out: any): N[] => out[2].partsObject.parts.Unison.chordNoteObject;
function bars(notes: N[], barUnits: number): N[][] {
  const out: N[][] = [];
  let pos = 0;
  for (const n of notes) {
    (out[Math.floor(pos / barUnits)] ??= []).push(n);
    pos += n.noteLength;
  }
  return out;
}
const sig = (b: N[]) => b.map((n) => `${n.name}${n.noteLength}`).join(" ");
const sungLast = (b: N[]) => b.filter((n) => !n.rhythm?.rest).at(-1)!;

describe("composed exercises", () => {
  for (const [key, meter] of [["F", "4/4"], ["G", "3/4"], ["Dm", "4/4"], ["D", "6/8"]] as const) {
    test(`${key} ${meter}, 16 bars: question on V, answer rhymes, ends home`, () => {
      for (let run = 0; run < 8; run++) {
        const out = compose({ key, meter, measures: 16 });
        const unit = out[2].timeSig.tsPerMeasure;
        const b = bars(notesOf(out), unit);
        expect(b.length).toBe(16);
        // The question (bars 1-4) ends on V, at so, ti or re.
        const q = sungLast(b[3]);
        expect(q.chord?.name).toBe("5");
        expect([4, 6, 1]).toContain(q.degree);
        // The answer's first two bars are the question's, note for note.
        for (let k = 0; k < RHYME_BARS; k++) expect(sig(b[4 + k])).toBe(sig(b[k]));
        // A A' B A': the last phrase is the answer again.
        for (let k = 0; k < 4; k++) expect(sig(b[12 + k])).toBe(sig(b[4 + k]));
        // Home at the end.
        const end = sungLast(b[15]);
        expect(end.chord?.name).toBe("1");
        expect(out[0]).toContain("K:");
      }
    });
  }

  test("phrase joins are moves the skip rules allow (almost always)", () => {
    const policy = toSkipPolicy(4);
    let joins = 0, ok = 0;
    for (let run = 0; run < 20; run++) {
      const out = compose({ key: "F", meter: "4/4", measures: 16 });
      const b = bars(notesOf(out), 32);
      for (const at of [4, 8, 12]) {
        const last = sungLast(b[at - 1]);
        const first = b[at].find((n) => !n.rhythm?.rest)!;
        joins++;
        if (isAllowedMove(last, first, first.noteLength, policy)) ok++;
      }
    }
    expect(ok / joins).toBeGreaterThan(0.95);
  });

  test("rhythm only: the answer repeats the question's opening rhythm", () => {
    const out = compose({ key: "C", meter: "4/4", measures: 8, rhythmOnly: true });
    const b = bars(notesOf(out), 32);
    expect(b.length).toBe(8);
    for (let k = 0; k < RHYME_BARS; k++) expect(sig(b[4 + k])).toBe(sig(b[k]));
  });

  test("a track's form is followed bar for bar", () => {
    const form = [{ letter: "A", bars: 8 }, { letter: "B", bars: 4 }, { letter: "C", bars: 4 }, { letter: "A", bars: 8 }];
    const out = compose({ key: "F", meter: "4/4", measures: 24, form });
    const b = bars(notesOf(out), 32);
    expect(b.length).toBe(24);
    // The closing A is the opening question again (bars 17-20 = bars 1-4).
    for (let k = 0; k < 4; k++) expect(sig(b[16 + k])).toBe(sig(b[k]));
  });

  test("without phrases the generator is untouched (one line, no copies asked for)", () => {
    const out: any = createNewSr({
      bpm: 80, tempo: 80, clef: "treble", selectedClef: "treble", timeSig: timeSignatureFor("4/4"), selectedTimeSignature: "4/4",
      measures: 8, maxSkip: 4, range: { min: 14, max: 21 }, selectedRhythms: names, rhythms: allRhythms.filter((r) => names.includes(r.name)),
      scaleDegrees: new Set([1, 2, 3, 4, 5, 6, 7]), key: "F", chords: ["1", "2", "3", "4", "5", "6", "7"], showSolfege: true, rhythmOnly: false,
      partsObject: { numofParts: 1, parts: { Unison: { chordNoteObject: [], order: 0, smallName: "U", selectedRange: [14, 21] } } },
    } as any);
    expect(bars(out[2].partsObject.parts.Unison.chordNoteObject, 32).length).toBe(8);
  });
});
