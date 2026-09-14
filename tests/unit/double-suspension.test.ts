import { describe, expect, test } from "bun:test";
import { generateNonChordTones } from "../../src/lib/non-chord-tone-gen";
import { rhythms } from "../../src/resources/rhythms";
import { noteArray } from "../../src/resources/noteArray";
import type { VoiceNote } from "../../src/lib/types";

/**
 * Two voices suspending together.
 *
 * The figure the generator could not produce: both parts hold a note across the
 * chord change and resolve down a step in parallel, as at m15 of the
 * transcription where soprano A-flat to G and alto F to E-flat make a 9-8 and a
 * 4-3. It needs two things that did not exist - a partner's suspension has to be
 * mirrored AS a suspension rather than copied by contour, and a voice able to
 * complete one has to survive the probability roll that would normally skip it.
 *
 * These drive `generateNonChordTones` itself rather than the helpers, which are
 * private; the point is the figure coming out of the real entry point.
 *
 * `probability: 0` throughout, so `Math.random() >= probability` is always true
 * and nothing can be decorated by luck. Anything that appears got there because
 * it completes a suspension, which is exactly the claim under test.
 */

const PATTERNS = rhythms.filter((r) => r.pattern);

const note = (pitchValue: number, length: number, over: Partial<VoiceNote> = {}): VoiceNote => ({
  name: noteArray[pitchValue],
  degree: 0,
  pitchValue,
  length,
  rest: false,
  order: 0,
  ...over,
});

/**
 * A partner already suspending across `t = 8` to `t = 24`.
 *
 * Its note before the change is the same pitch as the held note - that is what
 * makes it a suspension and not just a repeat - and it then steps down.
 */
const suspendingPartner = (held = 21): VoiceNote[] => [
  note(held, 8),      // 0-8    the preparation
  note(held, 8),      // 8-16   held across the change
  note(held - 1, 8),  // 16-24  resolved down a step
  note(held - 1, 8),  // 24-32
];

/** A voice sitting a step above the chord tone it is about to sing. */
const readyToJoin = (myPitch: number, approach: number): VoiceNote[] => [
  note(approach, 8),   // 0-8    ends a step above what follows
  note(myPitch, 16),   // 8-24   spans the partner's whole figure
  note(myPitch, 8),    // 24-32
];

/** Run the pass over voice 1, with voice 0 as the partner. */
const decorate = (partner: VoiceNote[], mine: VoiceNote[]) =>
  generateNonChordTones(mine, PATTERNS, [partner, mine], 1, 0, "C", undefined, undefined, 32);

/** The notes the pass produced in place of `mine[1]`. */
const figure = (out: VoiceNote[]) => out.slice(1, out.length - 1);

describe("a voice joins a partner's suspension", () => {
  // Held a 6th apart: partner holds 21, this voice holds 16.
  const PARTNER = suspendingPartner(21);

  test("the note is split into a held note and a resolution", () => {
    const out = decorate(PARTNER, readyToJoin(15, 16));
    expect(out.length).toBe(4); // the middle note became two
    const [held, resolution] = figure(out);
    expect(held.length).toBe(8);
    expect(resolution.length).toBe(8);
  });

  test("the held note is this voice's OWN previous note, not its chord tone", () => {
    // The whole difference between a suspension and a copied contour. Holding
    // the chord tone reproduces the rhythm and the step down while suspending
    // nothing, because nothing was held over.
    const out = decorate(PARTNER, readyToJoin(15, 16));
    const [held, resolution] = figure(out);
    expect(held.pitchValue).toBe(16);  // the approach note, held over
    expect(resolution.pitchValue).toBe(15); // resolved onto the chord tone
  });

  test("the two voices resolve in parallel, a step down each", () => {
    const out = decorate(PARTNER, readyToJoin(15, 16));
    const [held, resolution] = figure(out);
    expect(held.pitchValue - resolution.pitchValue).toBe(1);
    expect(PARTNER[1].pitchValue - PARTNER[2].pitchValue).toBe(1);
  });

  test("the held pair is a third or a sixth apart, not a second or a seventh", () => {
    const out = decorate(PARTNER, readyToJoin(15, 16));
    const [held] = figure(out);
    expect(Math.abs(held.pitchValue - PARTNER[1].pitchValue) % 7).toBe(5);
  });

  test("it happens despite a zero probability of decorating", () => {
    // Every precondition is common enough alone, but the conjunction is not:
    // waiting for both voices to pass their own roll on the same beat left the
    // figure at about one exercise in twenty-five.
    const out = decorate(PARTNER, readyToJoin(15, 16));
    expect(out.length).toBeGreaterThan(3);
  });
});

