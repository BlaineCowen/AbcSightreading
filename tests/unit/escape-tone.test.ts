import { describe, expect, test } from "bun:test";
import { generateNonChordTones } from "../../src/lib/non-chord-tone-gen";
import { rhythms as allRhythms } from "../../src/resources/rhythms";
import type { VoiceNote } from "../../src/lib/types";

/**
 * The escape tone - the one decoration in the Bach study the generator could
 * not write at all (3.4% of his non-chord tones).
 *
 * It is the appoggiatura's mirror: that one leaps in and steps out, this one
 * steps out and leaps back over the line. Unaccented, so the chord tone keeps
 * the beat and the dissonance happens on the way to the next one.
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

/** Decorate `line` with escape tones only, and return what came out. */
function decorate(line: number[]) {
  const voice = line.map((p) => note(p));
  return generateNonChordTones(
    voice.map((x) => ({ ...x })), [pattern], [voice], 0, 1, "C",
    ["Escape Tone"], [0, 40]
  );
}

/** How often the pass produced anything at all, over `runs` attempts. */
function decoratedRuns(line: number[], runs = 60) {
  let n = 0;
  for (let i = 0; i < runs; i++) if (decorate(line).length > line.length) n++;
  return n;
}

describe("an escape tone steps away and leaps back", () => {
  test("it is written at all", () => {
    // C D E: note 1 is interior and the line moves by step, which is the shape.
    expect(decoratedRuns([0, 1, 2])).toBeGreaterThan(20);
  });

  test("the chord tone keeps the beat and the dissonance follows it", () => {
    // The figure replaces note 1 (D) with [D, escape]. Accenting the dissonance
    // instead would make it an appoggiatura, which is a different figure.
    for (let i = 0; i < 40; i++) {
      const out = decorate([0, 1, 2]);
      if (out.length === 3) continue; // not decorated this time
      expect(out[1].pitchValue).toBe(1); // the chord tone, still on the beat
    }
  });

  test("the step is away from where the line is going", () => {
    // Rising C D E: the escape from D goes DOWN to C, and the leap up to E is
    // then a third. Stepping the same way as the line would just be a passing
    // tone with the notes in the wrong order.
    for (let i = 0; i < 40; i++) {
      const out = decorate([0, 1, 2]);
      if (out.length === 3) continue;
      expect(out[2].pitchValue).toBe(0); // down, against the rising line
    }
  });

  test("and it mirrors on a falling line", () => {
    // E D C: the escape from D goes UP to E.
    for (let i = 0; i < 40; i++) {
      const out = decorate([4, 3, 2]);
      if (out.length === 3) continue;
      expect(out[2].pitchValue).toBe(4);
    }
  });

  test("the leap out is exactly a third", () => {
    // What the stepwise-motion rule is for. A third is the interval a singer can
    // find with a dissonance behind them; a fourth or a fifth is not.
    for (let i = 0; i < 40; i++) {
      const out = decorate([0, 1, 2]);
      if (out.length === 3) continue;
      expect(Math.abs(out[3].pitchValue - out[2].pitchValue)).toBe(2);
    }
  });

  test("not over a line that already leaps", () => {
    // C D F: the escape from D would leave a FOURTH to leap back over.
    expect(decoratedRuns([0, 1, 3])).toBe(0);
  });

  test("nor over a repeated note, which has no direction to escape", () => {
    expect(decoratedRuns([0, 1, 1])).toBe(0);
  });

  test("nor when the pattern would hold the dissonance longer than the note it left", () => {
    // No pattern in the library is short-then-long today, so this guard is for
    // one arriving later. An escape tone held longer than its own chord tone is
    // not an escape tone - it is an accent in the wrong place.
    const shortThenLong = {
      ...pattern,
      name: "testShortThenLong",
      abcValue: ["2", "6"],
      meterValue: [1 / 16, 3 / 16],
    } as typeof pattern;
    const line = [0, 1, 2];
    const voice = line.map((p) => note(p));
    let decorated = 0;
    for (let i = 0; i < 60; i++) {
      const out = generateNonChordTones(
        voice.map((x) => ({ ...x })), [shortThenLong], [voice], 0, 1, "C",
        ["Escape Tone"], [0, 40]
      );
      if (out.length > line.length) decorated++;
    }
    expect(decorated).toBe(0);
  });
});
