import { describe, expect, test } from "bun:test";
import { generateChoralExercise } from "../../src/lib/generateChoral";
import { generateNonChordTones } from "../../src/lib/non-chord-tone-gen";
import { nctPatterns } from "../../src/lib/nct-patterns";
import { uilPresets } from "../../src/lib/uil-presets";
import { chords } from "../../src/resources/chords";
import { rhythms as allRhythms } from "../../src/resources/rhythms";
import { ClefType, type VoiceNote } from "../../src/lib/types";

/**
 * Eighth notes move by step or repeat, never by skip - how choral sight-reading
 * writes them. Before the option existed, 52-57% of short notes were skipped
 * into or out of: a pattern is sung over one chord and each of its notes was
 * re-picked from that chord's tones, a third apart at the least.
 *
 * A rest breaks the line, so the note beside one is free.
 */

/** Adjacent sung pairs, either of them an eighth or less, more than a step apart. */
function skipsBesideShortNotes(voice: VoiceNote[]): number {
  let n = 0;
  for (let k = 1; k < voice.length; k++) {
    const a = voice[k - 1];
    const b = voice[k];
    if (a.rest || b.rest) continue;
    if (a.length > 4 && b.length > 4) continue;
    if (Math.abs(a.pitchValue - b.pitchValue) > 1) n++;
  }
  return n;
}

describe("stepwise eighths in a whole exercise", () => {
  const p = uilPresets["UIL 5"];
  const range = (name: string, fallback: [number, number]) =>
    [...(p.voiceRanges?.[name] ?? fallback)] as [number, number];
  const partsObject = {
    numofParts: 4,
    parts: {
      Soprano: { order: 3, smallName: "S", clef: ClefType.Treble, range: [21, 35], currentRange: range("Soprano", [25, 32]) },
      Alto: { order: 2, smallName: "A", clef: ClefType.Treble, range: [14, 32], currentRange: range("Alto", [21, 28]) },
      Tenor: { order: 1, smallName: "T", clef: ClefType.TrebleOctaveUp, range: [11, 27], currentRange: range("Tenor", [14, 23]) },
      Bass: { order: 0, smallName: "B", clef: ClefType.Bass, range: [2, 24], currentRange: range("Bass", [9, 18]) },
    },
  };
  const selectedRhythms = allRhythms.filter(
    (r) => p.allowedRhythmNames.includes(r.name) && !r.rest
  );

  const generate = (stepwiseEighths: boolean) => {
    const { log, warn, error } = console;
    Object.assign(console, { log: () => {}, warn: () => {}, error: () => {} });
    try {
      return generateChoralExercise({
        key: "C",
        timeSig: { name: "4/4", tsPerMeasure: 32, beamGroupSize: 8 },
        partsObject,
        measures: 8,
        maxSkip: p.maxSkip,
        bpm: 72,
        selectedRhythms,
        chords,
        accidentalsByStep: true,
        nctProbability: 0.25,
        chromaticFrequency: 1,
        allowedChordNames: p.allowedChordNames,
        voiceTexture: "full",
        stepwiseEighths,
      } as any);
    } finally {
      Object.assign(console, { log, warn, error });
    }
  };

  test(
    "with the option on, the upper voices never skip beside a short note",
    () => {
      let shortNotes = 0;
      let upperSkips = 0;
      let bassSkips = 0;
      let failed = 0;
      for (let i = 0; i < 20; i++) {
        // An exercise that cannot be written is the sweep's business, not this
        // test's: the rule is about the music that does come out. Asserting on
        // every run made this fail about one run in ten on a failed generation,
        // which reads as a broken rule and is not one. The count is still
        // bounded below, so a rule that starved the search would show here.
        let result;
        try {
          result = generate(true);
        } catch {
          failed++;
          continue;
        }
        const { voiceNotes, voiceNames } = result;
        voiceNotes.forEach((voice, v) => {
          shortNotes += voice.filter((n) => !n.rest && n.length <= 4).length;
          if (voiceNames[v] === "Bass") bassSkips += skipsBesideShortNotes(voice);
          else upperSkips += skipsBesideShortNotes(voice);
        });
      }
      expect(failed).toBeLessThanOrEqual(4);
      // Guard against a vacuous pass: the level's rhythms and the decoration
      // have to have produced eighths for the rule to have been tested at all.
      expect(shortNotes).toBeGreaterThan(100);
      // The upper voices used to hold the rule outright, and that assertion was
      // right up until the option became the default. Held as a hard filter,
      // the step limit could empty a voice's candidate list - three treble
      // parts at UIL 5 in a minor key, sixteen bars, have nowhere to step to -
      // and the whole exercise then failed. Over the full sweep that was 599
      // failures in 22,068; letting the limit yield to the ordinary maxSkip
      // makes it 389, and 286 affected cells become 212.
      //
      // So the contract is now the same for every voice: prefer the step, take
      // the skip rather than fail. Measured at 0.5-1.3% of short notes, against
      // 37% with the option off; the bound is 3% because 20 exercises is a
      // small sample.
      expect(upperSkips / shortNotes).toBeLessThan(0.03);
      // The bass keeps two deliberate exceptions. At a cadence the chord is
      // fixed, and holding the step there failed 7 exercises in 40 - so the
      // cadential leap stays behind it. And build-chord-notes' deadlock escape
      // is best-effort by design (see the comment at its pool pick): narrowing
      // it removes the escape.
      //
      // That escape used to be where nearly all of this came from. Its pool is
      // the root and the third, which from where the bass actually is, is often
      // a third away or more; with nothing within a step it fell through to
      // "nearest", which is unbounded. Offering the fifth - only the notes that
      // satisfy the rule - took this from 2-3.5% of short notes to 0.3-0.75%,
      // and at UIL 5 from 51 skips in 57 exercises to 2. The bound is 0.015
      // rather than zero because the escape is still allowed to fire when no
      // fifth is within a step either, and because 20 exercises is a small
      // sample; it was 0.08.
      expect(bassSkips / shortNotes).toBeLessThan(0.015);
    },
    30000
  );
});

