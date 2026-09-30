import { describe, expect, test } from "bun:test";
import {
  CENTS_MAX,
  FIND_MAX,
  HELP_KEY_COST,
  HELP_NOTE_CAP,
  MAX_LOSS,
  MAX_HOLD_MS,
  MIN_HOLD_MS,
  guidance,
  solfegeOf,
  centsOffAnyOctave,
  gradeNotes,
  holdCents,
  holdMsFor,
  letterFor,
  noteScore,
  summarize,
  type NoteResult,
} from "../../src/lib/grade";

const abc = (body: string, key = "C") => `X:1\nM:4/4\nL:1/32\nK:${key}\n${body}\n`;
const none = { heardNote: false, heardKey: false };

describe("the notes to sing", () => {
  test("pitches, lengths in beats, and each note's place among the notes and rests", () => {
    const notes = gradeNotes(abc("C8 D8 z8 E8 |"));
    expect(notes.map((n) => n.midi)).toEqual([60, 62, 64]);
    expect(notes.map((n) => n.beats)).toEqual([1, 1, 1]);
    // The rest is the third element, so E is the fourth.
    expect(notes.map((n) => n.cursor)).toEqual([0, 1, 3]);
  });
  test("a tied note is one held note, across the barline", () => {
    const notes = gradeNotes(abc("C24 D8- | D16 E16 |"));
    expect(notes.map((n) => [n.midi, n.beats])).toEqual([[60, 3], [62, 3], [64, 2]]);
  });
  test("the key signature and accidentals", () => {
    expect(gradeNotes(abc("B8 ^C8 =B8 z8 |", "F")).map((n) => n.midi)).toEqual([70, 61, 71]);
  });
  test("the playback transposition", () => {
    expect(gradeNotes(abc("C8 D8 E8 F8 |"), -2).map((n) => n.midi)).toEqual([58, 60, 62, 63]);
  });
});

describe("any octave counts", () => {
  test("the same pitch class an octave or two away is in tune", () => {
    expect(centsOffAnyOctave(48, 60)).toBe(0);
    expect(centsOffAnyOctave(72.2, 60)).toBeCloseTo(20);
    expect(centsOffAnyOctave(59.7, 60)).toBeCloseTo(-30);
  });
  test("folded into -600..600", () => {
    expect(centsOffAnyOctave(67, 60)).toBe(-500);
    expect(centsOffAnyOctave(65, 60)).toBe(500);
  });
  test("the hold's median, from the pitch history, in any octave", () => {
    const pts = [0, 1, 2, 3, 4].map((i) => ({ t: 100 + i * 10, midi: 48, cents: [10, 12, 8, 30, 11][i], dbfs: -20 }));
    expect(holdCents(pts, 60, 100, 200)).toBe(11);
    expect(holdCents(pts, 60, 500, 600)).toBeNull();
  });
});

describe("a note's score", () => {
  test("found at once and in tune is 100", () => {
    expect(noteScore({ findBeats: 0.5, cents: 10, help: none })).toBe(100);
  });
  test("time to find: free for a beat, then points per beat, capped", () => {
    expect(noteScore({ findBeats: 2, cents: 0, help: none })).toBe(75);
    expect(noteScore({ findBeats: 30, cents: 0, help: none })).toBe(100 - FIND_MAX);
  });
  test("intonation: free near the target, then a point a cent, capped", () => {
    expect(noteScore({ findBeats: 0, cents: -25, help: none })).toBe(90);
    expect(noteScore({ findBeats: 0, cents: 200, help: none })).toBe(100 - CENTS_MAX);
  });
  test("help: hearing the note caps it; the key costs a little", () => {
    expect(noteScore({ findBeats: 0, cents: 0, help: { heardNote: true, heardKey: false } })).toBe(HELP_NOTE_CAP);
    expect(noteScore({ findBeats: 0, cents: 0, help: { heardNote: false, heardKey: true } })).toBe(100 - HELP_KEY_COST);
  });
  test("no note loses more than the limit, and a skip loses exactly that", () => {
    expect(noteScore({ findBeats: 30, cents: 200, help: { heardNote: true, heardKey: true } })).toBe(100 - MAX_LOSS);
    expect(noteScore({ findBeats: null, cents: null, help: none, skipped: true })).toBe(100 - MAX_LOSS);
  });
});

describe("the exercise's score", () => {
  const r = (score: number): NoteResult => ({ midi: 60, findBeats: 0, cents: 0, help: none, skipped: false, score });
  test("the average of its notes, with a letter", () => {
    expect(summarize([r(100), r(80)])).toMatchObject({ score: 90, letter: "A" });
    expect(summarize([r(100), r(100), r(40)]).score).toBe(80);
  });
  test("letter boundaries", () => {
    expect([95, 90, 89, 80, 70, 60, 59].map(letterFor)).toEqual(["A", "A", "B", "B", "C", "D", "F"]);
  });
  test("the hold: half the written length, within detection's floor and a ceiling", () => {
    expect(holdMsFor(1, 60)).toBe(500);
    expect(holdMsFor(0.5, 60)).toBe(250);
    expect(holdMsFor(0.5, 200)).toBe(MIN_HOLD_MS);
    expect(holdMsFor(4, 60)).toBe(MAX_HOLD_MS);
  });
});

describe("what the card says", () => {
  // F major: do is F (pitch class 5).
  const F = 5;
  test("solfege in the exercise's key", () => {
    expect([65, 67, 69, 72, 64].map((m) => solfegeOf(m, F))).toEqual(["do", "re", "mi", "so", "ti"]);
  });
  test("the note sung, and which way and how far to the one asked for", () => {
    expect(guidance({ sung: 67, target: 69, doPc: F, onTarget: false })).toBe("You're singing re. Go up a step to mi");
    expect(guidance({ sung: 72, target: 69, doPc: F, onTarget: false })).toBe("You're singing so. Go down a third to mi");
    expect(guidance({ sung: 55, target: 69, doPc: F, onTarget: false })).toBe("You're singing re. Go up a step to mi"); // any octave
  });
  test("close, on it, or nothing heard", () => {
    expect(guidance({ sung: 69.6, target: 69, doPc: F, onTarget: false })).toBe("Close: a little high for mi");
    expect(guidance({ sung: 68.4, target: 69, doPc: F, onTarget: false })).toBe("Close: a little low for mi");
    expect(guidance({ sung: 69.1, target: 69, doPc: F, onTarget: true })).toBe("That's it, hold it");
    expect(guidance({ sung: null, target: 69, doPc: F, onTarget: false })).toBe("Sing mi");
  });
});