describe("and does not when the figure would be wrong", () => {
  const PARTNER = suspendingPartner(21);

  test("nothing happens when this voice has no note to hold over", () => {
    // Its previous note is a third below, not a step above: there is nothing
    // sitting where a suspension would have to start.
    const out = decorate(PARTNER, readyToJoin(15, 13));
    expect(out.length).toBe(3);
    expect(out[1].length).toBe(16);
  });

  test("nothing happens when the held pair would be a dissonance", () => {
    // A 7th between the two held notes. The figure only works when the voices
    // suspend into a consonance with each other.
    const out = decorate(PARTNER, readyToJoin(14, 15));
    expect(out.length).toBe(3);
  });

  test("nothing happens when the partner is repeating rather than suspending", () => {
    // Same two notes in the partner, but nothing held over into them: its
    // previous note is a different pitch, so there is no suspension to join.
    const repeating = suspendingPartner(21);
    repeating[0] = note(18, 8);
    const out = decorate(repeating, readyToJoin(15, 16));
    expect(out.length).toBe(3);
  });

  test("nothing happens when the partner steps UP instead of resolving down", () => {
    const rising = suspendingPartner(21);
    rising[2] = note(22, 8);
    const out = decorate(rising, readyToJoin(15, 16));
    expect(out.length).toBe(3);
  });

  test("a rest in the partner is not a suspension", () => {
    const resting = suspendingPartner(21);
    resting[1] = { ...resting[1], rest: true };
    const out = decorate(resting, readyToJoin(15, 16));
    expect(out.length).toBe(3);
  });
});

/**
 * The mirroring itself, reached with decoration certain rather than forbidden.
 *
 * The block above forbids decoration (`probability: 0`), so the only way in is
 * the gate - which means it never reaches the mirroring code and cannot test
 * it. Breaking any guard inside `tryParallelDecoration` left those tests green.
 * Here decoration always fires, so the mirroring is reached on its own account
 * and each of its conditions can be shown to matter.
 *
 * Decoration that is not mirrored falls through to an ordinary independent
 * figure, so these assert the SHAPE rather than that nothing happened: a
 * suspension starts on the singer's own previous note, and an ordinary figure
 * starts on the chord tone. Repeated because that fallback is random.
 */
const decorateAlways = (partner: VoiceNote[], mine: VoiceNote[]) =>
  generateNonChordTones(mine, PATTERNS, [partner, mine], 1, 1, "C", undefined, undefined, 32);

/** Did the pass hold `approach` over and then resolve onto `myPitch`? */
const heldOver = (out: VoiceNote[], approach: number, myPitch: number) => {
  const fig = figure(out);
  return fig.length === 2 && fig[0].pitchValue === approach && fig[1].pitchValue === myPitch;
};

/** True if any of 40 runs produced that hold - the fallback is random. */
const everHeldOver = (partner: VoiceNote[], myPitch: number, approach: number) =>
  Array.from({ length: 40 }, () => decorateAlways(partner, readyToJoin(myPitch, approach)))
    .some((out) => heldOver(out, approach, myPitch));

describe("mirroring a partner's suspension", () => {
  test("holds this voice's previous note over, every time", () => {
    const out = decorateAlways(suspendingPartner(21), readyToJoin(15, 16));
    expect(heldOver(out, 16, 15)).toBe(true);
  });

  test("refuses when this voice's previous note is not a step above", () => {
    // 19 rather than 16: a THIRD above the chord tone, not a step. Deliberately
    // a pitch that is still a consonant third from the partner's held note, so
    // this fails on the step rule alone - approaching from 13 would be thrown
    // out by the interval check first and prove nothing about this one.
    expect(everHeldOver(suspendingPartner(21), 15, 19)).toBe(false);
  });

  test("refuses when the two held notes would be a dissonance", () => {
    // A 7th between the held notes rather than a 3rd or a 6th.
    expect(everHeldOver(suspendingPartner(21), 14, 15)).toBe(false);
  });

  test("refuses when the partner never held anything over", () => {
    const repeating = suspendingPartner(21);
    repeating[0] = note(18, 8);
    expect(everHeldOver(repeating, 15, 16)).toBe(false);
  });

  test("refuses when the partner rises instead of resolving down", () => {
    const rising = suspendingPartner(21);
    rising[2] = note(22, 8);
    expect(everHeldOver(rising, 15, 16)).toBe(false);
  });

  test("refuses when the partner's held note is a rest", () => {
    const resting = suspendingPartner(21);
    resting[1] = { ...resting[1], rest: true };
    expect(everHeldOver(resting, 15, 16)).toBe(false);
  });

  test("refuses a partner figure that is not two notes, and keeps the bar full", () => {
    // A three-note partner is not a suspension to mirror, and mirroring the
    // first two of it would replace a half note with two eighths - a measure
    // that no longer adds up, which renders without complaint and is wrong.
    const threeNotes: VoiceNote[] = [
      note(21, 8),      // 0-8    preparation
      note(21, 8),      // 8-16   held
      note(20, 4),      // 16-20
      note(19, 4),      // 20-24
      note(19, 8),      // 24-32
    ];
    for (let i = 0; i < 40; i++) {
      const out = decorateAlways(threeNotes, readyToJoin(15, 16));
      expect(out.reduce((n, x) => n + x.length, 0)).toBe(32);
      expect(heldOver(out, 16, 15)).toBe(false);
    }
  });

  test("refuses when the partner's preparation is a rest", () => {
    // Silence cannot be held over. Separate from the case above because a rest
    // in the held note is caught earlier, by the check that every note being
    // mirrored actually sounds - so that test says nothing about this rule.
    const resting = suspendingPartner(21);
    resting[0] = { ...resting[0], rest: true };
    expect(everHeldOver(resting, 15, 16)).toBe(false);
  });
});
