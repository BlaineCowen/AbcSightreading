import { describe, expect, test } from "bun:test";
import { createNewSr, assembleUnisonAbc, type UnisonScore } from "../../src/lib/generateUnison";
import { rhythms } from "../../src/resources/rhythms";

/**
 * Rhythm syllables are written INTO a unison exercise, as one ABC annotation
 * per note, so the page can hide them but could never change which system they
 * are in - it had no notes to re-label from. A practice run wanting counting on
 * its repeats therefore wrote the WHOLE run in counting, and a reader who chose
 * Kodály got counting on the pass they were sight-reading.
 *
 * The exercise now comes back with the notes it was made of, so it can be
 * written out again in another system: same music, different words.
 */

const params = (over: Record<string, unknown> = {}) => ({
  bpm: 60,
  clef: "treble",
  timeSig: { name: "4/4", tsPerMeasure: 32, beamGroupSize: 8 },
  measures: 4,
  maxSkip: 4,
  tempo: 60,
  range: { min: 14, max: 21 },
  selectedRhythms: ["quarter", "eighthEighth", "half"],
  rhythms: rhythms.filter((r) => ["quarter", "eighthEighth", "half"].includes(r.name)),
  scaleDegrees: new Set([1, 2, 3, 4, 5]),
  selectedClef: "treble",
  selectedTimeSignature: "4/4",
  key: "C",
  chords: ["1", "2", "3", "4", "5", "6", "7"],
  showSolfege: true,
  showRhythmSyllables: true,
  syllableSystemId: "kodaly",
  partsObject: {
    numofParts: 1,
    parts: {
      Unison: { chordNoteObject: [], order: 0, smallName: "U", selectedRange: [14, 21] },
    },
  },
  ...over,
});

/**
 * The music only: the tune body with annotations and lyrics taken out. The
 * header is left out of the comparison because it carries the annotation font,
 * which is only written when there are syllables to size.
 */
const musicOnly = (abc: string) =>
  abc
    .slice(abc.indexOf("start of tune body"))
    .split("\n")
    .filter((l) => !l.startsWith("w:"))
    .map((l) => l.replace(/"[^"]*"/g, ""))
    .join("\n");

/** The quoted annotations, which is where the syllables ride. */
const annotations = (abc: string) => abc.match(/"[^"]*"/g) ?? [];

describe("re-labelling a unison exercise", () => {
  test("the exercise comes back with the notes it was made of", () => {
    const [abc, , score] = createNewSr(params()) as [string, unknown, UnisonScore];
    expect(score?.staff).toBe("pitched");
    expect(score.partsObject.parts.Unison.chordNoteObject.length).toBeGreaterThan(0);
    // Plain data, or it would not survive the trip from the server.
    expect(() => JSON.parse(JSON.stringify(score))).not.toThrow();
    // Re-assembling with what it was generated with reproduces it exactly.
    expect(assembleUnisonAbc(score, { showSolfege: true, showRhythmSyllables: true, syllableSystemId: "kodaly" }))
      .toBe(abc);
  });

  test("counting keeps every note and changes every word", () => {
    const [abc, , score] = createNewSr(params()) as [string, unknown, UnisonScore];
    const counting = assembleUnisonAbc(score, {
      showSolfege: true,
      showRhythmSyllables: true,
      syllableSystemId: "counting",
    });
    expect(musicOnly(counting)).toBe(musicOnly(abc));
    expect(annotations(counting)).not.toEqual(annotations(abc));
    expect(annotations(counting).length).toBe(annotations(abc).length);
    // Counting names beats; Kodály does not say "1".
    expect(annotations(counting).some((a) => a.includes("1"))).toBe(true);
  });

  test("a rhythm-only exercise re-labels the same way", () => {
    const [abc, , score] = createNewSr(
      params({ rhythmOnly: true, showSolfege: false })
    ) as [string, unknown, UnisonScore];
    expect(score.staff).toBe("rhythm");
    const counting = assembleUnisonAbc(score, {
      showRhythmSyllables: true,
      syllableSystemId: "counting",
    });
    expect(musicOnly(counting)).toBe(musicOnly(abc));
    expect(annotations(counting).length).toBe(annotations(abc).length);
  });

  test("syllables off leaves the notes alone", () => {
    const [abc, , score] = createNewSr(params()) as [string, unknown, UnisonScore];
    const bare = assembleUnisonAbc(score, { showSolfege: true, showRhythmSyllables: false });
    expect(musicOnly(bare)).toBe(musicOnly(abc));
    expect(annotations(bare)).toEqual([]);
    // ...and the font line goes with them, rather than being left behind.
    expect(bare).not.toContain("annotationfont");
    expect(abc).toContain("annotationfont");
  });
});
