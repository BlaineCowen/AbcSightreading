import { describe, expect, test } from "bun:test";
import {
  alterationOf,
  fixedDoFor,
  noteNameFor,
  lyricLineFor,
  solfegeLineFor,
} from "../../src/resources/solfege";
import { noteArray } from "../../src/resources/noteArray";
import type { VoiceNote } from "../../src/lib/types";

/**
 * Three things can go under the notes: movable do (do is the tonic), fixed do
 * (C is do, whatever the key) and the note names.
 *
 * The two new ones name the PITCH rather than the degree, so both have to ask
 * the key signature: the F in G major carries no accidental of its own, and
 * printing it as "fa" or "F" would be wrong in a way movable do never is.
 */

/** A note by its pitch index, with the key-relative degree named separately. */
const note = (pitchValue: number, degree: number, over: Partial<VoiceNote> = {}): VoiceNote =>
  ({
    name: noteArray[pitchValue],
    pitchValue,
    degree,
    length: 8,
    rest: false,
    ...over,
  }) as VoiceNote;

// noteArray starts at C,, so pitch class 0 is C.
const C = 14, D = 15, E = 16, F = 17, G = 18, A = 19, B = 20;

describe("fixed do", () => {
  test("names the letter, not the degree", () => {
    // In G major, G is degree 0. Movable do calls it do; fixed do calls it so.
    expect(fixedDoFor(G, null)).toBe("so");
    expect(solfegeLineFor([note(G, 0)], "G")).toEqual(["do"]);
    expect(lyricLineFor([note(G, 0)], "G", "fixed")).toEqual(["so"]);
  });

  test("the same pitch keeps its syllable in every key", () => {
    const keys = ["C", "G", "F", "D", "Bb", "Am", "Em"];
    const said = keys.map((k) => lyricLineFor([note(C, 0)], k, "fixed")[0]);
    expect(new Set(said).size).toBe(1);
    expect(said[0]).toBe("do");
  });

  test("chromatic spellings are the ones movable do uses", () => {
    expect(fixedDoFor(C, "sharp")).toBe("di");
    expect(fixedDoFor(E, "flat")).toBe("me");
    expect(fixedDoFor(B, "flat")).toBe("te");
    expect(fixedDoFor(F, "sharp")).toBe("fi");
  });
});

describe("note names", () => {
  test("letter and accidental, in proper signs", () => {
    expect(noteNameFor(C, null)).toBe("C");
    expect(noteNameFor(F, "sharp")).toBe("F♯");
    expect(noteNameFor(B, "flat")).toBe("B♭");
  });

  test("every octave of a letter is the same name", () => {
    expect(noteNameFor(C, null)).toBe(noteNameFor(C + 7, null));
    expect(noteNameFor(A - 7, null)).toBe("A");
  });
});

describe("the accidental in force", () => {
  test("comes from the key when the note carries none", () => {
    // G major sharpens its 7th degree, which is F.
    expect(alterationOf({ degree: 6, accidental: null }, "G")).toBe("sharp");
    expect(lyricLineFor([note(F, 6)], "G", "fixed")).toEqual(["fi"]);
    expect(lyricLineFor([note(F, 6)], "G", "names")).toEqual(["F♯"]);
    // F major flattens its 4th, which is B.
    expect(alterationOf({ degree: 3, accidental: null }, "F")).toBe("flat");
    expect(lyricLineFor([note(B, 3)], "F", "names")).toEqual(["B♭"]);
  });

  test("the note's own accidental wins, and a natural cancels the key's", () => {
    expect(alterationOf({ degree: 3, accidental: "sharp" }, "C")).toBe("sharp");
    expect(alterationOf({ degree: 6, accidental: "natural" }, "G")).toBe(null);
    expect(lyricLineFor([note(F, 6, { accidental: "natural" })], "G", "names")).toEqual(["F"]);
  });

  test("a key nobody has defined is read as no accidental rather than throwing", () => {
    expect(alterationOf({ degree: 0, accidental: null }, "H#")).toBe(null);
  });
});

describe("every system", () => {
  const line = [note(C, 0), note(D, 1, { rest: true }), note(E, 2)];

  test("skips rests, so the lyrics stay under the right notes", () => {
    for (const system of ["movable", "fixed", "names"] as const) {
      expect(lyricLineFor(line, "C", system)).toHaveLength(2);
    }
  });

  test("agrees with the others in C major, where the two do systems coincide", () => {
    expect(lyricLineFor([note(C, 0), note(E, 2)], "C", "movable")).toEqual(["do", "mi"]);
    expect(lyricLineFor([note(C, 0), note(E, 2)], "C", "fixed")).toEqual(["do", "mi"]);
    expect(lyricLineFor([note(C, 0), note(E, 2)], "C", "names")).toEqual(["C", "E"]);
  });
});
