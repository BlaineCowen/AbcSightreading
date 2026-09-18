import { describe, expect, test } from "bun:test";
import { createNewSr, placeMissingChromatics, assembleUnisonAbc } from "../../src/lib/generateUnison";
import { rhythms } from "../../src/resources/rhythms";
import { keySignatures } from "../../src/resources/key-signatures";

/**
 * Selecting a chromatic scale degree in unison used to produce it almost never:
 * with every natural selected, sharp 1 appeared in 5 exercises of 40, flat 7 in
 * 2, and sharp 2, sharp 6, flat 2, flat 3 and flat 5 in none - no chord carried
 * them. With only 1, 3 and 5 selected it was worse, because the line could
 * only use a degree whose NATURAL was selected, so sharp 4 without natural 4
 * could not appear at all.
 */

// --- placeMissingChromatics ------------------------------------------------

// C major, pitch index 14 = C. Degrees are key-relative, so in C they match.
const NAMES = ["C", "D", "E", "F", "G", "A", "B"];
const noteList = Array.from({ length: 21 }, (_, i) => ({
  pitchValue: 14 + i,
  degree: i % 7,
  name: NAMES[i % 7] + (i >= 7 ? "'" : ""),
}));
const note = (pitchValue: number, name?: string) => {
  const base = noteList.find((n) => n.pitchValue === pitchValue)!;
  return {
    partName: "Unison", noteLength: 8, name: name ?? base.name, degree: base.degree,
    pitchValue, chord: null, rhythm: { rest: false } as any,
    isPatternStart: false, isPatternEnd: false, patternIndex: null,
  } as any;
};
const line = (...pitches: number[]) => pitches.map((p) => note(p));
const C = 14, D = 15, E = 16, F = 17, G = 18;
const opts = (over = {}) => ({
  sharps: new Set<number>(), flats: new Set<number>(), key: "C", noteList,
  random: () => 0, ...over,
});

describe("a chromatic passing or neighbour tone", () => {
  test("goes where the line already steps through it, as a passing tone", () => {
    // re re mi -> re ri mi
    const notes = line(C, D, D, E, E);
    expect(placeMissingChromatics(notes, opts({ sharps: new Set([1]) }))).toBe(1);
    expect(notes.map((n) => n.name)).toEqual(["C", "D", "^D", "E", "E"]);
  });

  test("...or as a neighbour", () => {
    // mi re mi -> mi ri mi
    const notes = line(C, E, D, E, C);
    placeMissingChromatics(notes, opts({ sharps: new Set([1]) }));
    expect(notes[2].name).toBe("^D");
  });

  test("a flat mirrors it downward", () => {
    // mi mi re -> mi me re
    const notes = line(C, E, E, D, C);
    placeMissingChromatics(notes, opts({ flats: new Set([2]) }));
    expect(notes[2].name).toBe("_E");
  });

  test("never where it would have to resolve the wrong way", () => {
    // re re do: a ri here would fall to do.
    const notes = line(E, D, D, C, C);
    expect(placeMissingChromatics(notes, opts({ sharps: new Set([1]) }))).toBe(0);
    expect(notes.map((n) => n.name)).toEqual(["E", "D", "D", "C", "C"]);
  });

  test("never beside another altered note", () => {
    // Its resolution would be the altered note - li "resolving" to B flat.
    const notes = line(D, D, E, F, G);
    notes[2] = note(E, "_E"); // re re me ...
    expect(placeMissingChromatics(notes, opts({ sharps: new Set([1]) }))).toBe(0);
  });

  test("not at all when the chords already wrote one", () => {
    const notes = line(C, D, D, E, E);
    notes[4] = note(E, "^D"); // pretend: a ri is already in the line
    notes[4].degree = 1;
    expect(placeMissingChromatics(notes, opts({ sharps: new Set([1]) }))).toBe(0);
  });

  test("spelled against the key", () => {
    // F major flattens B. Sharp 4 there is B natural, written =B.
    const inF = Array.from({ length: 21 }, (_, i) => ({
      pitchValue: 14 + i,
      degree: (i + 4) % 7, // F is degree 0; pitch 14 (C) is degree 4
      name: NAMES[i % 7],
    }));
    const B = 20, Cc = 21;
    const notes = [B, B, B, Cc, Cc].map((p) => {
      const base = inF.find((n) => n.pitchValue === p)!;
      return { ...note(C), pitchValue: p, degree: base.degree, name: base.name };
    });
    placeMissingChromatics(notes, opts({ sharps: new Set([3]), key: "F", noteList: inF }));
    expect(notes[2].name).toBe("=B");
  });
});

