import { describe, expect, test } from "bun:test";
import { letterSteps, movedFifths, transposePitch, transposeScore } from "../../src/lib/pieces/transpose";
import { midiOfPitch, type PieceScore, type Pitch } from "../../src/lib/pieces/model";

const P = (step: Pitch["step"], alter: number, octave: number): Pitch => ({ step, alter, octave });

describe("moving a piece into another key", () => {
  test("the key: fewer accidentals, F sharp at six", () => {
    expect(movedFifths(1, -2)).toBe(-1); // E minor down two: D minor
    expect(movedFifths(0, 2)).toBe(2); // C up two: D
    expect(movedFifths(0, 1)).toBe(-5); // C up one: D flat, not C sharp
    expect(movedFifths(0, 6)).toBe(6); // C up six: F sharp
    expect(movedFifths(-1, -2)).toBe(-3); // F down two: E flat
    for (let f = -7; f <= 7; f++) for (let s = -6; s <= 6; s++) {
      const m = movedFifths(f, s);
      expect(m).toBeGreaterThanOrEqual(-5);
      expect(m).toBeLessThanOrEqual(6);
    }
  });

  test("letter steps follow the tonic, in the direction moved", () => {
    expect(letterSteps({ fifths: 1, mode: "minor" }, -2)).toBe(-1); // E to D
    expect(letterSteps({ fifths: 0, mode: "major" }, 2)).toBe(1); // C to D
    expect(letterSteps({ fifths: 0, mode: "major" }, 1)).toBe(1); // C to D flat
    expect(letterSteps({ fifths: 0, mode: "major" }, -1)).toBe(-1); // C to B
    expect(letterSteps({ fifths: 0, mode: "major" }, 0)).toBe(0);
  });

  test("notes are spelled as the new key spells them", () => {
    // E minor down two: F sharp becomes E, B becomes A.
    expect(transposePitch(P("F", 1, 4), -1, -2)).toEqual(P("E", 0, 4));
    expect(transposePitch(P("B", 0, 4), -1, -2)).toEqual(P("A", 0, 4));
    // C up one: C becomes D flat; a chromatic B flat becomes C flat.
    expect(transposePitch(P("C", 0, 4), 1, 1)).toEqual(P("D", -1, 4));
    expect(transposePitch(P("B", -1, 4), 1, 1)).toEqual(P("C", -1, 5));
    // Across the octave: B up two in C (to D) is C sharp.
    expect(transposePitch(P("B", 0, 3), 1, 2)).toEqual(P("C", 1, 4));
  });

  test("every note sounds exactly the semitones moved, any key, any shift", () => {
    const chromatic: Pitch[] = [];
    for (const step of ["C", "D", "E", "F", "G", "A", "B"] as const) for (const alter of [-1, 0, 1]) chromatic.push(P(step, alter, 4));
    for (let f = -6; f <= 6; f++) for (const mode of ["major", "minor"] as const) for (let s = -6; s <= 6; s++) {
      const steps = letterSteps({ fifths: f, mode }, s);
      for (const p of chromatic) {
        const q = transposePitch(p, steps, s);
        expect(midiOfPitch(q)).toBe(midiOfPitch(p) + s);
        expect(Math.abs(q.alter)).toBeLessThanOrEqual(2);
      }
    }
  });

  test("a score: keys and notes move, rests and structure stay", () => {
    const score = {
      version: 1, title: "t", warnings: [], measures: [],
      parts: [{
        id: "P1", name: "S", program: 0, transpose: 0, staves: 1, clefs: [],
        keys: [{ measure: 0, fifths: 1, mode: "minor" }, { measure: 4, fifths: 4, mode: "major" }],
        notes: [
          { measure: 0, staff: 1, voice: "1", start: 0, length: 48, rest: false, written: P("F", 1, 4), midi: 66 },
          { measure: 0, staff: 1, voice: "1", start: 48, length: 48, rest: true },
        ],
      }],
    } as unknown as PieceScore;
    const t = transposeScore(score, -2);
    expect(t.parts[0].keys.map((k) => k.fifths)).toEqual([-1, 2]);
    expect(t.parts[0].notes[0].written).toEqual(P("E", 0, 4));
    expect(t.parts[0].notes[0].midi).toBe(64);
    expect(t.parts[0].notes[1]).toEqual(score.parts[0].notes[1]);
    expect(transposeScore(score, 0)).toBe(score);
  });
});
