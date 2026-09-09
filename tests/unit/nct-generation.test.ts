import { describe, expect, test } from "bun:test";
import { generateNonChordTones } from "../../src/lib/non-chord-tone-gen";
import { nctPatterns, nctPatternsFor } from "../../src/lib/nct-patterns";
import type { VoiceNote } from "../../src/lib/types";

/**
 * A decoration replaces one chord tone with several notes filling the same span.
 * These properties are quiet when broken: the exercise still renders, the bars
 * still add up, and the only symptom is that it sounds wrong - which is exactly
 * the kind of thing that went unnoticed here for a long time.
 */

function note(pitchValue: number, length: number): VoiceNote {
  return {
    name: "x",
    degree: 1,
    pitchValue,
    length,
    rest: false,
  } as VoiceNote;
}

/** Groups the output back into the original note it replaced, by duration. */
function decorationsOf(
  input: VoiceNote[],
  output: VoiceNote[]
): { original: VoiceNote; group: VoiceNote[] }[] {
  const groups: { original: VoiceNote; group: VoiceNote[] }[] = [];
  let k = 0;
  for (const original of input) {
    let span = 0;
    const group: VoiceNote[] = [];
    while (k < output.length && span < original.length) {
      span += output[k].length;
      group.push(output[k]);
      k++;
    }
    expect(span).toBe(original.length); // decoration must preserve duration
    if (group.length > 1) groups.push({ original, group });
  }
  expect(k).toBe(output.length);
  return groups;
}

/** probability 1, single voice, so no cross-voice guard interferes. */
function decorate(input: VoiceNote[], patterns = nctPatterns) {
  const output = generateNonChordTones(input, patterns, [input], 0, 1, "C");
  return { output, decorations: decorationsOf(input, output) };
}

