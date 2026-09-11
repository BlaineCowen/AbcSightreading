import { describe, expect, test } from "bun:test";
import {
  pickAcrossLibrary,
  generateNonChordTones,
} from "../../src/lib/non-chord-tone-gen";
import { rhythms as allRhythms } from "../../src/resources/rhythms";
import type { VoiceNote } from "../../src/lib/types";

/**
 * Which decoration gets written, and where.
 *
 * Three separate faults, all found by measuring what the generator actually
 * produced rather than by reading the weights: an anticipation check that was
 * not a definition of an anticipation, weights that did not mean what they said,
 * and a suspension that could land anywhere in the bar.
 */

const note = (pitchValue: number, over: Partial<VoiceNote> = {}): VoiceNote =>
  ({
    name: "x",
    degree: pitchValue % 7,
    pitchValue,
    length: 8,
    rest: false,
    order: 0,
    ...over,
  }) as VoiceNote;

const pattern = allRhythms.find((r) => r.name === "eighthEighth")!;
const TS = 32; // 4/4, in 32nd-note units

describe("a weight is a share of everything, not of whatever fits", () => {
  /**
   * Every decoration but one needs something specific - a passing tone a 3rd to
   * fill, a suspension a step above, a neighbour a repeated pitch. An
   * anticipation needs only stepwise motion, which is most of this music, so on
   * a rising stepwise line it was the ONLY candidate and won however low its
   * weight: 34% of all decorations, and still 25% after being cut from 4 to 1
   * against a passing tone at 30. It was not winning the draw - it was the only
   * name in it.
   */
  const lib = (weights: Record<string, number>) =>
    Object.entries(weights).map(([name, weight]) => ({
      name,
      weight,
      check: () => true,
      generator: () => null,
    })) as any[];
  const fitting = (names: string[]) =>
    names.map((name) => ({ def: { name } as any, pattern }));

  test("a rare type that is the only one fitting usually declines", () => {
    const library = lib({ common: 99, rare: 1 });
    let picked = 0;
    for (let i = 0; i < 2000; i++) {
      if (pickAcrossLibrary(library, fitting(["rare"]))) picked++;
    }
    expect(picked).toBeGreaterThan(0);
    expect(picked / 2000).toBeLessThan(0.05);
  });

  test("a common type that fits is taken about as often as its weight", () => {
    const library = lib({ common: 99, rare: 1 });
    let picked = 0;
    for (let i = 0; i < 2000; i++) {
      if (pickAcrossLibrary(library, fitting(["common"]))) picked++;
    }
    expect(picked / 2000).toBeGreaterThan(0.9);
  });

  test("when both fit, the weights decide", () => {
    const library = lib({ common: 99, rare: 1 });
    const counts: Record<string, number> = { common: 0, rare: 0 };
    for (let i = 0; i < 3000; i++) {
      const got = pickAcrossLibrary(library, fitting(["common", "rare"]));
      if (got) counts[got.def.name]++;
    }
    expect(counts.common / (counts.common + counts.rare)).toBeGreaterThan(0.9);
  });

  test("nothing applicable is never forced", () => {
    expect(pickAcrossLibrary(lib({ a: 1 }), [])).toBeNull();
  });
});

describe("an anticipation is a step, and is stepped into", () => {
  /**
   * The old test was `gap >= 1 && gap <= 2` looking only forwards - not a
   * definition of an anticipation but a description of nearly every melodic
   * move, which is exactly why it fitted everywhere.
   */
  const decorates = (line: number[], runs = 60) => {
    let n = 0;
    for (let i = 0; i < runs; i++) {
      const voice = line.map((p) => note(p));
      const out = generateNonChordTones(
        voice.map((x) => ({ ...x })), [pattern], [voice], 0, 1, "C",
        ["Anticipation"], [0, 40]
      );
      if (out.length > voice.length) n++;
    }
    return n;
  };

  test("a step ahead, stepped into: allowed", () => {
    // C D E. Only note 1 is interior, so exactly one shape is under test.
    expect(decorates([0, 1, 2])).toBeGreaterThan(20);
  });

  test("a THIRD ahead is not an anticipation", () => {
    // C D F - stepped into, but the next note is a third away.
    expect(decorates([0, 1, 3])).toBe(0);
  });

  test("leapt into is not an anticipation either", () => {
    // C G A - a step ahead, but the G arrives by leap.
    expect(decorates([0, 4, 5])).toBe(0);
  });
});

describe("a suspension belongs on a strong beat", () => {
  /**
   * The held dissonance lands on the strong beat and resolves onto the weak one.
   * Written the other way round it is not a suspension - it is an accented
   * passing tone that never quite arrives. The pass had no idea where in the bar
   * it was working until tsPerMeasure was threaded in.
   *
   * A suspension needs the previous note exactly one step above, so in E D C B
   * every interior note qualifies and only the beat can decide between them.
   * Quarters in 4/4: note 1 is beat 2 (weak), note 2 is beat 3 (strong).
   */
  const decoratedIndexes = (runs = 80) => {
    const seen = new Set<number>();
    for (let i = 0; i < runs; i++) {
      const voice = [note(4), note(3), note(2), note(1), note(0)];
      const out = generateNonChordTones(
        voice.map((x) => ({ ...x })), [pattern], [voice], 0, 1, "C",
        ["Suspension"], [0, 40], TS
      );
      // Which note grew into two is found by walking the emitted lengths.
      let at = 0;
      for (let k = 0; k < out.length; k++) {
        if (out[k].length < 8) {
          seen.add(at / 8);
          break;
        }
        at += out[k].length;
      }
    }
    return seen;
  };

  test("it lands on strong beats and not on weak ones", () => {
    const seen = decoratedIndexes();
    expect(seen.size).toBeGreaterThan(0);
    // Beat 3 (index 2) is strong; beats 2 and 4 (indexes 1 and 3) are not.
    expect(seen.has(2)).toBe(true);
    expect(seen.has(1)).toBe(false);
    expect(seen.has(3)).toBe(false);
  });

  test("without a time signature the rule stands down rather than guessing", () => {
    // Callers that never passed one keep their old behaviour.
    let decorated = 0;
    for (let i = 0; i < 60; i++) {
      const voice = [note(4), note(3), note(2)];
      const out = generateNonChordTones(
        voice.map((x) => ({ ...x })), [pattern], [voice], 0, 1, "C",
        ["Suspension"], [0, 40]
      );
      if (out.length > voice.length) decorated++;
    }
    expect(decorated).toBeGreaterThan(20);
  });
});
