import { describe, expect, test } from "bun:test";
import {
  isLeap,
  leapRecoveryCost,
  LEAP_INTERVAL,
  UPPER_VOICE_RECOVERY,
} from "../../src/lib/leap-recovery";
import type { VoiceNote } from "../../src/lib/types";

/**
 * `pitchValue` is a DIATONIC index, and mistaking it for semitones is the single
 * most repeated bug in this generator - it would make this rule fire on 3rds and
 * ignore 5ths. That is what these first cases are for.
 */
const note = (pitchValue: number, rest = false): VoiceNote =>
  ({ name: "x", degree: 0, pitchValue, length: 8, rest } as VoiceNote);

describe("what counts as a leap", () => {
  test("a 4th and wider leaps; a 3rd and narrower does not", () => {
    expect(isLeap(20, 21)).toBe(false); // 2nd
    expect(isLeap(20, 22)).toBe(false); // 3rd - a skip, the ear follows it
    expect(isLeap(20, 23)).toBe(true); // 4th
    expect(isLeap(20, 24)).toBe(true); // 5th
    expect(isLeap(24, 20)).toBe(true); // and downwards
  });

  test("the threshold is a 4th, in diatonic steps not semitones", () => {
    expect(LEAP_INTERVAL).toBe(3);
  });
});

describe("what a leap owes", () => {
  const leaptTo = note(24); // arrived from 20: a 5th
  const before = note(20);

  test("a step or a repeat is free, anything wider is charged", () => {
    for (const pitch of [23, 24, 25]) {
      expect(leapRecoveryCost(pitch, leaptTo, before, UPPER_VOICE_RECOVERY)).toBe(0);
    }
    for (const pitch of [26, 27, 22, 21]) {
      expect(leapRecoveryCost(pitch, leaptTo, before, UPPER_VOICE_RECOVERY))
        .toBe(UPPER_VOICE_RECOVERY);
    }
  });

  test("nothing is owed when the voice did not leap", () => {
    // 20 -> 22 is a 3rd, so 22 -> 26 is free of this rule even though it is wide
    expect(leapRecoveryCost(26, note(22), note(20), UPPER_VOICE_RECOVERY)).toBe(0);
  });

  test("a rest on either side clears the debt", () => {
    // The voice has stopped singing; there is no leap left to recover from.
    expect(leapRecoveryCost(30, leaptTo, note(20, true), UPPER_VOICE_RECOVERY)).toBe(0);
    expect(leapRecoveryCost(30, note(24, true), before, UPPER_VOICE_RECOVERY)).toBe(0);
  });

  test("the opening of a phrase owes nothing", () => {
    expect(leapRecoveryCost(30, leaptTo, undefined, UPPER_VOICE_RECOVERY)).toBe(0);
    expect(leapRecoveryCost(30, undefined, before, UPPER_VOICE_RECOVERY)).toBe(0);
  });

  test("it is a weight, never a veto", () => {
    // The cost is finite, so a candidate that breaks the rule can still be
    // chosen when it is the only legal note. A filter here would instead leave
    // the step unsatisfiable, which is what becomes a failed exercise.
    expect(Number.isFinite(leapRecoveryCost(30, leaptTo, before, UPPER_VOICE_RECOVERY)))
      .toBe(true);
  });
});
