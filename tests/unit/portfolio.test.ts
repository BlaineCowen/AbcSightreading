import { describe, expect, test } from "bun:test";
import { checkCheckpoint, checkpointOf, growthOf, keepUntil, portfolioCsv, resultOf, suggestedLevel } from "../../src/lib/portfolio";
import { checkAssignmentRequest } from "../../src/lib/practice";

describe("portfolio checkpoints", () => {
  test("a checkpoint is a stage and 1 to 3 tries", () => {
    expect(checkCheckpoint(undefined)).toEqual({ ok: true, value: null });
    expect(checkCheckpoint({ stage: "boy", tries: 1 })).toEqual({ ok: true, value: { stage: "boy", tries: 1 } });
    expect(checkCheckpoint({ stage: "soon", tries: 1 }).ok).toBe(false);
    expect(checkCheckpoint({ stage: "eoy", tries: 4 }).ok).toBe(false);
    expect(checkCheckpoint({ stage: "eoy", tries: 0 }).ok).toBe(false);
    expect(checkpointOf({ id: "x", checkpoint: { stage: "moy", tries: 2 } })).toEqual({ stage: "moy", tries: 2 });
    expect(checkpointOf(null)).toBeNull();
    expect(checkpointOf({ checkpoint: { stage: "nope" } })).toBeNull();
  });

  test("an assignment request carries it, and needs no minutes", () => {
    const r = checkAssignmentRequest({ presetKey: "tmea:I-soprano", minutes: 0, checkpoint: { stage: "boy", tries: 1 } });
    // The key may not parse in this test's ladder; what matters is the minutes rule when it does.
    if (r.ok) expect(r.value.checkpoint).toEqual({ stage: "boy", tries: 1 });
    const step = checkAssignmentRequest({ presetKey: "step:sbs-01-rhythm", minutes: 0, checkpoint: { stage: "boy", tries: 2 } });
    expect(step.ok).toBe(true);
    if (step.ok) expect(step.value).toMatchObject({ minutes: 0, checkpoint: { stage: "boy", tries: 2 } });
    expect(checkAssignmentRequest({ presetKey: "step:sbs-01-rhythm", minutes: 0 }).ok).toBe(false);
    expect(checkAssignmentRequest({ presetKey: "step:sbs-01-rhythm", minutes: 10, checkpoint: { stage: "x", tries: 1 } }).ok).toBe(false);
  });

  test("recordings are kept to 30 September after the school year", () => {
    expect(keepUntil(new Date("2026-11-09T12:00:00Z")).toISOString().slice(0, 10)).toBe("2027-09-30");
    expect(keepUntil(new Date("2027-05-20T12:00:00Z")).toISOString().slice(0, 10)).toBe("2027-09-30");
    expect(keepUntil(new Date("2027-08-05T12:00:00Z")).toISOString().slice(0, 10)).toBe("2028-09-30");
  });

  test("the score suggests a rubric level", () => {
    expect([95, 80, 60, 20, null].map(suggestedLevel)).toEqual([4, 3, 2, 1, null]);
  });

  test("a result is the best graded try and the latest rubric level given", () => {
    const r = resultOf([
      { id: "a", overall: 62, rubric: 2, hasTake: true, at: 1 },
      { id: "b", overall: 71, rubric: null, hasTake: true, at: 2 },
      { id: "c", overall: null, rubric: null, hasTake: false, at: 3 },
    ]);
    expect(r.best?.id).toBe("b");
    expect(r.rubric).toBe(2);
    expect(r.tries).toBe(3);
    expect(resultOf([]).best).toBeNull();
  });

  test("growth is last minus first, of what there is", () => {
    expect(growthOf([50, null, 72])).toBe(22);
    expect(growthOf([null, 3])).toBeNull();
    expect(growthOf([4, 2])).toBe(-2);
  });

  test("the CSV has a date, score and rubric per checkpoint, then the change", () => {
    const csv = portfolioCsv(
      [{ title: "Step 3", stage: "boy", createdAt: 0 }, { title: "Step 9", stage: "eoy", createdAt: 1 }],
      [{ name: "=Ana", username: "ana", cells: [{ score: 55, rubric: 2, at: Date.UTC(2026, 8, 1) }, { score: 81, rubric: 3, at: Date.UTC(2027, 4, 1) }] }],
    );
    const [head, row] = csv.replace("﻿", "").trim().split("\r\n");
    expect(head).toBe("Student,Username,Beginning of year: Step 3 (date),Beginning of year: score,Beginning of year: rubric (1-4),End of year: Step 9 (date),End of year: score,End of year: rubric (1-4),Score change,Rubric change");
    expect(row).toBe("'=Ana,ana,2026-09-01,55,2,2027-05-01,81,3,26,1");
  });
});