// --- through the generator ---------------------------------------------------

const generate = (sharps: number[], flats: number[], key = "C") => {
  const { log, warn, error } = console;
  Object.assign(console, { log: () => {}, warn: () => {}, error: () => {} });
  try {
    return createNewSr({
      bpm: 60, clef: "treble", selectedClef: "treble",
      timeSig: { name: "4/4", tsPerMeasure: 32, beamGroupSize: 8 }, selectedTimeSignature: "4/4",
      measures: 8, maxSkip: 4, tempo: 60, range: { min: 14, max: 23 },
      selectedRhythms: ["quarter", "half"], rhythms: rhythms.filter((r) => ["quarter", "half"].includes(r.name)),
      // Only 1, 3 and 5: the case that could produce nothing chromatic at all.
      scaleDegrees: new Set([1, 3, 5]),
      selectedSharpDegrees: sharps, selectedFlatDegrees: flats, accidentalsFollowStep: true,
      key, chords: ["1", "2", "3", "4", "5", "6", "7"], showSolfege: true,
      partsObject: { numofParts: 1, parts: { Unison: { chordNoteObject: [], order: 0, smallName: "U", selectedRange: [14, 23] } } },
    } as any) as any;
  } finally {
    Object.assign(console, { log, warn, error });
  }
};

/** +1 for a note written sharp of the key, -1 flat, 0 as the key has it. */
const alteration = (n: any, key: string) => {
  const p = n.name.match(/^[_^=]+/)?.[0] ?? "";
  const k = keySignatures[key];
  if (p.startsWith("^")) return 1;
  if (p.startsWith("_")) return -1;
  if (p === "=") return k.flats.includes(n.degree) ? 1 : k.sharps.includes(n.degree) ? -1 : 0;
  return 0;
};

