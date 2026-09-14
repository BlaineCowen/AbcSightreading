import { describe, expect, test } from "bun:test";
import {
  buildSectionalExercise,
  classicSectionalShape,
  seamOk,
  type SectionSpec,
} from "../../src/lib/sectional-form";
import type { VoiceNote } from "../../src/lib/types";

/**
 * Pieces built from sections.
 *
 * The sections themselves are the generator's work and already tested; the only
 * new thing here is putting two of them end to end. So these test the join -
 * that a return really is a return, that the seam is vetted, and that a seam
 * which cannot be made to fit is reported rather than thrown away or thrown.
 */

const note = (pitchValue: number, over: Partial<VoiceNote> = {}): VoiceNote =>
  ({ name: "x", degree: pitchValue % 7, pitchValue, length: 8, rest: false, order: 0, ...over } as VoiceNote);

/**
 * `n` bars of a flat line on `pitch`, for two voices a THIRD apart.
 *
 * A third rather than an octave on purpose: two voices an octave apart both
 * stepping up is parallel octaves, which `seamOk` refuses - correctly, and it
 * would make every fixture here look like a seam fault.
 */
const voicesAt = (pitch: number, bars = 2): VoiceNote[][] => [
  Array.from({ length: bars }, () => note(pitch + 2, { order: 1 })),
  Array.from({ length: bars }, () => note(pitch, { order: 0 })),
];
/** The shape the builder's callback returns. */
const flat = (pitch: number, bars = 2) => ({ voices: voicesAt(pitch, bars) });

const SPECS: SectionSpec[] = [
  { label: "A", measures: 2 },
  { label: "B", measures: 2 },
  { label: "A'", measures: 2, restates: "A" },
];

describe("a piece made of sections", () => {
  test("the sections are joined in order, end to end", () => {
    const result = buildSectionalExercise(() => flat(14), { sections: SPECS, maxSkip: 4 });
    expect(result.voices.length).toBe(2);
    // Two bars each, three sections, one note per bar in this fixture.
    expect(result.voices[0].length).toBe(6);
    expect(result.totalMeasures).toBe(6);
  });

  test("each section knows which bar it starts at", () => {
    const result = buildSectionalExercise(() => flat(14), {
      sections: [{ label: "A", measures: 8 }, { label: "B", measures: 8 }, { label: "coda", measures: 4 }],
      maxSkip: 4,
    });
    expect(result.sections.map((s) => [s.label, s.startsAtBar])).toEqual([
      ["A", 1], ["B", 9], ["coda", 17],
    ]);
    expect(result.totalMeasures).toBe(20);
  });

  test("a return is the SAME music, not more music like it", () => {
    // A listener recognises A' because it is A. Generating another section with
    // the same settings would only sound similar.
    let call = 0;
    const result = buildSectionalExercise(() => flat(14 + call++), { sections: SPECS, maxSkip: 12 });
    const a = result.sections.find((s) => s.label === "A")!;
    const aPrime = result.sections.find((s) => s.label === "A'")!;
    expect(aPrime.restated).toBe(true);
    expect(aPrime.voices.map((v) => v.map((n) => n.pitchValue)))
      .toEqual(a.voices.map((v) => v.map((n) => n.pitchValue)));
  });

  test("a restatement is a copy, so editing one does not change the other", () => {
    const result = buildSectionalExercise(() => flat(14), { sections: SPECS, maxSkip: 12 });
    const a = result.sections.find((s) => s.label === "A")!;
    const aPrime = result.sections.find((s) => s.label === "A'")!;
    aPrime.voices[0][0].pitchValue = 99;
    expect(a.voices[0][0].pitchValue).not.toBe(99);
  });

  test("restating a section that does not exist is refused", () => {
    expect(() =>
      buildSectionalExercise(() => flat(14), {
        sections: [{ label: "A", measures: 2 }, { label: "B", measures: 2, restates: "nope" }],
        maxSkip: 4,
      })
    ).toThrow(/does not exist/);
  });

  test("no sections, no piece, no crash", () => {
    const result = buildSectionalExercise(() => flat(14), { sections: [], maxSkip: 4 });
    expect(result.voices).toEqual([]);
    expect(result.totalMeasures).toBe(0);
  });
});

