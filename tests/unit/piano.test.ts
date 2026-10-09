import { expect, test } from "bun:test";
import abcjs from "abcjs";
import { blockChord, bassRoot, rightHandPosition, leftHandPosition, degreeOf, chordDegrees } from "../../src/lib/piano/voicing";
import { writeLeftHand, LEFT_HAND_BOTTOM, LEFT_HAND_TOP } from "../../src/lib/piano/left-hand";
import { assemblePianoAbc, beamed, beamGroup } from "../../src/lib/piano/assemble";
import { generatePianoExercise, pianoFault, mergeRests } from "../../src/lib/piano/generatePiano";
import { PIANO_LEVELS, patternsFor, settingsFor, unlockedAt, type LeftHandPattern } from "../../src/lib/piano/levels";
import { settingsFromQuery, settingsQuery } from "../../src/lib/piano/settings-link";
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
  const patterns: LeftHandPattern[] = ["root", "fifth", "rocking", "block", "blockBeats", "oompah", "broken", "arpeggio", "waltz", "brokenEighths", "alberti", "albertiSixteenths"];
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

test("every level writes in each key and meter it offers, without a fault, with one of its patterns", () => {
  const quiet = { log: console.log, warn: console.warn };
  Object.assign(console, { log() {}, warn() {} });
  try {
    for (const level of PIANO_LEVELS) {
      const s = level.settings;
      for (const key of s.keys) for (const meter of s.meters) {
        const ex = generatePianoExercise({ levelId: level.id, key, meter });
        expect(pianoFault(ex, timeSignatureFor(meter).tsPerMeasure)).toBeNull();
        if (!s.together) expect(ex.pattern).toBe("tune");
        else if (ex.tuneHand === "left") expect(["block", "blockBeats"]).toContain(ex.pattern);
        else expect(patternsFor(s, meter)).toContain(ex.pattern);
        const parsed = (abcjs as any).parseOnly(ex.abc)[0];
        expect(parsed.warnings ?? []).toEqual([]);
      }
    }
  } finally {
    Object.assign(console, quiet);
  }
}, 120000);

test("beams end with the beat, and a quarter or a rest breaks one", () => {
  const n = (p: number, l: number) => ({ pitches: [p], length: l });
  // 4/4: eighths beamed two a beat, never across a beat.
  expect(beamed([n(14, 4), n(15, 4), n(16, 4), n(17, 4), n(18, 4), n(17, 4), n(16, 8)], beamGroup("4/4"))).toBe("C4D4 E4F4 G4F4 E8");
  // Sixteenths four a beat; an eighth and two sixteenths one beam.
  expect(beamed([n(14, 2), n(15, 2), n(16, 2), n(17, 2), n(18, 4), n(17, 2), n(16, 2), n(15, 16)], beamGroup("4/4"))).toBe("C2D2E2F2 G4F2E2 D16");
  // A dotted quarter and eighth: the eighth (the second half of beat 2) stands alone.
  expect(beamed([n(14, 12), n(15, 4), n(16, 16)], beamGroup("4/4"))).toBe("C12 D4 E16");
  // 6/8: three eighths a beat.
  expect(beamed([n(14, 4), n(15, 4), n(16, 4), n(17, 4), n(18, 4), n(17, 4)], beamGroup("6/8"))).toBe("C4D4E4 F4G4F4");
  // 3/4: a beat; a rest between breaks it.
  expect(beamed([n(14, 8), n(15, 4), n(16, 4), { pitches: [], length: 4, rest: true }, n(17, 4), n(18, 8)], 8)).toBe("C8 D4E4 z4 F4 G8");
});

test("with the tune in the left hand, the right hand plays the chords above middle C and the tune stays in the left hand's position", () => {
  const quiet = { log: console.log, warn: console.warn };
  Object.assign(console, { log() {}, warn() {} });
  try {
    const settings = { ...settingsFor("piano-06"), keys: ["C"], meters: ["4/4"], tuneHand: "left" as const };
    for (let i = 0; i < 20; i++) {
      const ex = generatePianoExercise({ settings });
      expect(ex.tuneHand).toBe("left");
      expect(["block", "blockBeats"]).toContain(ex.pattern);
      for (const n of ex.rh) for (const p of n.pitches) expect(p).toBeGreaterThanOrEqual(14);
      for (const n of ex.lh) for (const p of n.pitches) {
        expect(p).toBeGreaterThanOrEqual(7);
        expect(p).toBeLessThanOrEqual(12);
      }
      expect(pianoFault(ex, 32)).toBeNull();
    }
    // Hands taking turns keep the tune in the right hand to start.
    expect(generatePianoExercise({ settings: { ...settings, together: false } }).tuneHand).toBe("right");
  } finally {
    Object.assign(console, quiet);
  }
});

