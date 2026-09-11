import { describe, expect, test } from "bun:test";
import { createNewSr } from "../../src/lib/generateUnison";
import { rhythms } from "../../src/resources/rhythms";

/**
 * A pitched exercise carries rhythm syllables, so a practice run can show them
 * on its repeats.
 *
 * It did not, and the bug was silent in the worst way: the syllables are only
 * ever STRIPPED at render time, so a control asking for them on a repeat simply
 * produced nothing. There was nothing to un-strip, because the pitched
 * assembler was never told to write them - that was only done for the one-line
 * rhythm staff.
 */

const params = (over: Record<string, unknown> = {}) => ({
  bpm: 60,
  clef: "treble",
  timeSig: { name: "4/4", tsPerMeasure: 32 },
  measures: 4,
  maxSkip: 4,
  tempo: 60,
  range: { min: 14, max: 19 },
  selectedRhythms: ["quarter"],
  rhythms: rhythms.filter((r) => r.name === "quarter"),
  scaleDegrees: new Set([1, 3, 5, 6]),
  selectedClef: "treble",
  selectedTimeSignature: "4/4",
  key: "C",
  chords: ["1", "2", "3", "4", "5", "6", "7"],
  showSolfege: true,
  rhythmOnly: false,
  partsObject: {
    numofParts: 1,
    parts: {
      Unison: { chordNoteObject: [], order: 0, smallName: "U", selectedRange: [14, 19] },
    },
  },
  ...over,
});

/** ABC annotations - the `"..."` tokens the syllables ride in. */
const quoted = (abc: string) => abc.match(/"[^"]*"/g) ?? [];

function abcOf(over: Record<string, unknown> = {}): string {
  const out: any = createNewSr(params(over) as any);
  const s = Array.isArray(out) ? out[0] : out?.renderedString ?? out;
  expect(typeof s).toBe("string");
  return s as string;
}

describe("a pitched exercise carries rhythm syllables", () => {
  test("when asked for, they are written into it", () => {
    const abc = abcOf({ showRhythmSyllables: true, syllableSystemId: "kodaly" });
    expect(quoted(abc).length).toBeGreaterThan(0);
  });

  test("and are absent when not", () => {
    // The control is what decides; this is the baseline it has to differ from.
    expect(quoted(abcOf({ showRhythmSyllables: false })).length).toBe(0);
  });

  test("the system chosen is the system written", () => {
    // Counting names beats as numbers; Kodály does not. Asking for one and
    // getting the other is the failure that matters, because a repeat cannot
    // re-label an exercise afterwards - the syllables are part of it.
    const counting = quoted(abcOf({ showRhythmSyllables: true, syllableSystemId: "counting" })).join(" ");
    const kodaly = quoted(abcOf({ showRhythmSyllables: true, syllableSystemId: "kodaly" })).join(" ");
    expect(counting).toMatch(/[1-4]/);
    expect(kodaly).toMatch(/ta|ti/i);
    expect(counting).not.toBe(kodaly);
  });

  test("the annotation font is set when they are written", () => {
    // 12pt is sized for chord symbols above a staff; at that size adjacent
    // syllables under a short note collide.
    expect(abcOf({ showRhythmSyllables: true })).toContain("%%annotationfont");
    expect(abcOf({ showRhythmSyllables: false })).not.toContain("%%annotationfont");
  });

  test("solfège is still written alongside them", () => {
    // Both are written in and stripped at render, so a repeat can ask for
    // either. One must not have displaced the other.
    const abc = abcOf({ showRhythmSyllables: true, showSolfege: true });
    expect(abc).toMatch(/^w:/m);
    expect(quoted(abc).length).toBeGreaterThan(0);
  });
});
