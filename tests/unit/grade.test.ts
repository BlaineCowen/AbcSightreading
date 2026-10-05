import { describe, expect, test } from "bun:test";
import {
  CENTS_MAX,
  FIND_MAX,
  HELP_KEY_COST,
  HELP_NOTE_CAP,
  MAX_LOSS,
  CREDIT_MS,
  MIN_CREDIT_MS,
  creditMsFor,
  noteMsFor,
  guidance,
  solfegeOf,
  centsOffAnyOctave,
  gradeNotes,
  holdCents,
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
    expect(noteScore({ findBeats: 0, cents: -30, help: none })).toBe(90);
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
  test("credit comes quickly; the cursor waits out the written length", () => {
    expect(noteMsFor(1, 60)).toBe(1000);
    expect(creditMsFor(1, 60)).toBe(CREDIT_MS);
    expect(creditMsFor(4, 60)).toBe(CREDIT_MS);
    expect(creditMsFor(0.5, 200)).toBe(Math.max(MIN_CREDIT_MS, 150 * 0.8));
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
    expect(guidance({ sung: 69.7, target: 69, doPc: F, onTarget: false })).toBe("Close: a little high for mi");
    expect(guidance({ sung: 68.4, target: 69, doPc: F, onTarget: false })).toBe("Close: a little low for mi");
    expect(guidance({ sung: 69.1, target: 69, doPc: F, onTarget: true })).toBe("That's it, hold it");
    expect(guidance({ sung: null, target: 69, doPc: F, onTarget: false })).toBe("Sing mi");
  });
});

import {
  STRICTNESS,
  gradePerformance,
  gradeSchedule,
  stepsBetween,
} from "../../src/lib/grade";
import type { HistoryPoint } from "../../src/lib/tuner/pitch-history";

describe("the schedule, for grading in time", () => {
  test("each note's start and length in 32nds, rests between counted, rests in a row joined", () => {
    const s = gradeSchedule(abc("C8 D8 z8 E8 | z4 z4 F8 G16 |"));
    expect(s.notes.map((n) => [n.midi, n.startUnits, n.lengthUnits])).toEqual([[60, 0, 8], [62, 8, 8], [64, 24, 8], [65, 40, 8], [67, 48, 16]]);
    expect(s.rests.map((r) => [r.startUnits, r.lengthUnits])).toEqual([[16, 8], [32, 8]]);
    expect(s.totalUnits).toBe(64);
  });
  test("a tie lengthens the note", () => {
    expect(gradeSchedule(abc("C24 D8- | D16 E16 |")).notes.map((n) => [n.startUnits, n.lengthUnits])).toEqual([[0, 24], [24, 24], [48, 16]]);
  });
});

/**
 * A singer, frame by frame (every 20 ms): each sung span is a pitch (MIDI,
 * fractions for cents) from one time to another; silence in between. A short
 * gap before each span stands for the breath or consonant that starts a note.
 */
function sing(spans: { midi: number; from: number; to: number }[], end: number): HistoryPoint[] {
  const out: HistoryPoint[] = [];
  for (let t = -500; t <= end; t += 20) {
    const s = spans.find((x) => t >= x.from && t < x.to - 30);
    const midi = s ? Math.round(s.midi) : null;
    out.push({ t, midi, cents: s ? Math.round((s.midi - Math.round(s.midi)) * 100) : 0, dbfs: s ? -12 : -60 });
  }
  return out;
}
const BEAT = 1000; // 60 BPM
/** The schedule sung as written: every note on time and in tune. */
const asWritten = (notes: { midi: number; startUnits: number; lengthUnits: number }[]) =>
  notes.map((n) => ({ midi: n.midi, from: (n.startUnits / 8) * BEAT, to: ((n.startUnits + n.lengthUnits) / 8) * BEAT }));
const run = (sched: ReturnType<typeof gradeSchedule>, spans: { midi: number; from: number; to: number }[], strictness: "easy" | "standard" | "strict" = "standard") =>
  gradePerformance(sched, sing(spans, (sched.totalUnits / 8) * BEAT + 500), { t0: 0, bpm: 60, beatUnits: 8, strictness, latencyMs: 0 });

