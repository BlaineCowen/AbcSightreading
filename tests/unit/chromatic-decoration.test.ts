import { describe, expect, test } from "bun:test";
import { generateNonChordTones } from "../../src/lib/non-chord-tone-gen";
import { nctPatterns } from "../../src/lib/nct-patterns";
import { noteArray } from "../../src/resources/noteArray";
import type { VoiceNote } from "../../src/lib/types";

/**
 * Decoration may not undo the step a chromatic note owes.
 *
 * The chord-tone search places every accidental with its approach and its
 * resolution in hand; the decoration pass then ran over the result without
 * looking. A lower neighbour on a leading tone, a passing tone falling away
 * from a raised note, an appoggiatura landing between a G# and the A it owed -
 * measured at UIL 5 in G, a third of the unresolved bass accidentals were one
 * of these. See breaksChromaticStep in non-chord-tone-gen.
 *
 * Decoration is asked for at probability 1 with the whole library open, so
 * every figure that could be tried is tried, and the tests assert never.
 */

const RUNS = 150;

const note = (pitchValue: number, length: number, over: Partial<VoiceNote> = {}): VoiceNote => ({
  name: noteArray[pitchValue],
  degree: 0,
  pitchValue,
  length,
  rest: false,
  order: 0,
  ...over,
});
const sharp = (pitchValue: number, length: number): VoiceNote =>
  note(pitchValue, length, { accidental: "sharp", name: "^" + noteArray[pitchValue] });

const run = (voice: VoiceNote[]) =>
  generateNonChordTones(voice, nctPatterns, [voice], 0, 1, "C", undefined, undefined, 32);
const many = (voice: VoiceNote[]) => Array.from({ length: RUNS }, () => run(voice));

/** Every change of pitch away from a sharp is a step up. */
const leavesEverySharpUpward = (out: VoiceNote[]) => {
  for (let k = 1; k < out.length; k++) {
    const a = out[k - 1];
    const b = out[k];
    if (a.accidental !== "sharp" || a.pitchValue === b.pitchValue) continue;
    if (b.pitchValue !== a.pitchValue + 1) return false;
  }
  return true;
};

describe("a decoration never undoes a chromatic note's step", () => {
  test("a raised note is left upward or not at all", () => {
    // G, G#, A: a half note G# that decoration could split into G# F# (lower
    // neighbour, passing tone down) - and must not.
    const outs = many([note(18, 8), sharp(18, 16), note(19, 8)]);
    expect(outs.some((o) => o.length > 3)).toBe(true); // it does decorate
    for (const out of outs) expect(leavesEverySharpUpward(out)).toBe(true);
  });

  test("nothing comes between an accidental and its resolution", () => {
    // G#, A, B: decorating the A must not start anywhere but on the A. An
    // appoggiatura from above (B A) or a suspension would put another note
    // between the G# and the A it owes.
    const outs = many([sharp(18, 8), note(19, 16), note(20, 8)]);
    for (const out of outs) expect(out[1].pitchValue).toBe(19);
  });

  test("an accidental is never reached by leap", () => {
    // A, A, G#: decorating the middle A may not end on a note more than a step
    // from the G# after it (an escape tone up to c, say).
    const outs = many([note(19, 8), note(19, 16), sharp(18, 8)]);
    for (const out of outs) {
      const last = out[out.length - 2];
      expect(Math.abs(last.pitchValue - 18)).toBeLessThanOrEqual(1);
    }
  });

  test("but a figure that only repeats the accidental is still allowed", () => {
    // The gate refuses the faults a figure ADDS, not ones already there: a G#
    // the search left unresolved (G# to C) is no worse sung as two quarters.
    // The rearticulation route only runs when the ordinary decoration roll
    // fails, so this asks at the usual rate with the type library emptied -
    // the same arrangement as rearticulation.test.ts.
    // F, G#, c - the note before differs in pitch, or the figure would be
    // refused as three of the same pitch in a row before the gate ever saw it.
    const voice = [note(17, 8), sharp(18, 16), note(21, 8)];
    const outs = Array.from({ length: RUNS }, () =>
      generateNonChordTones(voice, nctPatterns, [voice], 0, 0.25, "C", [], undefined, 32)
    );
    expect(
      outs.some((o) => o.length === 4 && o[1].pitchValue === 18 && o[2].pitchValue === 18)
    ).toBe(true);
  });
});