test("minor keys raise the leading tone, and a passing note under it is raised too: no augmented second", () => {
  const quiet = { log: console.log, warn: console.warn };
  Object.assign(console, { log() {}, warn() {} });
  try {
    let sharps = 0;
    for (let i = 0; i < 20; i++) {
      const ex = generatePianoExercise({ levelId: "piano-07", key: "Am", meter: "4/4" });
      // In A minor the only accidentals are sharps (G sharp, and F sharp before it).
      expect(ex.abc).not.toMatch(/_[A-Ga-g]/);
      sharps += (ex.abc.match(/\^G|\^g/g) ?? []).length;
    }
    expect(sharps).toBeGreaterThan(0);
  } finally {
    Object.assign(console, quiet);
  }
});

test("an accidental is written once a bar for its pitch, and the natural written back", () => {
  const n = (p: number, a = 0) => ({ pitches: [p], length: 8, alters: a ? [a] : undefined });
  // A minor: G# twice in a bar (written once), then G natural in the next bar (no sign: the bar line cancels).
  expect(beamed([n(18, 1), n(18, 1), n(18), n(19)], 16, "Am")).toBe("^G8 G8 =G8 A8");
});

test("each option is marked with the first level that uses it", () => {
  expect(unlockedAt((s) => s.together)).toBe(3);
  expect(unlockedAt((s) => s.keys.includes("Am"))).toBe(5);
  expect(unlockedAt((s) => s.patterns.includes("albertiSixteenths"))).toBe(10);
  expect(unlockedAt((s) => s.meters.includes("6/8"))).toBe(9);
});

test("a level's address carries only what was changed, and opens as it was left", () => {
  expect(settingsQuery("piano-05", settingsFor("piano-05"))).toBe("level=piano-05");
  const changed = { ...settingsFor("piano-05"), keys: ["D", "Bm"], patterns: ["alberti" as const], dynamics: false, bpm: 90 };
  const q = settingsQuery("piano-05", changed);
  expect(settingsFromQuery(q)).toEqual({ levelId: "piano-05", settings: changed });
});

import { expectedNotes, gradeInTime, midiOf, NoteByNote, onsetGroups } from "../../src/lib/piano/grade-piano";

test("pitches become MIDI with the key's and their own accidentals", () => {
  expect(midiOf("C", 14)).toBe(60); // middle C
  expect(midiOf("C", 7)).toBe(48); // C3
  expect(midiOf("G", 17)).toBe(66); // F sharp in G
  expect(midiOf("Am", 18, 1)).toBe(68); // G sharp, raised
  expect(midiOf("Bb", 20)).toBe(70); // B flat in B flat
});

test("graded in time: a note on time, one late, one missed, a wrong key and an extra", () => {
  // 4/4 at 60: a beat is 1000 ms, 8 units.
  const ex = {
    key: "C",
    rh: [{ pitches: [14], length: 8 }, { pitches: [15], length: 8 }, { pitches: [16], length: 8 }, { pitches: [17], length: 8 }],
    lh: [{ pitches: [7, 9, 11], length: 32 }],
  };
  const expected = expectedNotes(ex);
  expect(expected.length).toBe(7);
  expect(onsetGroups(expected).map((g) => g.notes.length)).toEqual([4, 1, 1, 1]);
  const t0 = 10_000;
  const played = [
    { midi: 60, t: t0 + 20 }, { midi: 48, t: t0 }, { midi: 52, t: t0 + 10 }, { midi: 55, t: t0 + 5 }, // beat 1, right
    { midi: 62, t: t0 + 1000 + 300 }, // D 0.3 beats late
    // E (beat 3) missed: F pressed in its place
    { midi: 65, t: t0 + 2000 },
    { midi: 65, t: t0 + 3000 }, // F on time
  ];
  const r = gradeInTime(expected, played, { t0, bpm: 60, beatUnits: 8, strictness: "standard" });
  const v = (m: number) => r.notes.find((n) => n.midi === m)!;
  expect(v(60).verdict).toBe("right");
  expect(v(62).verdict).toBe("late");
  expect(v(62).credit).toBeGreaterThan(0);
  expect(v(64).verdict).toBe("missed");
  expect(v(64).playedInstead).toBe(65);
  expect(v(65).verdict).toBe("right");
  expect(r.extras.map((k) => k.midi)).toEqual([65]);
  expect(r.notesScore).toBe(86); // 6 of 7
  expect(r.byHand.lh).toEqual({ notes: 3, right: 3 });
});

test("note by note waits on each moment, a chord's notes in any order, and counts a wrong key against the moment", () => {
  const ex = { key: "C", rh: [{ pitches: [14], length: 16 }, { pitches: [16], length: 16 }], lh: [{ pitches: [7, 11], length: 32 }] };
  const g = new NoteByNote(expectedNotes(ex));
  expect(g.press(55)).toBe("note"); // the left hand's G
  expect(g.press(62)).toBe("wrong");
  expect(g.press(48)).toBe("note");
  expect(g.press(60)).toBe("moment");
  expect(g.press(64)).toBe("finished");
  expect(g.done.map((m) => m.wrong)).toEqual([[62], []]);
  expect(g.score).toBe(50);
});
