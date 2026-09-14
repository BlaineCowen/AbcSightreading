import { describe, expect, test } from "bun:test";
import { generateNonChordTones } from "../../src/lib/non-chord-tone-gen";
import { nctPatterns } from "../../src/lib/nct-patterns";
import { noteArray } from "../../src/resources/noteArray";
import type { VoiceNote } from "../../src/lib/types";

/**
 * A half note sung as two quarters on the same pitch.
 *
 * Not a non-chord tone - nothing is dissonant and nothing resolves - but this
 * is the pass that subdivides notes, so it is where the figure lives. The
 * generator could not write it at all: over 40 exercises, half notes became two
 * quarters 4.5% of the time and the two were a different pitch on every one.
 *
 * `probability: 0` throughout, so the ordinary decoration roll always fails and
 * anything that appears came through the rearticulation route on its own.
 * The route rolls its own dice, so these repeat and assert ever/never.
 */

const RUNS = 80;

const note = (pitchValue: number, length: number, over: Partial<VoiceNote> = {}): VoiceNote => ({
  name: noteArray[pitchValue],
  degree: 0,
  pitchValue,
  length,
  rest: false,
  order: 0,
  ...over,
});

/** A line whose middle note is the one under test. */
const line = (middle: VoiceNote, before = note(18, 8), after = note(19, 8)) =>
  [before, middle, after];

/**
 * Decoration on at its usual rate, but with the type library emptied.
 *
 * `enabledNctTypes: []` leaves nothing for the ordinary route to choose, while
 * the rearticulation route does not consult that library at all - so anything
 * that appears below got there as a rearticulation and nothing else can muddy
 * the count. Turning the probability to 0 would be simpler but tests the wrong
 * thing: that is the director asking for plain chord tones, and the figure is
 * required NOT to fire there. See the last test in this file.
 */
const run = (voice: VoiceNote[]) =>
  generateNonChordTones(voice, nctPatterns, [voice], 0, 0.25, "C", [], undefined, 32);

/** Every result over many runs, since the route rolls its own dice. */
const many = (voice: VoiceNote[]) => Array.from({ length: RUNS }, () => run(voice));

/** Was the middle note split into two quarters on its own pitch? */
const rearticulated = (out: VoiceNote[], pitch: number) =>
  out.length === 4 &&
  out[1].length === 8 &&
  out[2].length === 8 &&
  out[1].pitchValue === pitch &&
  out[2].pitchValue === pitch;

describe("a half note may be sung as two quarters", () => {
  test("it happens, though nothing is being decorated", () => {
    const outs = many(line(note(21, 16)));
    expect(outs.some((o) => rearticulated(o, 21))).toBe(true);
  });

  test("and does not happen every time - it is a choice, not a rewrite", () => {
    const outs = many(line(note(21, 16)));
    expect(outs.some((o) => o.length === 3)).toBe(true);
  });

  test("both quarters are the SAME pitch", () => {
    // The whole point. Every existing route through this pass had to carry a
    // decoration, so a half note could only ever split into two DIFFERENT
    // pitches - which is why this figure was at absolute zero.
    for (const out of many(line(note(21, 16)))) {
      if (out.length === 4) expect(out[1].pitchValue).toBe(out[2].pitchValue);
    }
  });

  test("the two quarters fill exactly the half note", () => {
    for (const out of many(line(note(21, 16)))) {
      expect(out.reduce((n, x) => n + x.length, 0)).toBe(32);
    }
  });

  test("an accidental is carried onto both halves of it", () => {
    // Re-striking a pitch must not re-spell it: B-flat then B natural on two
    // consecutive quarters asks the singer to correct a note that was right.
    const outs = many(line(note(21, 16, { accidental: "flat", name: "_B" })));
    const split = outs.find((o) => o.length === 4);
    expect(split).toBeDefined();
    expect(split![1].accidental).toBe("flat");
    expect(split![2].accidental).toBe("flat");
  });
});