describe("non-chord tone generation", () => {
  test("a decoration never emits the same pitch twice", () => {
    // The bug this pins: an anticipation on a *repeated* note set note1 to the
    // current pitch and note2 to the next pitch - which was the same pitch. That
    // is not a non-chord tone at all, just a note chopped in half, and it was
    // about a third of everything the generator produced.
    const repeated = Array.from({ length: 24 }, () => note(20, 16));
    const { decorations } = decorate(repeated);
    expect(decorations.length).toBeGreaterThan(0);
    for (const { group } of decorations) {
      const pitches = new Set(group.map((n) => n.pitchValue));
      expect(pitches.size).toBeGreaterThan(1);
    }
  });

  test("on a repeated note the decoration steps away and returns", () => {
    // Only a neighbour tone fits a repeated note, and a neighbour is a step.
    const repeated = Array.from({ length: 24 }, () => note(20, 16));
    const { decorations } = decorate(repeated);
    for (const { group } of decorations) {
      expect(group[0].pitchValue).toBe(20);
      expect(Math.abs(group[1].pitchValue - 20)).toBe(1);
    }
  });

  test("a passing figure across a leap is filled completely, never partly", () => {
    // Diatonic indices: 3 is a 4th. The generator used to insert exactly one
    // step and leave the rest of the gap, which reads as an arbitrary leap. It
    // now takes one note per step, so a 4th needs a three-note pattern - and a
    // partial fill must never appear.
    const leaping: VoiceNote[] = [];
    for (let i = 0; i < 24; i++) leaping.push(note(i % 2 === 0 ? 20 : 23, 16));
    const { decorations } = decorate(leaping);
    expect(decorations.length).toBeGreaterThan(0);

    let filled = 0;
    for (const { original, group } of decorations) {
      const startsOnChordTone = group[0].pitchValue === original.pitchValue;
      const movesTowardNext =
        group.length > 1 &&
        Math.abs(group[1].pitchValue - original.pitchValue) === 1;
      if (!startsOnChordTone || !movesTowardNext) {
        // an appoggiatura: leaves the chord tone and returns to it
        expect(group[group.length - 1].pitchValue).toBe(original.pitchValue);
        continue;
      }
      // a passing figure: consecutive steps, stopping one step short of the
      // note it is travelling to, so nothing of the gap is left unfilled
      const direction = Math.sign(group[1].pitchValue - group[0].pitchValue);
      for (let k = 0; k < group.length; k++) {
        expect(group[k].pitchValue).toBe(original.pitchValue + direction * k);
      }
      expect(group.length).toBe(3); // the gap here is a 4th
      filled++;
    }
    expect(filled).toBeGreaterThan(0);
  });

  test("a suspension holds the previous pitch and resolves down a step", () => {
    // A descending stepwise line is exactly where a suspension belongs: hold the
    // pitch from the chord before into this one, where it is now dissonant, then
    // fall a step onto the chord tone. Before this existed, a descending step
    // could only ever be decorated as an anticipation.
    const descending: VoiceNote[] = [];
    for (let i = 0; i < 24; i++) descending.push(note(40 - i, 16));
    const { decorations } = decorate(descending);
    expect(decorations.length).toBeGreaterThan(0);

    let suspensions = 0;
    for (const { original, group } of decorations) {
      expect(group.length).toBe(2);
      // Whatever type was chosen, the figure must still land on its chord tone
      // or be a legitimate neighbour/anticipation shape - but on this line the
      // suspension should be well represented.
      if (
        group[0].pitchValue === original.pitchValue + 1 &&
        group[1].pitchValue === original.pitchValue
      ) {
        suspensions++;
        // the dissonance is the accented half, never the shorter one
        expect(group[0].length).toBeGreaterThanOrEqual(group[1].length);
      }
    }
    expect(suspensions).toBeGreaterThan(0);
  });

  test("a suspension is refused when the pattern would accent the resolution", () => {
    // Short-then-long puts the dissonance on the offbeat and the resolution on
    // the accent, which is backwards - it is no longer a suspension. No pattern
    // in the library is that shape today, so this passes a synthetic one; item 5
    // adds an eighth + dotted quarter, which is exactly it.
    const reversed = [
      {
        name: "reversedForTest",
        abcValue: ["4", "12"],
        meterValue: [1 / 8, 3 / 8],
        totalValue: 16,
        rest: false,
        oddsWeight: 1,
        maxRng: 0,
        pattern: true,
        symbol: "x",
        weight: 1,
      },
    ] as any;
    const descending: VoiceNote[] = [];
    for (let i = 0; i < 24; i++) descending.push(note(40 - i, 16));
    const { decorations } = decorate(descending, reversed);
    for (const { original, group } of decorations) {
      const isSuspension =
        group[0].pitchValue === original.pitchValue + 1 &&
        group[1].pitchValue === original.pitchValue;
      expect(isSuspension).toBe(false);
    }
  });

  describe("parallel decoration", () => {
    /** voice 0 already decorated across the second half note; voice 1 has not. */
    function twoVoices(myPitch: number) {
      const decorated = [note(30, 16), note(32, 8), note(33, 8)];
      const plain = [note(myPitch - 2, 16), note(myPitch, 16)];
      return { decorated, plain };
    }

    test("mirrors an already-decorated voice a 3rd away, by contour", () => {
      // The idiom this adds: two voices moving together in parallel 3rds. It was
      // impossible while every voice was handed the others' undecorated lines -
      // there was nothing to mirror.
      const { decorated, plain } = twoVoices(30);
      const out = generateNonChordTones(plain, nctPatterns, [decorated, plain], 1, 1, "C");
      expect(out.length).toBe(3);
      expect(out[0].pitchValue).toBe(28); // untouched
      // same rhythm and the same sequence of steps as the voice it joins
      expect(out[1].length).toBe(8);
      expect(out[2].length).toBe(8);
      expect(out[2].pitchValue - out[1].pitchValue).toBe(33 - 32);
      // and it stays a 3rd below throughout
      expect(32 - out[1].pitchValue).toBe(2);
      expect(33 - out[2].pitchValue).toBe(2);
    });

    test("only 3rds and 6ths mirror - not a 4th", () => {
      // A 4th is the interval that isolates this rule: mirroring at a 5th or an
      // octave is already stopped by the parallel-5ths guard, so it proves
      // nothing, but nothing else stops parallel 4ths.
      const decorated = [note(30, 16), note(32, 8), note(33, 8)];
      const plain = [note(27, 16), note(29, 16)]; // 32 - 29 = 3, a 4th
      const out = generateNonChordTones(plain, nctPatterns, [decorated, plain], 1, 1, "C");
      const isMirror =
        out.length === 3 &&
        out[1].pitchValue === 29 &&
        out[1].length === 8 &&
        out[2].pitchValue - out[1].pitchValue === 1;
      expect(isMirror).toBe(false);
    });

    test("a third voice does not join - parallel motion stays a pair", () => {
      // Unchecked, the third voice mirrors one of the first two and the fourth
      // mirrors it too, and the whole texture moves in lockstep.
      //
      // Spaced in 6ths on purpose: stacking 3rds puts a 5th between the outer
      // voices, so the parallel-5ths guard would reject the cascade for its own
      // reasons and the cap would never be exercised.
      const first = [note(36, 16), note(38, 8), note(39, 8)];
      const second = [note(31, 16), note(33, 8), note(34, 8)];
      const third = [note(26, 16), note(28, 16)]; // a 6th below 33
      const out = generateNonChordTones(third, nctPatterns, [first, second, third], 2, 1, "C");
      const isMirror =
        out.length === 3 &&
        out[1].pitchValue === 28 &&
        out[1].length === 8 &&
        out[2].pitchValue - out[1].pitchValue === 1;
      expect(isMirror).toBe(false);
    });
  });

  test("decorations preserve the total duration exactly", () => {
    const mixed = [note(20, 16), note(22, 32), note(21, 16), note(21, 8)];
    const { output } = decorate(mixed);
    const before = mixed.reduce((a, n) => a + n.length, 0);
    const after = output.reduce((a, n) => a + n.length, 0);
    expect(after).toBe(before);
  });

  test("the pattern library never introduces a note shorter than the selection", () => {
    // A level 1 exercise (whole/half/quarter) must not sprout eighths just
    // because the decoration vocabulary is no longer tied to the rhythm menu.
    const quarterFloor = nctPatternsFor([
      { abcValue: ["8"], totalValue: 8 } as any,
      { abcValue: ["32"], totalValue: 32 } as any,
    ]);
    expect(quarterFloor.length).toBeGreaterThan(0);
    for (const p of quarterFloor) {
      for (const v of p.abcValue) expect(parseInt(v)).toBeGreaterThanOrEqual(8);
    }
    // and an eighth in the selection unlocks eighth-note decorations
    const eighthFloor = nctPatternsFor([{ abcValue: ["4"], totalValue: 4 } as any]);
    expect(eighthFloor.length).toBeGreaterThan(quarterFloor.length);
  });

  test("eighth decorations survive swapping dotted-quarter-eighth for its reverse", () => {
    // Item 5 is "get rid of base dotted quarters, but do add 8th-dotted
    // quarter". In a UIL 2 selection the *only* rhythm carrying an eighth is
    // dotQuarterEighth, and it is what permits eighth-note decorations. Swapping
    // it for the reversed figure must keep that permission - if the replacement
    // were ever made with a rhythm that has no eighth in it, eighth decorations
    // would vanish silently and nothing else would say so.
    const uil2 = [
      { abcValue: ["32"], totalValue: 32 } as any,
      { abcValue: ["16"], totalValue: 16 } as any,
      { abcValue: ["8"], totalValue: 8 } as any,
      { abcValue: ["12", "4"], totalValue: 16 } as any, // dotted quarter + eighth
    ];
    const swapped = [
      ...uil2.slice(0, 3),
      { abcValue: ["4", "12"], totalValue: 16 } as any, // eighth + dotted quarter
    ];
    const hasEighth = (patterns: { abcValue: string[] }[]) =>
      patterns.some((p) => p.abcValue.some((v) => parseInt(v) === 4));

    expect(hasEighth(nctPatternsFor(uil2))).toBe(true);
    expect(hasEighth(nctPatternsFor(swapped))).toBe(true);
    // and dropping every eighth-bearing rhythm does remove them
    expect(hasEighth(nctPatternsFor(uil2.slice(0, 3)))).toBe(false);
  });

  test("every pattern is a shape some type can actually use", () => {
    // Four of the ten pattern rhythms in rhythms.ts had three or four notes
    // while every generator required exactly two, so they could never produce a
    // decoration - a third of all attempts wasted. Anything in this library must
    // be a note count a generator handles, and must add up to its own duration.
    for (const p of nctPatterns) {
      expect(p.abcValue.length).toBeGreaterThanOrEqual(2);
      expect(p.abcValue.length).toBeLessThanOrEqual(4);
      const sum = p.abcValue.reduce((a, v) => a + parseInt(v), 0);
      expect(sum).toBe(p.totalValue);
    }
  });

  test("a double neighbour steps to each side and the chord tone returns", () => {
    const repeated = Array.from({ length: 40 }, () => note(20, 24));
    const { decorations } = decorate(repeated);
    const doubles = decorations.filter(({ group }) => group.length === 3);
    expect(doubles.length).toBeGreaterThan(0);
    for (const { original, group } of doubles) {
      expect(group[0].pitchValue).toBe(original.pitchValue);
      const first = group[1].pitchValue - original.pitchValue;
      const second = group[2].pitchValue - original.pitchValue;
      expect(Math.abs(first)).toBe(1);
      expect(second).toBe(-first); // opposite sides
    }
  });
});
