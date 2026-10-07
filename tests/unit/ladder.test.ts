import { describe, expect, test } from "bun:test";
import { ladder, ladderById, ladderStages, rangeForSpan, rangeForStep, stepHref } from "../../src/lib/ladder";
import { uilPresets } from "../../src/lib/uil-presets";
import { rhythms } from "../../src/resources/rhythms";
import { chords } from "../../src/resources/chords";
import { keySignatures } from "../../src/resources/key-signatures";
import { selectableRhythms } from "../../src/lib/selectable-rhythms";

/**
 * The ladder's settings are data a class's progress is stored against, and a
 * typo in them is silent - an unknown rhythm is dropped, not reported. Whether
 * each step actually generates is scripts/check-ladder.ts; this is the shape.
 */

const rhythmNames = new Set(rhythms.map((r) => r.name));
const chordNames = new Set(chords.map((c: any) => c.name));
const VOICINGS = [
  "4 Part Mixed", "3 Part Mixed", "3 Part Treble", "3 Part Tenor/Bass",
  "2 Part Treble", "2 Part Tenor/Bass",
];

describe("ladder", () => {
  test("ids are unique, stable-looking, and numbered in order", () => {
    const ids = ladder.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    // Numbered from 1 with no gaps; the two halves of a pair share a number, rhythm first.
    expect(ladder[0].number).toBe(1);
    for (let i = 1; i < ladder.length; i++) {
      const d = ladder[i].number - ladder[i - 1].number;
      expect(d === 0 || d === 1).toBe(true);
      if (d === 0) expect([ladder[i - 1].part, ladder[i].part]).toEqual(["rhythm", "notes"]);
    }
    expect(ladderById["sbs-03-notes"].number).toBe(3);
  });

  test("retired ids open the step that replaced them", () => {
    expect(ladderById["pitch-do-re-mi"].id).toBe("sbs-03-notes");
    expect(ladderById["rhythm-ta-titi"].id).toBe("sbs-01-rhythm");
  });

  test("rhythm runs two steps ahead: a sung step uses only rhythms spoken two or more steps before", () => {
    const spoken = (n: number) => new Set(ladder.filter((s) => s.part === "rhythm" && s.number <= n).flatMap((s) => s.unison!.selectedRhythms));
    for (const s of ladder.filter((s) => s.part === "notes")) {
      const known = spoken(s.number - 2);
      for (const r of s.unison!.selectedRhythms) expect({ step: s.number, r, known: known.has(r) }).toMatchObject({ known: true });
    }
    // And no sung step before there are rhythms to sing on.
    expect(ladder.find((s) => s.part === "notes")!.number).toBe(3);
  });

  test("each step carries the settings of the page it names, and only those", () => {
    for (const s of ladder) {
      expect(!!s.unison).toBe(s.page === "unison");
      expect(!!s.choral).toBe(s.page === "choral");
      expect(stepHref(s)).toContain(s.page === "unison" ? "/sightreading?" : "/choral-sightreading?");
    }
  });

  test("unison first, then parts: the single line comes before any harmony", () => {
    const firstChoral = ladder.findIndex((s) => s.page === "choral");
    expect(ladder.slice(firstChoral).every((s) => s.page === "choral")).toBe(true);
    // And rhythm alone comes before any pitch.
    expect(ladder[0].unison?.rhythmOnly).toBe(true);
  });

  test("stages group consecutive steps and lose none", () => {
    const stages = ladderStages();
    expect(stages.flatMap((g) => g.steps)).toEqual(ladder);
    expect(new Set(stages.map((g) => g.stage)).size).toBe(stages.length);
  });

  test("unison steps name rhythms the Unison page offers, and real keys", () => {
    const offered = new Set(selectableRhythms.map((r) => r.name));
    for (const s of ladder.filter((s) => s.unison)) {
      for (const n of s.unison!.selectedRhythms) expect(offered.has(n)).toBe(true);
      if (s.unison!.selectedKey) expect(keySignatures[s.unison!.selectedKey]).toBeDefined();
    }
  });

  test("a pitched step's range holds every note it selects, and no gap exceeds its skip", () => {
    for (const s of ladder.filter((s) => s.unison && !s.unison.rhythmOnly)) {
      const u = s.unison!;
      expect(u.span).toBeDefined();
      const [below, above] = u.span!;
      // Scale degrees reachable inside the span, as 1-7.
      const inRange = new Set<number>();
      for (let d = below; d <= above; d++) inRange.add((((d % 7) + 7) % 7) + 1);
      for (const deg of u.selectedScaleDegrees!) expect(inRange.has(deg)).toBe(true);
      // Walk the span: consecutive selected notes must be within maxSkip.
      const positions: number[] = [];
      for (let d = below; d <= above; d++) {
        if (u.selectedScaleDegrees!.includes((((d % 7) + 7) % 7) + 1)) positions.push(d);
      }
      for (let i = 1; i < positions.length; i++) {
        expect(positions[i] - positions[i - 1]).toBeLessThanOrEqual(u.maxSkip!);
      }
    }
  });

  test("rangeForStep puts do inside the class's own range", () => {
    const doReMi = ladderById["pitch-do-re-mi"].unison!;
    expect(rangeForStep(doReMi, { min: 14, max: 21 })).toEqual({ min: 14, max: 16 }); // C4-E4
    expect(rangeForStep(doReMi, { min: 7, max: 14 })).toEqual({ min: 7, max: 9 }); // C3-E3, bass
    const belowDo = ladderById["pitch-below-do"].unison!; // F: low so to so
    expect(rangeForStep(belowDo, { min: 14, max: 21 })).toEqual({ min: 14, max: 21 });
    expect(rangeForStep(ladderById["rhythm-ta-titi"].unison!, { min: 14, max: 21 })).toBeNull();
  });

  test("rangeForSpan places a span on the do at or above the anchor, the same for every draw", () => {
    const fifth: [number, number] = [0, 4];
    expect(rangeForSpan(fifth, "C", 14)).toEqual({ min: 14, max: 18 }); // C4-G4
    expect(rangeForSpan(fifth, "F", 14)).toEqual({ min: 17, max: 21 }); // F4-C5
    expect(rangeForSpan(fifth, "G", 14)).toEqual({ min: 18, max: 22 }); // G4-D5
    const ninth: [number, number] = [-3, 5]; // low sol to la
    expect(rangeForSpan(ninth, "C", 14)).toEqual({ min: 11, max: 19 }); // G3-A4
    expect(rangeForSpan(ninth, "Eb", 14)).toEqual({ min: 13, max: 21 });
    expect(rangeForSpan(ninth, "C", 7)).toEqual({ min: 4, max: 12 }); // bass clef
    // Draw after draw from the same anchor: each key lands in the same place
    // every time, never an octave higher than the last.
    const expected: Record<string, { min: number; max: number }> = {
      C: { min: 14, max: 18 }, F: { min: 17, max: 21 }, G: { min: 18, max: 22 },
    };
    for (const key of ["C", "F", "G", "C", "G", "F", "C"]) {
      expect(rangeForSpan(fifth, key, 14)).toEqual(expected[key]);
    }
    expect(rangeForSpan(fifth, "H", 14)).toBeNull();
  });

  test("choral steps name real rhythms, chords, keys and voicings", () => {
    for (const s of ladder.filter((s) => s.choral)) {
      const c = s.choral!;
      for (const n of c.selectedRhythmNames) {
        expect(rhythmNames.has(n)).toBe(true);
        expect(c.allowedRhythmNames).toContain(n);
      }
      for (const n of c.allowedChordNames) expect(chordNames.has(n)).toBe(true);
      for (const k of c.allowedKeys) expect(keySignatures[k]).toBeDefined();
      for (const v of c.allowedVoicings) expect(VOICINGS).toContain(v);
    }
  });

  test("choral steps use the hand-calibrated UIL ranges, unchanged", () => {
    const tables = Object.values(uilPresets).map((p) => JSON.stringify(p.voiceRanges));
    for (const s of ladder.filter((s) => s.choral)) {
      expect(tables).toContain(JSON.stringify(s.choral!.voiceRanges));
    }
  });
});
