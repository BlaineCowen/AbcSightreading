import { describe, expect, test } from "bun:test";
import {
  failureHint,
  roomHint,
  tightestPart,
  type PartSpan,
} from "../../src/lib/failure-hint";

/**
 * What a failed Generate tells the reader.
 *
 * A hint that names the wrong part is worse than a vague one - it sends someone
 * to widen a voice that was never in the way - so the part it names is asserted
 * rather than assumed.
 */

const part = (name: string, low: number, high: number): PartSpan => ({
  name,
  range: [low, high],
});

/** 3-Part Tenor/Bass at the level-5 ranges: the tenor is the tight one. */
const tenorBass = [
  part("Tenor", 14, 23),     // span 9
  part("Baritone", 6, 17),   // span 11
  part("Bass", 2, 13),       // span 11
];

const ctx = (over: Partial<Parameters<typeof failureHint>[0]> = {}) => ({
  parts: tenorBass,
  measures: 8,
  chordCount: 12,
  maxSkip: 6,
  ...over,
});

describe("which part to widen", () => {
  test("the one with the least room", () => {
    expect(tightestPart(tenorBass)?.name).toBe("Tenor");
  });

  test("not merely the first in the list", () => {
    // The tight part is deliberately in the MIDDLE here. With it first, a
    // function that simply returned parts[0] passed every test.
    const parts = [part("Soprano", 20, 32), part("Alto", 21, 27), part("Baritone", 6, 18)];
    expect(tightestPart(parts)?.name).toBe("Alto"); // span 6 against 12 and 12
  });

  test("nor the lowest-sounding one", () => {
    const parts = [part("Soprano", 24, 27), part("Alto", 14, 30), part("Bass", 2, 20)];
    expect(tightestPart(parts)?.name).toBe("Soprano"); // span 3, and it sits highest
  });

  test("no parts, no name", () => {
    expect(tightestPart([])).toBeNull();
    expect(roomHint([])).not.toContain("undefined");
  });

  test("the hint names that part and says which end", () => {
    const hint = roomHint(tenorBass);
    expect(hint).toContain("Tenor");
    // The whole phrase, not the bare word: "top" appears twice in this
    // sentence, so matching it alone could not tell the two ends apart.
    expect(hint).toContain("more room at the top");
    expect(hint).not.toContain("more room at the bottom");
    expect(hint).toContain("Voice Ranges");
  });
});

describe("what a failed Generate says", () => {
  test("sixteen bars in three parts blames the length first", () => {
    const hint = failureHint(ctx({ measures: 16 }));
    expect(hint).toContain("8 bars");
    expect(hint).toContain("Tenor"); // and still says what to widen
  });

  test("a tight part at a normal length blames the part", () => {
    const hint = failureHint(ctx({ measures: 8 }));
    expect(hint).toContain("Tenor");
    expect(hint).toContain("least room");
  });

  test("roomy parts are not blamed for a thin chord set", () => {
    // Every part has a wide span here, so the chord count is the real story.
    const roomy = [part("Soprano", 20, 34), part("Alto", 14, 30), part("Bass", 2, 20)];
    const hint = failureHint(ctx({ parts: roomy, chordCount: 3 }));
    expect(hint).toContain("Harmony");
    expect(hint).not.toContain("least room");
  });

  test("nor for a max skip that is the real constraint", () => {
    const roomy = [part("Soprano", 20, 34), part("Alto", 14, 30), part("Bass", 2, 20)];
    const hint = failureHint(ctx({ parts: roomy, maxSkip: 2 }));
    expect(hint).toContain("third");
  });

  test("two parts are never told they are crowded", () => {
    // The crowding hints are about three or more voices needing somewhere to
    // go; with two it is the wrong diagnosis however narrow they are.
    const two = [part("Soprano", 25, 30), part("Alto", 21, 26)];
    const hint = failureHint(ctx({ parts: two, measures: 16 }));
    expect(hint).not.toContain("least room of any part");
    expect(hint).not.toContain("Sixteen bars in three");
  });

  test("even the last-resort hint says what to do", () => {
    const roomy = [part("Soprano", 20, 34), part("Alto", 14, 30), part("Bass", 2, 20)];
    const hint = failureHint(ctx({ parts: roomy }));
    expect(hint).toContain("Generate again");
    expect(hint).toContain("Voice Ranges");
  });

  test("every hint is a whole sentence, not a fragment", () => {
    const cases = [
      ctx({ measures: 16 }),
      ctx(),
      ctx({ chordCount: 3 }),
      ctx({ maxSkip: 2 }),
      ctx({ parts: [part("S", 20, 34), part("A", 14, 30), part("B", 2, 20)] }),
    ];
    for (const c of cases) {
      const hint = failureHint(c);
      expect(hint.endsWith(".")).toBe(true);
      expect(hint).not.toContain("undefined");
    }
  });
});

describe("when eighths are being held to a step", () => {
  // The Alto is deliberately the tightest of the three, so the assertion about
  // naming a voice is testing the choice rather than the array order - equal
  // spans just hand back the first one.
  const CLOSE_THREE: PartSpan[] = [
    { name: "Soprano1", range: [24, 33] },
    { name: "Soprano2", range: [21, 30] },
    { name: "Alto", range: [17, 24] },
  ];

  test("it is named first, because it is the setting that actually frees this", () => {
    // Across the full sweep it is the difference between 599 failures in 22,068
    // and 14 - nothing else on this page comes close - and it is ON by default,
    // so it is the one hint here naming something the reader never chose.
    const hint = failureHint({
      parts: CLOSE_THREE, measures: 16, chordCount: 12, maxSkip: 6,
      stepwiseEighths: true,
    });
    expect(hint).toMatch(/Eighth notes move by step/);
  });

  test("and is not named when it is already off", () => {
    // Sending someone to turn off a setting that is off is worse than vague:
    // they go looking, find it already off, and learn the hints cannot be
    // trusted.
    const hint = failureHint({
      parts: CLOSE_THREE, measures: 16, chordCount: 12, maxSkip: 6,
      stepwiseEighths: false,
    });
    expect(hint).not.toMatch(/Eighth notes move by step/);
    expect(hint).toMatch(/Sixteen bars/);
  });

  test("nor at eight bars, where it is not what is in the way", () => {
    const hint = failureHint({
      parts: CLOSE_THREE, measures: 8, chordCount: 12, maxSkip: 6,
      stepwiseEighths: true,
    });
    expect(hint).not.toMatch(/Eighth notes move by step/);
  });

  test("it still says which voice to widen, so there are two ways out", () => {
    const hint = failureHint({
      parts: CLOSE_THREE, measures: 16, chordCount: 12, maxSkip: 6,
      stepwiseEighths: true,
    });
    expect(hint).toMatch(/Alto/); // the tightest part here
  });
});
