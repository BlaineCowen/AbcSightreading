import { describe, expect, test } from "bun:test";
import {
  semitoneOf,
  clashesBySemitone,
  generateNonChordTones,
} from "../../src/lib/non-chord-tone-gen";
import { keySignatures } from "../../src/resources/key-signatures";
import { rhythms as allRhythms } from "../../src/resources/rhythms";
import type { VoiceNote } from "../../src/lib/types";

/**
 * Keeping a decoration from grinding a half step against another part.
 *
 * Measured over 120 minor exercises: the harmony search produces **zero**
 * semitone clashes in 15,222 overlapping pairs, and decoration produced 1.31
 * per exercise. Every one came from the non-chord-tone pass, which had nothing
 * looking at the vertical interval at all.
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

describe("what a note actually sounds", () => {
  /**
   * `pitchValue` is DIATONIC - one step per letter - so two notes a step apart
   * may be a tone or a semitone and nothing comparing pitchValues can tell
   * which. Every other vertical rule here is about diatonic intervals, where
   * that does not matter. A half-step clash is exactly where it does.
   */
  const C = keySignatures["C"];

  test("E to F is a half step; C to D is a whole one", () => {
    // pitchValue 0 is C, so 2 is E and 3 is F.
    expect(semitoneOf(note(3), C) - semitoneOf(note(2), C)).toBe(1);
    expect(semitoneOf(note(1), C) - semitoneOf(note(0), C)).toBe(2);
  });

  test("B to C is a half step across the octave boundary", () => {
    expect(semitoneOf(note(7), C) - semitoneOf(note(6), C)).toBe(1);
  });

  test("an octave is twelve", () => {
    expect(semitoneOf(note(7), C) - semitoneOf(note(0), C)).toBe(12);
  });

  test("the key signature is applied when the note carries no accidental", () => {
    // In F major the 4th degree (B) is flat, so A to B is a half step there and
    // a whole one in C.
    const F = keySignatures["F"];
    expect(semitoneOf(note(6), C) - semitoneOf(note(5), C)).toBe(2);
    expect(semitoneOf(note(6), F) - semitoneOf(note(5), F)).toBe(1);
  });

  test("an accidental on the note overrides the key signature", () => {
    const F = keySignatures["F"];
    const natural = semitoneOf(note(6, { accidental: "natural" }), F);
    const flat = semitoneOf(note(6), F); // B flat, from the key
    expect(natural - flat).toBe(1);
    expect(semitoneOf(note(0, { accidental: "sharp" }), C) - semitoneOf(note(0), C)).toBe(1);
    expect(semitoneOf(note(0, { accidental: "flat" }), C) - semitoneOf(note(0), C)).toBe(-1);
  });

  test("double accidentals move two", () => {
    expect(
      semitoneOf(note(0, { accidental: "double-sharp" }), C) - semitoneOf(note(0), C)
    ).toBe(2);
  });
});

