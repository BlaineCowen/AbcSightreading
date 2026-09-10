import { describe, expect, test } from "bun:test";
import { generateRandomRhythm } from "../../src/lib/rhythm-generation";
import { rhythms as allRhythms } from "../../src/resources/rhythms";

/**
 * A phrase ending is a note plus a breath.
 *
 * The interior cadence used to be a half note, which in 4/4 puts the arrival on
 * beat 3 and runs it straight into the next phrase. Measured over 200 exercises:
 * the m4 cadence was a half note 100% of the time and a dotted half 0%, with
 * something resting after it in only 22%. It was structurally there and
 * rhythmically invisible.
 *
 * The figure now fills the cadence measure - held for all but the last beat,
 * then that beat as a rest or as a pickup into the next phrase.
 */

const BEAT = 8;
const pick = (names: string[]) => allRhythms.filter((r) => names.includes(r.name));

const UIL3 = ["whole", "dotHalf", "half", "quarter", "eighthEighth", "quarterRest", "halfRest"];
const UIL1 = ["whole", "half", "quarter", "quarterRest", "halfRest"];

function gen(names: string[], tsPerMeasure: number, measures = 8) {
  const timeSig = { name: "x", tsPerMeasure, beamGroupSize: 8 } as any;
  for (let attempt = 0; attempt < 60; attempt++) {
    // Cadence enforcement keys off there being any single (non-pattern,
    // non-rest) rhythm available, not off the cadence plan, so [] is fine here -
    // it only supplies the cadenceType label.
    const out = generateRandomRhythm(timeSig, measures, pick(names), []) as any[];
    if (out?.length) return out;
  }
  throw new Error("no rhythm in 60 attempts");
}

/** Offsets, in 32nd-note units, of each element from the start. */
function withOffsets(rhythm: any[]) {
  let t = 0;
  return rhythm.map((r) => {
    const at = t;
    t += r.totalValue;
    return { ...r, at };
  });
}

describe("interior phrase endings", () => {
  test("the cadence note is held for all but the last beat of its measure", () => {
    for (let i = 0; i < 25; i++) {
      const r = withOffsets(gen(UIL3, 32));
      const interior = r.filter((x) => x.isCadenceEnd && x.at + x.totalValue < 8 * 32);
      expect(interior.length).toBeGreaterThan(0);
      for (const c of interior) {
        expect(c.totalValue).toBe(32 - BEAT); // a dotted half in 4/4
        expect(c.at % 32).toBe(0); // and it starts on beat 1, where an arrival belongs
      }
    }
  });

  test("a breath follows it, and fills the measure exactly", () => {
    for (let i = 0; i < 25; i++) {
      const r = withOffsets(gen(UIL3, 32));
      for (let k = 0; k < r.length; k++) {
        if (!r[k].isCadenceEnd || r[k].at + r[k].totalValue >= 8 * 32) continue;
        const tail = r[k + 1];
        expect(tail).toBeDefined();
        expect(tail.isPhraseBreath).toBe(true);
        expect(tail.totalValue).toBe(BEAT);
        expect((r[k].at + r[k].totalValue + tail.totalValue) % 32).toBe(0);
      }
    }
  });

  test("the breath is never itself a cadence end", () => {
    // isCadenceEnd advances cadencePlanIndex in chord-generation. A second one
    // here would eat the next phrase's planned cadence and leave the last phrase
    // of the exercise without one - silently, since nothing reads it back.
    for (let i = 0; i < 25; i++) {
      for (const x of gen(UIL3, 32)) {
        if (x.isPhraseBreath) expect(x.isCadenceEnd).toBeFalsy();
      }
    }
  });

  test("exactly one cadence end per four-measure phrase", () => {
    for (let i = 0; i < 25; i++) {
      const r = withOffsets(gen(UIL3, 32));
      const perPhrase = [0, 0];
      for (const x of r) if (x.isCadenceEnd) perPhrase[Math.floor(x.at / (4 * 32))]++;
      expect(perPhrase).toEqual([1, 1]);
    }
  });

  test("it is sized from the meter, so 3/4 gets a half plus a quarter", () => {
    for (let i = 0; i < 25; i++) {
      const r = withOffsets(gen(UIL3, 24));
      const interior = r.filter((x) => x.isCadenceEnd && x.at + x.totalValue < 8 * 24);
      for (const c of interior) {
        expect(c.totalValue).toBe(24 - BEAT);
        expect(c.at % 24).toBe(0);
      }
    }
  });

  test("a level that has not taught the dotted half never meets one", () => {
    // The held note has to be a rhythm the user actually selected. UIL 1 and 2
    // have no dotHalf, so the old half-note ending stands there.
    for (let i = 0; i < 25; i++) {
      for (const x of gen(UIL1, 32)) {
        expect(x.totalValue).not.toBe(24);
      }
    }
  });

  test("both endings appear when both are available", () => {
    // Always resting made every interior phrase in an exercise end identically.
    const seen = new Set<boolean>();
    for (let i = 0; i < 60; i++) {
      for (const x of gen(UIL3, 32)) if (x.isPhraseBreath) seen.add(!!x.rest);
    }
    expect(seen.has(true)).toBe(true);  // a rest
    expect(seen.has(false)).toBe(true); // a pickup note
  });

  test("every measure still sums to exactly one measure", () => {
    for (const tsPerMeasure of [32, 24]) {
      for (let i = 0; i < 20; i++) {
        const total = gen(UIL3, tsPerMeasure).reduce((a, r) => a + r.totalValue, 0);
        expect(total).toBe(8 * tsPerMeasure);
      }
    }
  });
});
