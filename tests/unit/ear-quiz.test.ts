import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import {
  INTERVAL_LEVELS, KEY_NAMES, QUIZ_LENGTH, REFERENCE_NOTES, intervalMinSeconds, solfegeMinSeconds, SOLFEGE_LEVELS, checkIntervalSetup, checkSolfegeSetup, intervalChoices, intervalName, intervalRound, nameOf, pcOf, solfegeNotes, solfegeRound, spell, type SolfegeSetup,
} from "../../src/lib/games/ear-quiz";
import { GAME_PASS, gameRoundPoints } from "../../src/lib/points";

const setup = (o: Partial<SolfegeSetup> = {}): SolfegeSetup => checkSolfegeSetup({ tonality: "major", level: 1, nameAs: "solfege", ...o });

describe("solfegeRound", () => {
  test("the same seed and setup deal the same round (the server marks what the browser played)", () => {
    const s = setup({ level: 5 });
    expect(solfegeRound(s, 1234)).toEqual(solfegeRound(s, 1234));
    expect(solfegeRound(s, 1234)).not.toEqual(solfegeRound(s, 1235));
  });

  // Property: for every level, both tonalities and any seed, a round has QUIZ_LENGTH
  // notes, all from the level, never the same pitch class twice running, inside 53..79,
  // and its choices are exactly the level's pitch classes.
  test("every round keeps to its level, its range, and no note twice running", () => {
    const levels = (["major", "minor"] as const).flatMap((t) => SOLFEGE_LEVELS[t].map((_, i) => ({ t, level: i + 1 })));
    fc.assert(
      fc.property(fc.constantFrom(...levels), fc.integer({ min: 0, max: 2 ** 31 - 1 }), ({ t, level }, seed) => {
        const s = setup({ tonality: t, level });
        const notes = solfegeNotes(s);
        const r = solfegeRound(s, seed);
        expect(r.questions).toHaveLength(QUIZ_LENGTH);
        for (const [i, q] of r.questions.entries()) {
          expect(notes).toContain(q);
          expect(r.tonic + q).toBeGreaterThanOrEqual(53);
          expect(r.tonic + q).toBeLessThanOrEqual(79);
          if (i) expect(pcOf(q)).not.toBe(pcOf(r.questions[i - 1]!));
        }
        expect(r.choices).toEqual([...new Set(notes.map(pcOf))].sort((a, b) => a - b));
      }),
      { numRuns: 400 },
    );
  });

  test("every note of a small level comes up in a round", () => {
    const r = solfegeRound(setup({ level: 1 }), 99);
    expect(new Set(r.questions.map(pcOf))).toEqual(new Set([0, 4, 7]));
  });
});

describe("checkSolfegeSetup", () => {
  test("anything sent is made safe", () => {
    expect(checkSolfegeSetup(null)).toEqual({ tonality: "major", level: 1, nameAs: "solfege", minorAs: "la", ref: 0, key: null, anyOctave: false });
    expect(checkSolfegeSetup({ level: 99, nameAs: "x", tonality: "minor", minorAs: "do" }).level).toBe(1);
    expect(checkSolfegeSetup({ level: 0, notes: [0, 4, 4, 99, "x", -7] }).notes).toEqual([-7, 0, 4]);
  });
  test("Custom with one note to tell apart is level 1", () => {
    expect(checkSolfegeSetup({ level: 0, notes: [0, 12] }).level).toBe(1);
  });
});

describe("names", () => {
  test("spelled from the tonic's name", () => {
    expect(spell("D", 4)).toBe("F♯");
    expect(spell("Bb", 5)).toBe("E♭");
    expect(spell("F", 10)).toBe("E♭");
    expect(spell("A", 3)).toBe("C");
    expect(spell("Eb", 9)).toBe("C");
    expect(spell("C", 6)).toBe("F♯");
    expect(spell("A", 11)).toBe("G♯");
  });
  test("each naming", () => {
    const r = { tonicName: "A" };
    const minor = (o: Partial<SolfegeSetup>) => setup({ tonality: "minor", level: 7, ...o });
    expect([0, 2, 3, 7, 11].map((pc) => nameOf(minor({}), r, pc))).toEqual(["la", "ti", "do", "mi", "si"]);
    expect([0, 3, 8, 10, 11].map((pc) => nameOf(minor({ minorAs: "do" }), r, pc))).toEqual(["do", "me", "le", "te", "ti"]);
    expect([0, 3, 11].map((pc) => nameOf(minor({ nameAs: "numbers" }), r, pc))).toEqual(["1", "3", "♯7"]);
    expect([0, 3, 11].map((pc) => nameOf(minor({ nameAs: "letters" }), r, pc))).toEqual(["A", "C", "G♯"]);
    expect([0, 4, 7].map((pc) => nameOf(setup({ nameAs: "fixed" }), { tonicName: "D" }, pc))).toEqual(["re", "fa♯", "la"]);
    expect([0, 4, 7].map((pc) => nameOf(setup({ nameAs: "fixed" }), { tonicName: "G" }, pc))).toEqual(["sol", "ti", "re"]);
    expect([1, 3, 6, 8, 10].map((pc) => nameOf(setup({ level: 8 }), r, pc))).toEqual(["di", "me", "fi", "le", "te"]);
  });
});

