import { describe, expect, test } from "bun:test";
import { assembleAbcString } from "../../src/lib/abc-assembly";
import type { VoiceNote } from "../../src/lib/types";

/**
 * How an accidental is written down.
 *
 * An accidental holds for the rest of the measure, so it is printed once and
 * the notes after it are left bare. Two bugs came from not modelling that:
 *
 *   - a bar of repeated eighths on one altered pitch printed the sign on every
 *     one of them, `^G ^G ^G` where a reader expects `^G G G`
 *   - cancelling was hard-coded to a natural, which is only right in a key that
 *     does not already alter that letter. In G major a plain F after an F
 *     natural has to be restored with `^F`, not marked natural a second time.
 *
 * One rule covers both: work out what the note must sound as, compare it with
 * what is already in force for that letter, and print a sign only when they
 * differ.
 */

const PARTS = {
  numofParts: 1,
  parts: {
    Soprano: {
      order: 0,
      smallName: "S",
      clef: "treble octave=-1",
      range: [14, 34],
      currentRange: [14, 34],
    },
  },
} as any;

const note = (
  pitchValue: number,
  name: string,
  accidental: VoiceNote["accidental"] = null,
  length = 8
): VoiceNote =>
  ({ name, degree: pitchValue % 7, pitchValue, length, rest: false, order: 0, accidental }) as VoiceNote;

/** The one voice line of the assembled exercise, annotations stripped. */
function voiceLine(notes: VoiceNote[], key: string, tsPerMeasure = 32): string {
  const abc = assembleAbcString(
    [notes],
    [{ ...PARTS.parts.Soprano, name: "Soprano", possibleNotes: [], chordNotes: [] }] as any,
    [],
    key,
    { name: "4/4", tsPerMeasure, beamGroupSize: 8 } as any,
    { title: "t", composer: "", bpm: 72, midiProgram: 0 } as any,
    {}
  );
  return (abc.split("\n").find((l) => l.startsWith("[V:")) ?? "")
    .replace(/^\[V:[^\]]*\]\s*/, "")
    .replace(/"[^"]*"/g, "")
    .trim();
}

describe("an accidental is printed once per measure", () => {
  test("repeated altered notes carry the sign only on the first", () => {
    // G# four times in one bar of C major.
    const line = voiceLine(
      Array.from({ length: 4 }, () => note(18, "^G", "sharp")),
      "C"
    );
    expect(line).toContain("^G8");
    // Exactly one sharp sign in the measure.
    expect((line.match(/\^G/g) ?? []).length).toBe(1);
  });

  test("and it is printed again in the next measure", () => {
    // The sign does not carry across a barline, so bar two needs its own.
    const line = voiceLine(
      Array.from({ length: 8 }, () => note(18, "^G", "sharp")),
      "C"
    );
    expect((line.match(/\^G/g) ?? []).length).toBe(2);
  });

  test("a different alteration on the same letter is still printed", () => {
    const line = voiceLine(
      [note(18, "^G", "sharp"), note(18, "_G", "flat"), note(18, "^G", "sharp"), note(18, "_G", "flat")],
      "C"
    );
    expect((line.match(/\^G/g) ?? []).length).toBe(2);
    expect((line.match(/_G/g) ?? []).length).toBe(2);
  });

  test("a diatonic note after an alteration is cancelled", () => {
    // G# then a plain G in C major: the G has to say it is natural.
    const line = voiceLine(
      [note(18, "^G", "sharp"), note(18, "G"), note(18, "G"), note(18, "G")],
      "C"
    );
    expect(line).toContain("=G");
    // ...once. The natural then holds for the rest of the bar too.
    expect((line.match(/=G/g) ?? []).length).toBe(1);
  });

  test("in a sharp key the cancel restores the key, it does not flatten it", () => {
    // G major: F is sharp by signature. An F natural, then a plain F - which
    // must come back as ^F. Marking it natural again would sound the wrong note
    // and was what the old code did.
    const line = voiceLine(
      [note(17, "=F", "natural"), note(17, "F"), note(17, "F")],
      "G"
    );
    expect(line).toContain("=F");
    expect(line).toContain("^F");
  });

  test("a note the key already alters needs no sign of its own", () => {
    // Plain F in G major is F sharp; nothing is written.
    const line = voiceLine([note(17, "F"), note(17, "F")], "G");
    expect(line).not.toContain("^F");
    expect(line).not.toContain("=F");
  });
});