describe("selecting chromatic degrees in unison", () => {
  // The four with no chord of their own, and three that have one.
  const cases: [string, number[], number[]][] = [
    ["sharp 2", [2], []], ["sharp 6", [6], []], ["flat 2", [], [2]], ["flat 5", [], [5]],
    ["sharp 4", [4], []], ["flat 3", [], [3]], ["flat 7", [], [7]],
  ];

  for (const [label, sharps, flats] of cases) {
    test(`${label} turns up, with only 1, 3 and 5 as naturals`, () => {
      // Measured at 30 of 30 for every degree; asserted a little looser so a
      // randomised generator cannot make it flaky.
      let withIt = 0;
      for (let i = 0; i < 8; i++) {
        const [, , score] = generate(sharps, flats);
        const notes = score.partsObject.parts.Unison.chordNoteObject;
        if (notes.some((n: any) => alteration(n, "C") !== 0)) withIt++;
      }
      expect(withIt).toBeGreaterThanOrEqual(7);
    }, 30000);
  }

  test("every altered note resolves the way it was altered", () => {
    // Sharps up a step, flats down a step - the step rule alone let 91 of 1,103
    // go the other way.
    let altered = 0;
    let wrong = 0;
    for (const key of ["C", "G", "F", "Bb", "D"]) {
      for (let i = 0; i < 4; i++) {
        const [, , score] = generate([4, 5], [7, 3], key);
        const notes = score.partsObject.parts.Unison.chordNoteObject.filter((n: any) => !n.rhythm?.rest);
        notes.forEach((n: any, k: number) => {
          const dir = alteration(n, key);
          if (!dir) return;
          altered++;
          let j = k + 1;
          while (notes[j] && notes[j].pitchValue === n.pitchValue) j++;
          if (notes[j] && notes[j].pitchValue - n.pitchValue !== dir) wrong++;
        });
      }
    }
    expect(altered).toBeGreaterThan(20);
    expect(wrong).toBe(0);
  }, 60000);

  test("about one note in eight at most, not an exercise about nothing else", () => {
    // Uncapped, sharp 4 came to 11 notes in 32.
    for (let i = 0; i < 6; i++) {
      const [, , score] = generate([4], []);
      const notes = score.partsObject.parts.Unison.chordNoteObject;
      const altered = notes.filter((n: any) => alteration(n, "C") !== 0).length;
      expect(altered).toBeLessThanOrEqual(5);
    }
  }, 30000);

  test("an altered note with no room to resolve is left out, not a failed exercise", () => {
    // G major, range F to C: fi is C sharp, whose D is out of range, and te is
    // F natural, whose E is too. Requiring the resolution made every walk that
    // landed on one of them die - 20 generations in 20 failed. Now they generate
    // without it, which is all a five-note range can hold.
    const { log, warn, error } = console;
    Object.assign(console, { log: () => {}, warn: () => {}, error: () => {} });
    try {
      for (let i = 0; i < 8; i++) {
        expect(() =>
          createNewSr({
            bpm: 60, clef: "treble", selectedClef: "treble",
            timeSig: { name: "4/4", tsPerMeasure: 32, beamGroupSize: 8 }, selectedTimeSignature: "4/4",
            measures: 8, maxSkip: 4, tempo: 60, range: { min: 17, max: 21 },
            selectedRhythms: ["quarter"], rhythms: rhythms.filter((r) => r.name === "quarter"),
            scaleDegrees: [1, 3, 5], selectedSharpDegrees: [4], selectedFlatDegrees: [7],
            accidentalsFollowStep: true, key: "G",
            chords: ["1", "2", "3", "4", "5", "6", "7"], showSolfege: true,
            partsObject: { numofParts: 1, parts: { Unison: { chordNoteObject: [], order: 0, smallName: "U", selectedRange: [17, 21] } } },
          } as any)
        ).not.toThrow();
      }
    } finally {
      Object.assign(console, { log, warn, error });
    }
  }, 30000);
});

describe("a natural sign in unison's movable-do lyrics", () => {
  // Movable do read "=" as no accidental at all, so F natural in G - te, the
  // flat 7 - printed "ti". It hardly mattered while naturals barely appeared;
  // selecting flat 7 in a sharp key now writes one every exercise.
  const lyricsFor = (key: string, notes: { name: string; degree: number; pitchValue: number }[]) => {
    const abc = assembleUnisonAbc(
      {
        staff: "pitched",
        key,
        clef: "treble",
        timeSig: { name: "4/4", tsPerMeasure: 32, beamGroupSize: 8 },
        partsObject: {
          numofParts: 1,
          parts: {
            Unison: {
              order: 0, smallName: "U", selectedRange: [14, 21],
              chordNoteObject: notes.map((n) => ({
                partName: "Unison", noteLength: 8, ...n, chord: null,
                rhythm: { rest: false, pattern: false } as any,
                isPatternStart: false, isPatternEnd: false, patternIndex: null,
              })),
            },
          },
        } as any,
      },
      { showSolfege: true, lyricSystem: "movable" }
    );
    return abc.split("\n").find((l) => l.startsWith("w:"))!.slice(2).trim().split(/\s+/);
  };

  test("lowers a degree the key sharpens", () => {
    // G major: E F=natural E -> la te la. F is degree 6 there.
    expect(lyricsFor("G", [
      { name: "E", degree: 5, pitchValue: 16 },
      { name: "=F", degree: 6, pitchValue: 17 },
      { name: "E", degree: 5, pitchValue: 16 },
      { name: "D", degree: 4, pitchValue: 15 },
    ])).toEqual(["la", "te", "la", "so"]);
  });

  test("raises a degree the key flattens", () => {
    // F major: B natural is the raised 4th, fi. B is degree 3 there.
    expect(lyricsFor("F", [
      { name: "A", degree: 2, pitchValue: 19 },
      { name: "=B", degree: 3, pitchValue: 20 },
      { name: "c", degree: 4, pitchValue: 21 },
      { name: "c", degree: 4, pitchValue: 21 },
    ])).toEqual(["mi", "fi", "so", "so"]);
  });
});
