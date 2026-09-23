import { describe, expect, test } from "bun:test";
import { bassChromaticFaults } from "../../src/lib/bass-chromatic-check";
import { noteArray } from "../../src/resources/noteArray";
import type { VoiceNote } from "../../src/lib/types";

/**
 * The check generateChoralExercise runs over a finished exercise before
 * accepting it: every chromatic bass note approached by step from the last
 * sung note and left by step in its own direction. Synthetic lines, so each
 * case is exact.
 */

const n = (pitchValue: number, over: Partial<VoiceNote> = {}): VoiceNote => ({
  name: noteArray[pitchValue],
  degree: 0,
  pitchValue,
  length: 8,
  rest: false,
  order: 0,
  ...over,
});
const sharp = (p: number, over: Partial<VoiceNote> = {}) => n(p, { accidental: "sharp", ...over });
const flat = (p: number, over: Partial<VoiceNote> = {}) => n(p, { accidental: "flat", ...over });
const rest = (): VoiceNote => n(0, { rest: true, name: "z" });
const upper = (...ps: number[]) => ps.map((p) => n(p, { order: 1 }));

describe("bassChromaticFaults", () => {
  test("a raised note stepped onto and up off is clean", () => {
    expect(bassChromaticFaults([upper(25, 25, 25), [n(18), sharp(18), n(19)]])).toBe(0);
  });

  test("a lowered note stepped onto and down off is clean", () => {
    expect(bassChromaticFaults([[n(20), flat(20), n(19)]])).toBe(0);
  });

  test("a natural is read through wasRaised", () => {
    const raised = n(13, { accidental: "natural", wasRaised: true });
    const lowered = n(13, { accidental: "natural", wasRaised: false });
    expect(bassChromaticFaults([[n(13), raised, n(14)]])).toBe(0);
    expect(bassChromaticFaults([[n(13), raised, n(12)]])).toBe(1);
    expect(bassChromaticFaults([[n(13), lowered, n(12)]])).toBe(0);
  });

  test("a leap onto the accidental is a fault", () => {
    expect(bassChromaticFaults([[n(15), sharp(18), n(19)]])).toBe(1);
  });

  test("leaving it any way but its own step is a fault", () => {
    expect(bassChromaticFaults([[n(18), sharp(18), n(16)]])).toBe(1); // leap away
    expect(bassChromaticFaults([[n(18), sharp(18), n(17)]])).toBe(1); // step the wrong way
    expect(bassChromaticFaults([[n(15), sharp(18), n(16)]])).toBe(2); // both
  });

  test("repeats of the accidental are the note continuing", () => {
    expect(bassChromaticFaults([[n(18), sharp(18), sharp(18), sharp(18), n(19)]])).toBe(0);
  });

  test("a rest is looked across, to the last note sung", () => {
    expect(bassChromaticFaults([[n(18), rest(), sharp(18), n(19)]])).toBe(0);
    expect(bassChromaticFaults([[n(12), rest(), sharp(18), n(19)]])).toBe(1);
  });

  test("only the lowest voice is checked", () => {
    const badUpper = [n(12, { order: 2 }), sharp(18, { order: 2 }), n(12, { order: 2 })];
    expect(bassChromaticFaults([badUpper, [n(18), sharp(18), n(19)]])).toBe(0);
  });

  test("an accidental at either end of the line is judged on the side it has", () => {
    expect(bassChromaticFaults([[sharp(18), n(19)]])).toBe(0);
    expect(bassChromaticFaults([[sharp(18), n(16)]])).toBe(1);
    expect(bassChromaticFaults([[n(18), sharp(18)]])).toBe(0);
  });
});