describe("and may not, when it would not be that figure", () => {
  test("a quarter note is left alone - this is not a stutter generator", () => {
    const outs = many(line(note(21, 8)));
    expect(outs.every((o) => o.length === 3)).toBe(true);
  });

  test("a whole note is left alone - two halves is a different gesture", () => {
    const outs = many(line(note(21, 32)));
    expect(outs.every((o) => o.length === 3)).toBe(true);
  });

  test("not when the note before is already the same pitch", () => {
    // Three of the same pitch in a row reads as a stuck singer.
    const outs = many(line(note(21, 16), note(21, 8), note(19, 8)));
    expect(outs.every((o) => !rearticulated(o, 21))).toBe(true);
  });

  test("not when the note after is already the same pitch", () => {
    const outs = many(line(note(21, 16), note(18, 8), note(21, 8)));
    expect(outs.every((o) => !rearticulated(o, 21))).toBe(true);
  });

  test("a rest is not rearticulated", () => {
    const outs = many(line(note(21, 16, { rest: true })));
    expect(outs.every((o) => o.length === 3)).toBe(true);
  });

  test("not at a cadence, where the long note is the point", () => {
    const outs = many(line(note(21, 16, { isCadenceEnd: true })));
    expect(outs.every((o) => o.length === 3)).toBe(true);
  });

  test("not when the level decorates no faster than a half note", () => {
    // The vocabulary is filtered by the level's shortest note, so a level with
    // no quarters offers no quarter-quarter pattern to rearticulate into.
    const halvesOnly = nctPatterns.filter((p) => p.name === "nctHalfHalf");
    const voice = line(note(21, 16));
    for (let i = 0; i < RUNS; i++) {
      const out = generateNonChordTones(voice, halvesOnly, [voice], 0, 0.25, "C", [], undefined, 32);
      expect(out.length).toBe(3);
    }
  });
});

/**
 * The other way in.
 *
 * `tryRearticulation` hands the figure the even pattern itself, so the shape
 * check inside it never fires on that route. But the type also competes in the
 * ordinary library draw, where the pattern is chosen for it and any shape of
 * the right total length is on offer - a dotted quarter plus an eighth fills a
 * half note just as well. There it is the check that keeps the figure even.
 */
describe("chosen from the library rather than offered", () => {
  const HALF_LENGTH = nctPatterns.filter((p) => p.totalValue === 16);

  const onlyRearticulation = (voice: VoiceNote[]) =>
    generateNonChordTones(
      voice, HALF_LENGTH, [voice], 0, 1, "C", ["Rearticulation"], undefined, 32
    );

  test("the half note is still split into two EQUAL quarters", () => {
    // Not 12 + 4: re-striking a pitch unevenly is a dotted rhythm, which is a
    // different thing from singing the note twice.
    expect(HALF_LENGTH.some((p) => p.name === "nctDotQuarterEighth")).toBe(true);
    for (let i = 0; i < RUNS; i++) {
      const out = onlyRearticulation(line(note(21, 16)));
      if (out.length === 4) {
        expect(out[1].length).toBe(8);
        expect(out[2].length).toBe(8);
      }
    }
  });
});

describe("decoration turned off means plain chord tones", () => {
  test("nothing is rearticulated at a probability of zero", () => {
    // It is not decoration, but it is still something this pass ADDS, and the
    // setting that turns the pass down is the only control a director has over
    // how busy the surface is. Firing at a flat rate regardless made every
    // exercise busier than asked - including the ones generated with decoration
    // off entirely, where one bass note is supposed to be one chord position.
    const voice = line(note(21, 16));
    for (let i = 0; i < RUNS; i++) {
      const out = generateNonChordTones(voice, nctPatterns, [voice], 0, 0, "C", [], undefined, 32);
      expect(out.length).toBe(3);
    }
  });

  test("and it follows the setting rather than ignoring it", () => {
    // Twice the decoration rate, so turning decoration down turns this down.
    const voice = line(note(21, 16));
    const rate = (probability: number) =>
      Array.from({ length: 400 }, () =>
        generateNonChordTones(voice, nctPatterns, [voice], 0, probability, "C", [], undefined, 32)
      ).filter((o) => o.length === 4).length / 400;
    expect(rate(0.5)).toBeGreaterThan(rate(0.1));
  });
});
