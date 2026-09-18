import { describe, expect, test } from "bun:test";
import { buildFullLengthPiece, joinRendered } from "../../src/lib/full-length";
import { planForm } from "../../src/lib/form-plan";
import type { VoiceNote } from "../../src/lib/types";
import type { PlannedSection } from "../../src/lib/form-plan";

/**
 * Turning a plan into a piece.
 *
 * No music is generated here - the generator is injected, so what is under test
 * is the glue: that every planned section is asked for, that a restatement is
 * not asked for twice, that the piece comes out the length the plan says, and
 * that the annotation toggles can re-write a finished piece.
 */

const HEADER = [
  "X:1",
  "T:Test",
  "M:4/4",
  "L:1/8",
  "%%score S A",
  'V:S clef=treble name="Soprano" snm="S"',
  'V:A clef=treble name="Alto" snm="A"',
  "K:C",
].join("\n");

/** One bar per measure, so bars are countable. `tag` marks the render. */
const abcFor = (section: PlannedSection, tag = "") => {
  const bars = (pitch: string) =>
    Array.from({ length: section.measures }, () => `${pitch}8`).join("|") + "|]";
  return `${HEADER}\n[V:S] ${bars("c")}${tag}\n[V:A] ${bars("E")}\n`;
};

const note = (pitchValue: number): VoiceNote =>
  ({ name: "x", degree: 0, pitchValue, length: 32, rest: false, order: 0 } as VoiceNote);

/** Voices a third apart, so a seam is never refused for parallels. */
const voicesFor = (section: PlannedSection) => [
  Array.from({ length: section.measures }, () => ({ ...note(16), order: 1 })),
  Array.from({ length: section.measures }, () => ({ ...note(14), order: 0 })),
];

function build(plan = planForm({ level: 2, key: "C" }), onSection?: (s: PlannedSection) => void) {
  const asked: PlannedSection[] = [];
  const piece = buildFullLengthPiece(
    (section) => {
      asked.push(section);
      onSection?.(section);
      return {
        voices: voicesFor(section),
        abc: abcFor(section),
        render: (d) => abcFor(section, d.lyrics ? " %solfege" : ""),
      };
    },
    { plan, maxSkip: 8 }
  );
  return { piece, asked };
}

describe("building the piece a plan describes", () => {
  test("every section that is not a restatement is generated", () => {
    const plan = planForm({ level: 2, key: "C" });
    const { asked } = build(plan);
    const wanted = plan.sections.filter((s) => !s.restates).map((s) => s.label);
    expect([...new Set(asked.map((s) => s.label))].sort()).toEqual(wanted.sort());
  });

  test("a restatement is never generated again", () => {
    // It has to be the SAME music to be heard as a return, so asking the
    // generator for it a second time would defeat the point.
    const plan = planForm({ level: 2, key: "C" });
    const { asked } = build(plan);
    expect(asked.some((s) => s.label === "A'")).toBe(false);
    expect(plan.sections.some((s) => s.label === "A'")).toBe(true);
  });

  test("the generator is told which section it is writing", () => {
    // Not just how long it is. A section's texture and key area are the whole
    // point of planning it, and they arrive with it.
    const plan = planForm({ level: 5, key: "C" });
    const seen: PlannedSection[] = [];
    build(plan, (s) => seen.push(s));
    const imitative = seen.find((s) => s.style === "imitative");
    expect(imitative).toBeDefined();
    expect(imitative!.texture).toBe("staggered");
    expect(seen.some((s) => s.keyArea === "dominant")).toBe(true);
  });

  test("the piece is as long as the plan says", () => {
    for (const level of [1, 2, 3, 4, 5]) {
      const plan = planForm({ level, key: "C" });
      const { piece } = build(plan);
      const bars = (piece.abc.match(/\|/g) ?? []).length / 2; // two voices
      expect(bars).toBe(plan.measures);
    }
  });

  test("the sections come back in order with their planned bars", () => {
    const plan = planForm({ level: 4, key: "C" });
    const { piece } = build(plan);
    expect(piece.sections.map((s) => s.label)).toEqual(plan.sections.map((s) => s.label));
    expect(piece.sections.map((s) => s.measures)).toEqual(plan.sections.map((s) => s.measures));
  });

  test("a rough seam is reported rather than thrown", () => {
    const plan = planForm({ level: 2, key: "C" });
    const { piece } = build(plan);
    expect(Array.isArray(piece.roughSeams)).toBe(true);
    expect(piece.abc.length).toBeGreaterThan(0); // the piece exists either way
  });
});

describe("re-writing a finished piece", () => {
  test("the annotation toggles re-render every section, not just the first", () => {
    // The UI keeps one render() for the exercise. For a piece made of sections
    // that has to reach all of them, or turning solfege on would annotate the
    // opening and leave the rest bare.
    const { piece } = build();
    const plain = piece.render({});
    const solfa = piece.render({ lyrics: "movable" });
    expect(plain).not.toContain("%solfege");
    const marks = (solfa.match(/%solfege/g) ?? []).length;
    expect(marks).toBe(piece.sections.length);
  });

  test("a re-render is the same length as the piece", () => {
    const plan = planForm({ level: 3, key: "C" });
    const { piece } = build(plan);
    const bars = (piece.render({ lyrics: "movable" }).match(/\|/g) ?? []).length / 2;
    expect(bars).toBe(plan.measures);
  });

  test("a section with no render of its own keeps the ABC it was built with", () => {
    const joined = joinRendered(
      [
        { label: "A", measures: 1, startsAtBar: 1, voices: [], abc: `${HEADER}\n[V:S] c8|]\n[V:A] E8|]\n`, restated: false },
      ],
      { lyrics: "movable" }
    );
    expect(joined).toContain("c8");
  });
});
