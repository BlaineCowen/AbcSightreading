import { describe, expect, test } from "bun:test";
import { degreeLetter, pitchLetter } from "../../src/lib/note-names";
import { TRACKS } from "../../src/lib/curriculum/tracks";

describe("note names", () => {
  test("a degree by letter in its key, with the key's accidentals", () => {
    expect([1, 2, 3, 4, 5, 6, 7].map((d) => degreeLetter("Bb", d))).toEqual(["B♭", "C", "D", "E♭", "F", "G", "A"]);
    expect([1, 2, 3, 4, 5, 6, 7].map((d) => degreeLetter("D", d))).toEqual(["D", "E", "F♯", "G", "A", "B", "C♯"]);
    expect(degreeLetter("C", 8)).toBe("C");
  });

  test("an altered degree: raised, lowered, and a natural against the key", () => {
    expect(degreeLetter("C", 4, 1)).toBe("F♯");
    expect(degreeLetter("C", 7, -1)).toBe("B♭");
    expect(degreeLetter("Bb", 4, 1)).toBe("E♮");
    expect(degreeLetter("G", 7, -1)).toBe("F♮");
    expect(degreeLetter("Am", 7, 1)).toBe("G♯");
  });

  test("a pitch named in a key", () => {
    expect(pitchLetter("D", 66)).toBe("F♯");
    expect(pitchLetter("G", 70)).toBe("B♭");
    expect(pitchLetter("F", 70)).toBe("B♭");
    expect(pitchLetter("F", 71)).toBe("B♮");
    expect(pitchLetter("C", 61)).toBe("C♯");
    expect(pitchLetter("Bb", 64)).toBe("E♮");
    expect(pitchLetter("Eb", 66)).toBe("G♭");
    expect(pitchLetter("G", 73)).toBe("C♯");
    expect(pitchLetter("C", 68)).toBe("A♭");
  });

  test("no instrument course names a note in solfège", () => {
    const solfa = /\b(do|re|mi|fa|so|sol|la|ti|te|fi)\b/i;
    for (const t of TRACKS) for (const s of t.steps) if (s.newNotes) expect(s.newNotes).not.toMatch(solfa);
  });

  test("each instrument names its own written notes", () => {
    const first = (id: string) => TRACKS.find((t) => t.id === id)!.steps.find((s) => s.newNotes)!.newNotes;
    expect(first("band-trumpet")).toStartWith("C, D, E:");
    expect(first("band-flute")).toStartWith("B♭, C, D:");
    expect(first("band-alto-sax")).toStartWith("G, A, B:");
    expect(first("orch-violin")).toStartWith("D, E, F♯:");
  });
});