describe("gameRoundPoints", () => {
  const base = { total: 10, below: false, custom: false, factor: 1 };
  test("a point a right answer, 5 more for all right, nothing under the pass", () => {
    expect(gameRoundPoints({ ...base, correct: GAME_PASS - 1 })).toBe(0);
    expect(gameRoundPoints({ ...base, correct: 7 })).toBe(7);
    expect(gameRoundPoints({ ...base, correct: 10 })).toBe(15);
  });
  test("half below the student's level or on Custom; the repeat factor", () => {
    expect(gameRoundPoints({ ...base, correct: 10, below: true })).toBe(8);
    expect(gameRoundPoints({ ...base, correct: 8, custom: true })).toBe(4);
    expect(gameRoundPoints({ ...base, correct: 8, factor: 0.25 })).toBe(2);
    expect(gameRoundPoints({ ...base, correct: 10, factor: 0 })).toBe(0);
  });
});

describe("intervalRound", () => {
  // Property: every level and direction, any seed: ten questions whose notes are
  // the answer apart (semitones levels) or the answer's size apart in a major scale
  // (sizes levels), in range, in the direction asked, never the same answer twice running.
  test("every round is what its level and direction ask", () => {
    const levels = INTERVAL_LEVELS.map((_, i) => i + 1);
    fc.assert(
      fc.property(fc.constantFrom(...levels), fc.constantFrom("up", "down", "both", "together"), fc.integer({ min: 0, max: 2 ** 31 - 1 }), (level, direction, seed) => {
        const s = checkIntervalSetup({ level, direction });
        const { sizes, values } = intervalChoices(s);
        const r = intervalRound(s, seed);
        expect(r.questions).toHaveLength(QUIZ_LENGTH);
        for (const [i, q] of r.questions.entries()) {
          expect(values).toContain(q.answer);
          expect(Math.min(q.from, q.to)).toBeGreaterThanOrEqual(52);
          expect(Math.max(q.from, q.to)).toBeLessThanOrEqual(81);
          const span = Math.abs(q.to - q.from);
          if (sizes) {
            // A diatonic size: a 2nd is 1 or 2 semitones, a 3rd 3 or 4, ... an octave 12.
            const ranges: Record<number, number[]> = { 2: [1, 2], 3: [3, 4], 4: [5, 6], 5: [6, 7], 6: [8, 9], 7: [10, 11], 8: [12] };
            expect(ranges[q.answer]).toContain(span);
          } else expect(span).toBe(q.answer);
          if (direction === "up") expect(q.to).toBeGreaterThan(q.from);
          if (direction === "down") expect(q.to).toBeLessThan(q.from);
          if (direction === "together") expect(q.to).toBeGreaterThan(q.from);
          if (i) expect(q.answer).not.toBe(r.questions[i - 1]!.answer);
        }
        expect(intervalRound(s, seed)).toEqual(r);
      }),
      { numRuns: 400 },
    );
  });
  test("names", () => {
    expect(intervalName(checkIntervalSetup({ level: 1 }), 2)).toBe("Step (2nd)");
    expect(intervalName(checkIntervalSetup({ level: 2 }), 5)).toBe("5th");
    expect(intervalName(checkIntervalSetup({ level: 7 }), 6)).toBe("Tritone");
    expect(checkIntervalSetup({ level: 0, semis: [7, 5, 5, 40] })).toEqual({ level: 0, semis: [5, 7], direction: "up", sameKey: false });
    expect(checkIntervalSetup({ level: 0, semis: [7] }).level).toBe(1);
  });
});

