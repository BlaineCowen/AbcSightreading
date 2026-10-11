import { describe, expect, test } from "bun:test";
import { averageOf, checkExerciseAttempt, clapMarksOf, gradeOf, gradebookCsv } from "../../src/lib/gradebook";
import { checkAttemptResult } from "../../src/lib/pieces/attempts";
import type { ClapResult } from "../../src/lib/grade-rhythm";

describe("a cell's grade", () => {
  test("the best graded attempt, even with minutes short", () => {
    expect(gradeOf({ minutes: 20 }, { best: 84, attempts: 3, percent: 40, seconds: 480 })).toEqual({ grade: 84, from: "attempt", attempts: 3 });
  });
  test("a best of 0 is a grade, not nothing", () => {
    expect(gradeOf({ minutes: 0 }, { best: 0, attempts: 1, percent: 0, seconds: 0 }).grade).toBe(0);
  });
  test("nothing graded: the share of the minutes, once started", () => {
    expect(gradeOf({ minutes: 15 }, { best: null, attempts: 0, percent: 60, seconds: 540 })).toEqual({ grade: 60, from: "time", attempts: 0 });
  });
  test("not started is blank, never a zero", () => {
    expect(gradeOf({ minutes: 15 }, { percent: 0, seconds: 0 }).grade).toBeNull();
    expect(gradeOf({ minutes: 0 }, { best: null, attempts: 2, percent: 0, seconds: 300 }).grade).toBeNull();
  });
});

test("the average leaves blanks out", () => {
  expect(averageOf([90, null, 71])).toBe(81);
  expect(averageOf([null, null])).toBeNull();
});

describe("the CSV", () => {
  const csv = gradebookCsv(
    [
      { id: "a", title: "Step 4, Do re mi", dueAt: Date.UTC(2026, 9, 12, 23, 59) },
      { id: "b", title: 'Bars 1-8 "Shenandoah"', dueAt: null },
    ],
    [
      { name: "Ana López", username: "ana", grades: [92, null] },
      { name: "=HYPERLINK(1)", username: null, grades: [null, 70] },
    ],
  );
  const lines = csv.replace(/^﻿/, "").trim().split("\r\n");
  test("a header, then a row a student with the average", () => {
    expect(csv.startsWith("﻿")).toBe(true);
    expect(lines[0]).toBe('Student,Username,"Step 4, Do re mi (due 2026-10-12)","Bars 1-8 ""Shenandoah""",Average');
    expect(lines[1]).toBe("Ana López,ana,92,,92");
  });
  test("a name a spreadsheet would run is defused", () => {
    expect(lines[2]).toBe("'=HYPERLINK(1),,,70,70");
  });
});

describe("a sight-reading attempt", () => {
  test("sung, clapped or tapped, on a Unison exercise link", () => {
    expect(checkExerciseAttempt({ mode: "sing", exercise: "/sightreading?keys=C#ex=abc" }).ok).toBe(true);
    expect(checkExerciseAttempt({ mode: "tap", exercise: "/sightreading" }).ok).toBe(true);
  });
  test("refused: another mode, another site, or too long", () => {
    expect(checkExerciseAttempt({ mode: "pitch", exercise: "/sightreading" }).ok).toBe(false);
    expect(checkExerciseAttempt({ mode: "sing", exercise: "https://evil.example/sightreading" }).ok).toBe(false);
    expect(checkExerciseAttempt({ mode: "sing", exercise: "//evil.example" }).ok).toBe(false);
    expect(checkExerciseAttempt({ mode: "sing", exercise: "/sightreadingx" }).ok).toBe(false);
    expect(checkExerciseAttempt({ mode: "sing", exercise: "/sightreading?" + "x".repeat(9000) }).ok).toBe(false);
  });
  test("a clapped run has no pitch score, and the server takes that", () => {
    const claps = {
      rhythm: 87.4,
      notes: [
        { cursor: 0, startUnits: 0, lengthUnits: 8, onsetBeats: 0.123, missed: false, rhythm: 100 },
        { cursor: 1, startUnits: 8, lengthUnits: 8, onsetBeats: null, missed: true, rhythm: 0 },
      ],
    } as unknown as ClapResult;
    const r = clapMarksOf(claps);
    expect(r).toEqual({ overall: 87, pitch: null, rhythm: 87, marks: [[0, 100, 100, null, 0.12, null], [1, 100, 0, null, null, null]] });
    const checked = checkAttemptResult(r);
    expect(checked.ok && checked.value.pitch).toBeNull();
  });
});
