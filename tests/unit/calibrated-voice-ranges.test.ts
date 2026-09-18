import { describe, expect, test } from "bun:test";
import { soundingNoteName } from "../../src/lib/calibrated-voice-ranges";
import { noteArray } from "../../src/resources/noteArray";

describe("soundingNoteName", () => {
  test("ABC c (written C5) sounds middle C", () => {
    expect(soundingNoteName(noteArray.indexOf("c"))).toBe("C4");
  });
  test("ABC C sounds C3, and commas and apostrophes move octaves", () => {
    expect(soundingNoteName(noteArray.indexOf("C"))).toBe("C3");
    expect(soundingNoteName(noteArray.indexOf("C,"))).toBe("C2");
    expect(soundingNoteName(noteArray.indexOf("f'"))).toBe("F5");
  });
  test("an index off the end says so rather than inventing a note", () => {
    expect(soundingNoteName(noteArray.length + 5)).toBe(`#${noteArray.length + 5}`);
  });
});

import { uilPresets } from "../../src/lib/uil-presets";
import { APRIL_CALIBRATED_RANGES } from "../../src/lib/calibrated-voice-ranges";

describe("voice ranges", () => {
  // The ranges were hand-calibrated against UIL's published staves and once
  // overwritten by numbers re-derived from notes/uil-criteria.md, which are
  // wrong. If this fails, a range changed without recalibrating: redo it on
  // /range-calibration and update both files together, or put it back.
  test("the app uses the hand-calibrated ranges at every level", () => {
    for (const [level, ranges] of Object.entries(APRIL_CALIBRATED_RANGES)) {
      expect(uilPresets[level].voiceRanges).toEqual(ranges);
    }
  });
});