// 18 November 2026 (Blaine): the note before each question, a fixed key, any octave; intervals in one key.
describe("the new options", () => {
  test("a setup saved before them reads the same: tonicFirst false is no note first, true is do", () => {
    expect(checkSolfegeSetup({ tonicFirst: false }).ref).toBe(null);
    expect(checkSolfegeSetup({ tonicFirst: true }).ref).toBe(0);
    expect(checkSolfegeSetup({ ref: 7 }).ref).toBe(7);
    expect(checkSolfegeSetup({ ref: 7, tonicFirst: false }).ref).toBe(7);
    // A reference the tonality has no such note for is do.
    expect(checkSolfegeSetup({ tonality: "minor", ref: 9 }).ref).toBe(0);
    expect(checkSolfegeSetup({ key: "Q" }).key).toBe(null);
  });
  test("no note first is the faster floor, as before", () => {
    expect(solfegeMinSeconds(setup({ ref: null }))).toBeLessThan(solfegeMinSeconds(setup({ ref: 4 })));
    expect(solfegeMinSeconds(setup({ ref: 4 }))).toBe(solfegeMinSeconds(setup({ ref: 0 })));
  });

  // Property: a fixed key is the round's key, every time, at every level.
  test("a chosen key is kept", () => {
    const levels = (["major", "minor"] as const).flatMap((t) => SOLFEGE_LEVELS[t].map((_, i) => ({ t, level: i + 1 })));
    fc.assert(
      fc.property(fc.constantFrom(...levels), fc.constantFrom(...KEY_NAMES), fc.integer({ min: 0, max: 2 ** 31 - 1 }), ({ t, level }, key, seed) => {
        const r = solfegeRound(setup({ tonality: t, level, key }), seed);
        expect(r.tonicName).toBe(key);
      }),
      { numRuns: 300 },
    );
  });

  // Property: any octave keeps each note's name (its pitch class), its range and no repeat running.
  test("any octave moves a note by octaves only, inside 53..79", () => {
    const levels = (["major", "minor"] as const).flatMap((t) => SOLFEGE_LEVELS[t].map((_, i) => ({ t, level: i + 1 })));
    fc.assert(
      fc.property(fc.constantFrom(...levels), fc.integer({ min: 0, max: 2 ** 31 - 1 }), ({ t, level }, seed) => {
        const s = setup({ tonality: t, level, anyOctave: true });
        const pcs = new Set(solfegeNotes(s).map(pcOf));
        const r = solfegeRound(s, seed);
        for (const [i, q] of r.questions.entries()) {
          expect(pcs.has(pcOf(q))).toBe(true);
          expect(r.tonic + q).toBeGreaterThanOrEqual(53);
          expect(r.tonic + q).toBeLessThanOrEqual(79);
          if (i) expect(pcOf(q)).not.toBe(pcOf(r.questions[i - 1]!));
        }
      }),
      { numRuns: 300 },
    );
  });
  test("over many rounds any octave does move notes", () => {
    const moved = Array.from({ length: 50 }, (_, seed) => solfegeRound(setup({ level: 3, anyOctave: true }), seed)).some((r) =>
      r.questions.some((q) => !solfegeNotes(setup({ level: 3 })).includes(q)),
    );
    expect(moved).toBe(true);
  });

  // Property: in one key, every note of every question is in that key's major scale, at every level and direction.
  test("intervals in one key keep every note in the key", () => {
    const levels = [...INTERVAL_LEVELS.map((_, i) => i + 1), 0];
    fc.assert(
      fc.property(
        fc.constantFrom(...levels), fc.constantFrom("up", "down", "both", "together"), fc.integer({ min: 0, max: 2 ** 31 - 1 }),
        (level, direction, seed) => {
          const s = checkIntervalSetup({ level, semis: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], direction, sameKey: true });
          const r = intervalRound(s, seed);
          expect(r.tonic).not.toBe(null);
          const major = [0, 2, 4, 5, 7, 9, 11];
          for (const q of r.questions) {
            expect(major).toContain(pcOf(q.from - r.tonic!));
            expect(major).toContain(pcOf(q.to - r.tonic!));
          }
        },
      ),
      { numRuns: 400 },
    );
  });
  test("one key plays the key first, so its floor is longer", () => {
    expect(intervalMinSeconds(checkIntervalSetup({ sameKey: true }))).toBeGreaterThan(intervalMinSeconds(checkIntervalSetup({})));
    expect(REFERENCE_NOTES.major).toEqual([0, 4, 7, 9]);
  });
});