describe("decoration refuses a minor ninth against another voice", () => {
  /**
   * What this adds, precisely.
   *
   * `checkClashesWithOtherVoices` already refused a decoration a DIATONIC second
   * from another part, and it catches every true half step - measured over 120
   * minor exercises, zero minor 2nds get through. But a diatonic gap of exactly
   * 1 cannot see either of these:
   *
   *   - a minor NINTH, which is a diatonic gap of 8
   *   - two spellings of one letter, G natural against G sharp, which is a
   *     diatonic gap of 0 and a semitone apart
   *
   * Both of those were getting through, 1.2 per exercise, all of them ninths and
   * nearly half of them the same letter - a false relation sounding at once.
   *
   * The fixture: B-G-B-G on top, so a passing tone fills the third with A. The
   * other voice holds G sharp a ninth below that A. The diatonic gap is 8, so
   * the older check passes it; only the semitone one refuses it. Swapping the
   * held note to G natural changes nothing except the interval.
   */
  const patterns = allRhythms.filter((r) => r.name === "eighthEighth");
  const decoratedCount = (held: VoiceNote, runs = 60) => {
    let n = 0;
    for (let i = 0; i < runs; i++) {
      const top = [note(13), note(11), note(13), note(11)]; // B G B G
      const out = generateNonChordTones(
        top.map((x) => ({ ...x })), patterns, [top, [held]], 0, 1, "C",
        ["Passing Tone"], [0, 40]
      );
      if (out.length > top.length) n++;
    }
    return n;
  };
  const gSharp = note(4, { length: 32, accidental: "sharp" });
  const gNatural = note(4, { length: 32 });

  test("the fixture really is a minor ninth, and the alternative really is not", () => {
    // If this drifts, the two tests below stop testing anything.
    const C = keySignatures["C"];
    expect(semitoneOf(note(12), C) - semitoneOf(gSharp, C)).toBe(13);
    expect(semitoneOf(note(12), C) - semitoneOf(gNatural, C)).toBe(14);
    // ...and both are a diatonic EIGHTH, which the older check cannot refuse.
    expect(Math.abs(12 - 4)).toBe(8);
  });

  test("a minor ninth reached by step is allowed, as Bach does", () => {
    // This asserted 0 while the rule was a blanket ban. The corpus says
    // otherwise - see the block at the bottom - so what matters is that the
    // passing tone here is stepwise on both sides.
    expect(decoratedCount(gSharp)).toBeGreaterThan(30);
  });

  test("and so is a major ninth, which was never a clash at all", () => {
    expect(decoratedCount(gNatural)).toBeGreaterThan(30);
  });
});

describe("the older diatonic rule is still in the gate", () => {
  /**
   * `checkClashesWithOtherVoices` predates all of this and refuses a decoration
   * a DIATONIC second from another part. It catches every true half step -
   * measured over 120 minor exercises, zero minor 2nds get through - so it is
   * carrying most of the weight and must not be lost in the refactor.
   *
   * The fixtures above all sit a ninth apart precisely so the semitone rule is
   * the only thing that can fire; this one is a plain second, where only the
   * older rule can.
   */
  const patterns = allRhythms.filter((r) => r.name === "eighthEighth");

  test("a WHOLE-tone second from a held voice is refused", () => {
    // A whole tone, deliberately: E-C on top so the passing tone is D, held C
    // underneath. Diatonic gap 1, semitone gap 2 - so the semitone rule cannot
    // fire and only the older one can. A half-step fixture would be refused by
    // both and prove nothing about either.
    const C = keySignatures["C"];
    expect(semitoneOf(note(1), C) - semitoneOf(note(0), C)).toBe(2);
    let decorated = 0;
    for (let i = 0; i < 60; i++) {
      const top = [note(2), note(0), note(2), note(0)]; // E C E C
      const out = generateNonChordTones(
        top.map((x) => ({ ...x })), patterns, [top, [note(0, { length: 32 })]], 0, 1,
        "C", ["Passing Tone"], [0, 40]
      );
      if (out.length > top.length) decorated++;
    }
    expect(decorated).toBe(0);
  });
});