describe("the seam between two sections", () => {
  test("a singable join is accepted", () => {
    expect(seamOk(voicesAt(14), voicesAt(15), 4).ok).toBe(true);
  });

  test("a leap wider than the singer is allowed is refused", () => {
    // The whole reason this module vets anything: two sections generated
    // independently know nothing about each other, so the join can hand a
    // singer an interval the search itself would never have written.
    const verdict = seamOk(voicesAt(14), voicesAt(24), 4);
    expect(verdict.ok).toBe(false);
    expect(verdict.ok === false && verdict.reason).toMatch(/leaps too far/);
  });

  test("an accidental owed a resolution is not stranded", () => {
    const before = voicesAt(14);
    const last = before[0][before[0].length - 1];
    before[0][before[0].length - 1] = { ...last, accidental: "sharp", wasRaised: true } as VoiceNote;
    // A raised note must rise by a step. This next section starts a step BELOW.
    const verdict = seamOk(before, voicesAt(13), 4);
    expect(verdict.ok).toBe(false);
    expect(verdict.ok === false && verdict.reason).toMatch(/strands an accidental/);
  });

  test("and is accepted when the resolution is there", () => {
    const before = voicesAt(14);
    const last = before[0][before[0].length - 1];
    before[0][before[0].length - 1] = { ...last, accidental: "sharp", wasRaised: true } as VoiceNote;
    // Voice 0 resumes exactly one step above the raised note, which is the
    // resolution it is owed.
    const after = voicesAt(14);
    after[0] = after[0].map((n) => ({ ...n, pitchValue: last.pitchValue + 1 }));
    expect(seamOk(before, after, 4).ok).toBe(true);
  });

  test("parallel octaves across the join are refused", () => {
    // Two voices an octave apart, both stepping up into another octave. The
    // search refuses this inside a section; a join must not smuggle it in.
    const octaves = (pitch: number): VoiceNote[][] => [
      [note(pitch + 7, { order: 1 })],
      [note(pitch, { order: 0 })],
    ];
    const verdict = seamOk(octaves(14), octaves(15), 4);
    expect(verdict.ok).toBe(false);
    expect(verdict.ok === false && verdict.reason).toMatch(/parallel/);
  });

  test("parallel fifths across the join are refused too", () => {
    const fifths = (pitch: number): VoiceNote[][] => [
      [note(pitch + 4, { order: 1 })],
      [note(pitch, { order: 0 })],
    ];
    const verdict = seamOk(fifths(14), fifths(15), 4);
    expect(verdict.ok).toBe(false);
    expect(verdict.ok === false && verdict.reason).toMatch(/parallel/);
  });

  test("but contrary motion into the same interval is fine", () => {
    // The rule is about both voices moving the same way, not about the
    // interval they land on.
    const before: VoiceNote[][] = [[note(21, { order: 1 })], [note(14, { order: 0 })]];
    const after: VoiceNote[][] = [[note(20, { order: 1 })], [note(15, { order: 0 })]];
    expect(seamOk(before, after, 4).ok).toBe(true);
  });

  test("a mismatched number of voices is refused rather than mis-joined", () => {
    const verdict = seamOk(voicesAt(14), [voicesAt(14)[0]], 4);
    expect(verdict.ok).toBe(false);
  });

  test("a section is regenerated until its seam fits", () => {
    // Section A is fixed; B is offered two candidates that leap out of range
    // before one that is singable.
    const offered = [40, 40, 15];
    let call = 0;
    const result = buildSectionalExercise(
      () => (call === 0 ? (call++, flat(14)) : flat(offered[Math.min(call++ - 1, offered.length - 1)])),
      { sections: [{ label: "A", measures: 2 }, { label: "B", measures: 2 }], maxSkip: 4 }
    );
    const b = result.sections.find((s) => s.label === "B")!;
    expect(b.voices[1][0].pitchValue).toBe(15);
    expect(result.roughSeams).toEqual([]);
  });

  test("a seam that never fits is reported, not thrown", () => {
    // A piece with one awkward join is worth more than no piece - but the
    // caller has to be told, or it is just a silent fault.
    let call = 0;
    const result = buildSectionalExercise(
      () => (call++ === 0 ? flat(14) : flat(40)),
      {
        sections: [{ label: "A", measures: 2 }, { label: "B", measures: 2 }],
        maxSkip: 4,
        seamAttempts: 3,
      }
    );
    expect(result.roughSeams.length).toBe(1);
    expect(result.roughSeams[0].after).toBe("A");
    expect(result.voices[0].length).toBe(4); // the piece still exists
  });
});

describe("one piece, two levels", () => {
  test("the short ending lands on the last bar of the named section", () => {
    // Standard practice: a full cadence part way through where the lower level
    // stops, and the rest for the higher one.
    const result = buildSectionalExercise(() => flat(14), {
      sections: [
        { label: "A", measures: 8 },
        { label: "B", measures: 8 },
        { label: "A'", measures: 8, restates: "A" },
        { label: "coda", measures: 4 },
      ],
      maxSkip: 12,
      shortEndingAfter: "A'",
    });
    expect(result.shortEndingBar).toBe(24);
    expect(result.totalMeasures).toBe(28);
  });

  test("no short ending asked for, none reported", () => {
    const result = buildSectionalExercise(() => flat(14), { sections: SPECS, maxSkip: 12 });
    expect(result.shortEndingBar).toBeUndefined();
  });
});

describe("the offered shape", () => {
  test("is a statement, a departure, a return and a coda", () => {
    const shape = classicSectionalShape();
    expect(shape.map((s) => s.label)).toEqual(["A", "B", "C", "A'", "coda"]);
    expect(shape.find((s) => s.label === "A'")!.restates).toBe("A");
    expect(shape.reduce((n, s) => n + s.measures, 0)).toBe(32);
  });
});