describe("grading in time (Pitch & rhythm)", () => {
  const sched = gradeSchedule(abc("C8 D8 E8 F8 | G16 E16 |"));

  test("sung as written: full marks for pitch and rhythm", () => {
    const r = run(sched, asWritten(sched.notes));
    expect(r.pitch).toBe(100);
    expect(r.rhythm).toBe(100);
    expect(r.letter).toBe("A");
    expect(r.notes.every((n) => n.pitchOk && !n.missed && !n.cutShort)).toBe(true);
  });

  test("a note a whole step off: no pitch credit for it, and what was sung is kept", () => {
    const spans = asWritten(sched.notes);
    spans[2] = { ...spans[2], midi: 62 }; // re where mi is written
    const r = run(sched, spans);
    expect(r.notes[2].pitchOk).toBe(false);
    expect(r.notes[2].pitch).toBe(0);
    expect(r.notes[2].sung).toBeCloseTo(62, 0);
    expect(r.notes[2].rhythm).toBe(100); // on time, though wrong
    expect(r.pitch).toBeLessThan(100);
  });

  test("an octave down is the note", () => {
    const r = run(sched, asWritten(sched.notes).map((s) => ({ ...s, midi: s.midi - 12 })));
    expect(r.pitch).toBe(100);
    expect(r.notes[0].sung).toBeCloseTo(60, 0);
  });

  test("a note a third of a beat late: partial at Standard, full at Easy", () => {
    const spans = asWritten(sched.notes);
    spans[1] = { ...spans[1], from: spans[1].from + 330 };
    spans[0] = { ...spans[0], to: spans[0].to + 330 };
    const std = run(sched, spans, "standard").notes[1];
    expect(std.onsetBeats).toBeCloseTo(0.33, 1);
    expect(std.rhythm).toBeGreaterThan(0);
    expect(std.rhythm).toBeLessThan(100);
    expect(run(sched, spans, "easy").notes[1].rhythm).toBe(100);
    expect(run(sched, spans, "strict").notes[1].rhythm).toBeLessThan(std.rhythm);
  });

  test("a missed note scores nothing for pitch or rhythm", () => {
    const spans = asWritten(sched.notes).filter((_, i) => i !== 3);
    const r = run(sched, spans);
    expect(r.notes[3]).toMatchObject({ missed: true, pitch: 0, rhythm: 0, sung: null });
  });

  test("a held note let go early is cut short", () => {
    const spans = asWritten(sched.notes);
    spans[4] = { ...spans[4], to: spans[4].from + 600 }; // a half note sung for 0.6 of a beat
    const r = run(sched, spans);
    expect(r.notes[4].cutShort).toBe(true);
    expect(r.notes[4].rhythm).toBe(100 - 25);
    expect(r.notes[4].pitchOk).toBe(true);
  });

  test("singing through a rest is a rhythm fault", () => {
    const withRest = gradeSchedule(abc("C8 D8 z8 E8 |"));
    const spans = asWritten(withRest.notes);
    spans[1] = { ...spans[1], to: spans[1].to + 900 }; // re held across the rest
    const r = run(withRest, spans);
    expect(r.rests[0].sung).toBe(true);
    expect(r.rhythm).toBeLessThan(run(withRest, asWritten(withRest.notes)).rhythm);
  });

  test("intonation: a little flat costs nothing at Easy, something at Strict", () => {
    const flat = asWritten(sched.notes).map((s) => ({ ...s, midi: s.midi - 0.22 }));
    expect(run(sched, flat, "easy").pitch).toBe(100);
    expect(run(sched, flat, "strict").pitch).toBeLessThan(100);
    expect(run(sched, flat, "strict").pitch).toBeGreaterThan(80);
  });

  test("a repeated note sung legato keeps its rhythm credit", () => {
    const rep = gradeSchedule(abc("C8 C8 D16 |"));
    const spans = [{ midi: 60, from: 0, to: 2000 }, { midi: 62, from: 2000, to: 4000 }];
    const r = run(rep, spans);
    expect(r.notes[1].rhythm).toBe(100);
  });

  test("the strictness levels get stricter", () => {
    const [e, s, x] = [STRICTNESS.easy, STRICTNESS.standard, STRICTNESS.strict];
    expect(e.cents > s.cents && s.cents > x.cents).toBe(true);
    expect(e.onsetBeats > s.onsetBeats && s.onsetBeats > x.onsetBeats).toBe(true);
  });
});

describe("drawing what was sung on the staff", () => {
  test("staff steps between two notes in the key", () => {
    expect(stepsBetween(64, 60, 0)).toBe(2); // C to E in C: a third, two steps
    expect(stepsBetween(72, 60, 0)).toBe(7); // an octave
    expect(stepsBetween(59, 60, 0)).toBe(-1); // ti below do
    expect(stepsBetween(61, 60, 0)).toBe(0.5); // a chromatic note sits between
    expect(stepsBetween(64, 62, 2)).toBe(1); // in D: re (E) a step above do (D)
    expect(stepsBetween(66, 62, 2)).toBe(2); // and mi (F#) on its own line, two steps up
    expect(stepsBetween(60.5, 60, 0)).toBeCloseTo(0.25, 5); // a quarter tone sharp: halfway to di, itself halfway to re
  });
});