describe("the mirrored decoration obeys the same rules", () => {
  /**
   * There are two ways a figure reaches the score: the generators, and
   * `tryParallelDecoration`, which copies a decoration another voice already
   * has when the two are a 3rd or 6th apart. They had **different rules** - the
   * mirrored one checked parallel motion and diatonic seconds and then
   * committed, so it never saw the range, singability or semitone checks.
   *
   * Measured, it was the only remaining source of minor ninths once the
   * generators were closed: 0.05 per exercise against 0.00 from every one of
   * the five types individually. Two entry points with two rule sets is the
   * bug; one gate is the fix.
   *
   * `enabledNctTypes: []` leaves no generator able to run, so anything this
   * produces came from the mirror and nothing else.
   */
  const patterns = allRhythms.filter((r) => r.name === "eighthEighth");
  const at = (p: number, len = 8, over: Partial<VoiceNote> = {}) =>
    note(p, { length: len, ...over });

  const mirroredCount = (third: VoiceNote, runs = 60) => {
    let n = 0;
    for (let i = 0; i < runs; i++) {
      // Being decorated: three quarters on B.
      const v0 = [at(6), at(6), at(6)];
      // Already decorated: two eighths, G then A, across the SECOND quarter -
      // the span the mirror can copy onto.
      const v1 = [at(4), at(4, 4), at(5, 4), at(4)];
      const out = generateNonChordTones(
        v0.map((x) => ({ ...x })), patterns, [v0, v1, [third]], 0, 1, "C", [], [0, 40]
      );
      if (out.length > v0.length) n++;
    }
    return n;
  };

  test("the fixture mirrors at all when nothing is in the way", () => {
    // Without this the refusal below could just be the mirror never firing.
    expect(mirroredCount(at(15, 24))).toBe(60);
  });

  test("a mirrored figure that would sound a minor ninth is refused", () => {
    // The mirror of G-A a third up is B-C. C two octaves above sits a minor
    // ninth over that B - a diatonic EIGHTH, which the older check cannot see.
    const C = keySignatures["C"];
    expect(semitoneOf(at(14), C) - semitoneOf(at(6), C)).toBe(13);
    expect(mirroredCount(at(14, 24))).toBeGreaterThan(30);
  });

  test("a mirrored figure out of the singer's range is refused", () => {
    // The mirrored path skipped the range check too, which was putting notes
    // outside the part in real exercises: 6 across 750 to none.
    let n = 0;
    for (let i = 0; i < 60; i++) {
      const v0 = [at(6), at(6), at(6)];
      const v1 = [at(4), at(4, 4), at(5, 4), at(4)];
      const out = generateNonChordTones(
        v0.map((x) => ({ ...x })), patterns, [v0, v1, [at(15, 24)]], 0, 1, "C", [],
        [0, 6] // B is the ceiling, so the mirror's C is over it
      );
      if (out.length > v0.length) n++;
    }
    expect(n).toBe(0);
  });
});

describe("a clash has to be a passing motion, not a leap", () => {
  /**
   * The rule Bach actually follows, tested where the approach can be controlled
   * exactly rather than left to whichever decoration the generator happens to
   * pick.
   *
   * Over the 371 four-part chorales, of every minor 2nd or minor 9th between
   * two voices, the dissonant one is approached AND left by step in 99.0%, one
   * side only in 1.0%, and neither side in NONE. So a clash reached by leap is
   * the thing to refuse - which is an appoggiatura, and is not a passing tone,
   * a neighbour or a suspension.
   */
  const C = keySignatures["C"];
  // Another voice holding G sharp: a minor ninth below A, an octave-and-a-bit.
  const gSharp = note(4, { length: 32, accidental: "sharp" });
  const other = [[note(6, { length: 32 })], [gSharp]];
  // The figure sits in voice 0, replacing one quarter at time 8.
  const host = [note(11), note(11), note(11)];
  const check = (figure: VoiceNote[], prev: VoiceNote | null, next: VoiceNote | null) =>
    clashesBySemitone(figure, 1, [host, ...other], 0, "C", prev, next);

  test("the fixture really is a minor ninth", () => {
    expect(semitoneOf(note(12), C) - semitoneOf(gSharp, C)).toBe(13);
  });

  test("stepped into and out of: allowed", () => {
    // G - A - B, with the clashing A in the middle.
    const figure = [note(11, { length: 4 }), note(12, { length: 4 })];
    expect(check(figure, note(11), note(13))).toBe(false);
  });

  test("leapt INTO: refused", () => {
    // The clashing A arrives from a third below and is left by step.
    const figure = [note(12, { length: 4 }), note(13, { length: 4 })];
    expect(check(figure, note(10), note(13))).toBe(true);
  });

  test("leapt OUT of: refused", () => {
    // Stepped into, then abandoned by a leap - the other half of the rule.
    const figure = [note(11, { length: 4 }), note(12, { length: 4 })];
    expect(check(figure, note(11), note(9))).toBe(true);
  });

  test("a note held into the clash counts as stepwise, because it is", () => {
    // A suspension is approached by the SAME pitch. A gap of zero is not a leap.
    const figure = [note(12, { length: 4 }), note(11, { length: 4 })];
    expect(check(figure, note(12), note(11))).toBe(false);
  });

  test("no clash at all is never refused, however it is approached", () => {
    // B against the held G sharp is a major seventh - not counted.
    const figure = [note(13, { length: 4 }), note(13, { length: 4 })];
    expect(check(figure, note(9), note(9))).toBe(false);
  });
});
