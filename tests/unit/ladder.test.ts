import { describe, expect, test } from "bun:test";
import { ladder, ladderById, ladderStages, rangeForStep, stepHref } from "../../src/lib/ladder";
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
    ladder.forEach((s, i) => expect(s.number).toBe(i + 1));
    expect(ladderById["pitch-do-re-mi"].number).toBe(3);
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
