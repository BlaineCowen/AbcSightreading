import { describe, expect, test } from "bun:test";
import { exerciseInfo } from "../../src/lib/tools/context";

/**
 * The practice tools read the exercise from its ABC: the key's do, the meter,
 * and each part's first sounding note (octave clefs included) - the pitch pipe
 * plays those, so a wrong octave is a choir starting in the wrong place.
 */

// The shape assembleAbcString writes: one staff per part, named.
const choral = `X:1
M:3/4
L:1/32
%%score [S A T B]
V:S clef=treble name="Soprano" snm="S"
V:A clef=treble name="Alto" snm="A"
V:T clef=treble transpose=-12 name="Tenor" snm="T"
V:B clef=bass name="Bass" snm="B"
K:Bb
[V:S] d8 c8 B8 |
[V:A] B8 A8 F8 |
[V:T] F8 F8 D8 |
[V:B] B,,8 F,,8 B,,8 |
`;

describe("exerciseInfo", () => {
  test("do, meter and each part's first sounding pitch", () => {
    const info = exerciseInfo(choral)!;
    expect(info.doLabel).toBe("B♭");
    expect(info.doNote).toBe("A#");
    expect(info.beatsPerBar).toBe(3);
    expect(info.rhythmOnly).toBe(false);
    const byPart = Object.fromEntries(info.startingPitches.map((p) => [p.part, [p.label, p.solfege]]));
    expect(byPart.Soprano).toEqual(["D5", "Mi"]);
    expect(byPart.Alto).toEqual(["B♭4", "Do"]);
    // The tenor is written an octave up (transpose=-12): written F4 sounds F3.
    expect(byPart.Tenor).toEqual(["F3", "Sol"]);
    expect(byPart.Bass).toEqual(["B♭2", "Do"]);
  });

  test("a minor key's do is its relative major's (la-based minor)", () => {
    const info = exerciseInfo("X:1\nM:4/4\nL:1/32\nK:Am\nA8 B8 c8 A8 |\n")!;
    expect(info.minor).toBe(true);
    expect(info.doLabel).toBe("C");
    expect(info.startingPitches[0].solfege).toBe("La");
  });

  test("unreadable ABC gives nothing rather than throwing", () => {
    expect(exerciseInfo("")).toBeNull();
  });
});
