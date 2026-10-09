import { expect, test } from "bun:test";
import abcjs from "abcjs";
import { blockChord, bassRoot, rightHandPosition, leftHandPosition, degreeOf, chordDegrees } from "../../src/lib/piano/voicing";
import { writeLeftHand, LEFT_HAND_BOTTOM, LEFT_HAND_TOP } from "../../src/lib/piano/left-hand";
import { assemblePianoAbc, beamed } from "../../src/lib/piano/assemble";
import { generatePianoExercise, pianoFault, mergeRests } from "../../src/lib/piano/generatePiano";
import { PIANO_LEVELS, patternsFor, type LeftHandPattern } from "../../src/lib/piano/levels";
import { timeSignatureFor } from "../../src/lib/meter";

// noteArray indices: C2 0, G2 4, B2 6, C3 7, E3 9, F3 10, G3 11, A3 12, C4 14, G4 18.

test("block chords come out in the shapes a method book teaches: C-E-G, then C-F-A and B-F-G", () => {
  const I = blockChord("C", "1", null, LEFT_HAND_BOTTOM, LEFT_HAND_TOP);
  expect(I).toEqual([7, 9, 11]);
  expect(blockChord("C", "4", I, LEFT_HAND_BOTTOM, LEFT_HAND_TOP)).toEqual([7, 10, 12]);
  expect(blockChord("C", "5-7", I, LEFT_HAND_BOTTOM, LEFT_HAND_TOP)).toEqual([6, 10, 11]);
  // G major's I in root position, near C3: G2-B2-D3.
  expect(blockChord("G", "1", null, LEFT_HAND_BOTTOM, LEFT_HAND_TOP)).toEqual([4, 6, 8]);
});

test("the bass root has one place a letter (F2 to E3); the hands' positions sit on the tonic", () => {
  expect(bassRoot("C", 0)).toBe(7);
  expect(bassRoot("C", 4)).toBe(4);
  expect(bassRoot("F", 0)).toBe(3);
  expect(rightHandPosition("C", 4)).toEqual({ low: 14, high: 18 });
  expect(rightHandPosition("G", 4)).toEqual({ low: 18, high: 22 });
  expect(leftHandPosition("C")).toEqual({ low: 7, high: 11 });
});

test("every left-hand pattern fills each chord's length with that chord's notes, in the left hand's range", () => {
  const spans = [
    { name: "1", length: 32, barStart: true },
    { name: "4", length: 16, barStart: true },
    { name: "5-7", length: 16, barStart: false },
    { name: "1", length: 32, barStart: true },
  ];
  const patterns: LeftHandPattern[] = ["root", "fifth", "rocking", "block", "blockBeats", "oompah", "broken", "arpeggio", "waltz", "brokenEighths", "alberti"];
  for (const p of patterns) {
    const notes = writeLeftHand("C", spans, p, 8);
    expect(notes.reduce((s, n) => s + n.length, 0)).toBe(96);
    let t = 0, i = 0, spanEnd = spans[0].length;
    for (const n of notes) {
      while (t >= spanEnd) spanEnd += spans[++i].length;
      const tones = chordDegrees(spans[i].name);
      for (const pv of n.pitches) {
        expect(tones).toContain(degreeOf("C", pv));
        expect(pv).toBeGreaterThanOrEqual(LEFT_HAND_BOTTOM);
        expect(pv).toBeLessThanOrEqual(LEFT_HAND_TOP);
      }
      t += n.length;
    }
  }
});

test("the grand staff is braced, carries chords in brackets, and abcjs reads it as two staves", () => {
  const abc = assemblePianoAbc({
    key: "C", meter: "4/4", barUnits: 32, bpm: 72, title: "Level 5 · C major",
    rh: [{ pitches: [14], length: 16 }, { pitches: [16], length: 16 }],
    lh: [{ pitches: [7, 9, 11], length: 32 }],
  });
  expect(abc).toContain("%%score {RH | LH}");
  expect(abc).toContain("[C,E,G,]32");
  const tune = (abcjs as any).parseOnly(abc)[0];
  expect(tune.lines[0].staff.length).toBe(2);
  expect(tune.warnings ?? []).toEqual([]);
});

test("rests side by side in a bar merge to one a single rest can show", () => {
  const out = mergeRests([{ pitches: [], length: 8, rest: true }, { pitches: [], length: 8, rest: true }, { pitches: [14], length: 16 }], 32);
  expect(out).toEqual([{ pitches: [], length: 16, rest: true }, { pitches: [14], length: 16 }]);
});

test("every level writes in each key and meter it offers, without a fault, and its left hand plays the level's patterns", () => {
  const quiet = { log: console.log, warn: console.warn };
  Object.assign(console, { log() {}, warn() {} });
  try {
    for (const level of PIANO_LEVELS) {
      for (const key of level.keys) for (const meter of level.meters) {
        for (let i = 0; i < 3; i++) {
          const ex = generatePianoExercise({ levelId: level.id, key, meter });
          expect(pianoFault(ex, timeSignatureFor(meter).tsPerMeasure)).toBeNull();
          if (level.together) expect(patternsFor(level, meter)).toContain(ex.pattern);
          else expect(ex.pattern).toBe("tune");
          const parsed = (abcjs as any).parseOnly(ex.abc)[0];
          expect(parsed.warnings ?? []).toEqual([]);
        }
      }
    }
  } finally {
    Object.assign(console, quiet);
  }
}, 120000);

test("eighths are beamed in their group, and a quarter or a rest breaks the beam", () => {
  const n = (p: number, l: number) => ({ pitches: [p], length: l });
  // 4/4: four eighths under one beam a half bar.
  expect(beamed([n(14, 4), n(15, 4), n(16, 4), n(17, 4), n(18, 4), n(17, 4), n(16, 8)], 16)).toBe("C4D4E4F4 G4F4 E8");
  // 3/4: a beat; a rest between breaks it.
  expect(beamed([n(14, 8), n(15, 4), n(16, 4), { pitches: [], length: 4, rest: true }, n(17, 4), n(18, 8)], 8)).toBe("C8 D4E4 z4 F4 G8");
});

test("with the tune in the left hand, the right hand plays the chords above middle C and the tune stays in the left hand's position", () => {
  const quiet = { log: console.log, warn: console.warn };
  Object.assign(console, { log() {}, warn() {} });
  try {
    for (let i = 0; i < 20; i++) {
      const ex = generatePianoExercise({ levelId: "piano-06", key: "C", meter: "4/4", tuneHand: "left" });
      expect(ex.tuneHand).toBe("left");
      expect(["block", "blockBeats"]).toContain(ex.pattern);
      for (const n of ex.rh) for (const p of n.pitches) expect(p).toBeGreaterThanOrEqual(14);
      for (const n of ex.lh) for (const p of n.pitches) {
        expect(p).toBeGreaterThanOrEqual(7);
        expect(p).toBeLessThanOrEqual(11);
      }
      expect(pianoFault(ex, 32)).toBeNull();
    }
    // A level that does not move the tune keeps it in the right hand.
    expect(generatePianoExercise({ levelId: "piano-05", key: "C", meter: "4/4", tuneHand: "left" }).tuneHand).toBe("right");
  } finally {
    Object.assign(console, quiet);
  }
});