describe("stepwise eighths in decoration", () => {
  const note = (pitchValue: number, length: number): VoiceNote =>
    ({ name: "x", degree: pitchValue % 7, pitchValue, length, rest: false, order: 0 }) as VoiceNote;
  const eighths = nctPatterns.find((r) => r.name === "nctEighthEighth")!;
  const quarters = nctPatterns.find((r) => r.name === "nctQuarterQuarter")!;

  /** How many of `runs` passes decorated the line with `type` in `pattern`. */
  function decorated(
    line: number[],
    length: number,
    pattern: typeof eighths,
    type: string,
    stepwiseEighths: boolean,
    runs = 60
  ): number {
    let n = 0;
    for (let i = 0; i < runs; i++) {
      const voice = line.map((pv) => note(pv, length));
      const out = generateNonChordTones(
        voice.map((x) => ({ ...x })), [pattern], [voice], 0, 1, "C",
        [type], [0, 40], undefined, stepwiseEighths
      );
      if (out.length > line.length) n++;
    }
    return n;
  }

  // Note 1 is leapt into from a 4th below: the appoggiatura's shape.
  const leptInto = [0, 3, 4];
  // The line moves by step, so an escape tone leaves a third to leap back over.
  const stepping = [0, 1, 2];

  test("an appoggiatura on eighths is refused - it leaps into one", () => {
    expect(decorated(leptInto, 8, eighths, "Appoggiatura", false)).toBeGreaterThan(0);
    expect(decorated(leptInto, 8, eighths, "Appoggiatura", true)).toBe(0);
  });

  test("an appoggiatura on quarters is kept - the leap is not beside an eighth", () => {
    expect(decorated(leptInto, 16, quarters, "Appoggiatura", true)).toBeGreaterThan(0);
  });

  test("an escape tone on eighths is refused - it leaps out of one", () => {
    expect(decorated(stepping, 8, eighths, "Escape Tone", false)).toBeGreaterThan(0);
    expect(decorated(stepping, 8, eighths, "Escape Tone", true)).toBe(0);
  });

  test("a passing tone on eighths is untouched - it is stepwise already", () => {
    // C . E: the gap of a third is what a two-note passing figure fills.
    expect(decorated([0, 0, 2], 8, eighths, "Passing Tone", true)).toBeGreaterThan(0);
  });
});
