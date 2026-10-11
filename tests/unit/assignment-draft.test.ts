import { describe, expect, test } from "bun:test";
import { assignedExercise, assignmentPage, checkAssignmentRequest, checkPackedExercise } from "../../src/lib/practice";
import { designHref, draftComplete, finishOnPage, needsPage, type AssignDraft } from "../../src/lib/assignment-draft";

const packed = "1" + "AbC-_9".repeat(20);

describe("a sight-reading assignment's request", () => {
  test("one exercise for everyone rides along, checked", () => {
    const r = checkAssignmentRequest({ presetKey: "step:sbs-01-rhythm", minutes: 10, exercise: packed });
    expect(r.ok && r.value.exercise).toBe(packed);
  });
  test("an exercise that is not a packed one is refused", () => {
    expect(checkAssignmentRequest({ presetKey: "step:sbs-01-rhythm", minutes: 10, exercise: "javascript:alert(1)" }).ok).toBe(false);
    expect(checkAssignmentRequest({ presetKey: "step:sbs-01-rhythm", minutes: 10, exercise: "1" + "a".repeat(9000) }).ok).toBe(false);
    expect(checkPackedExercise("2abc")).toBeNull();
  });
  test("a song takes no exercise", () => {
    const r = checkAssignmentRequest({ presetKey: "piece:abc123", piece: {}, exercise: packed });
    expect(r.ok && r.value.exercise).toBeUndefined();
  });
  test("custom: on either page, with a title and settings", () => {
    const r = checkAssignmentRequest({ presetKey: "custom:choral", minutes: 15, custom: { name: " Week 6 ", params: { key: "F" } } });
    expect(r.ok && r.value.custom).toEqual({ name: "Week 6", params: { key: "F" } });
    expect(assignmentPage("custom:choral")).toBe("choral");
    expect(assignmentPage("custom:unison")).toBe("unison");
  });
  test("custom without a title or settings is refused, and only the two pages", () => {
    expect(checkAssignmentRequest({ presetKey: "custom:unison", minutes: 15, custom: { name: "", params: {} } }).ok).toBe(false);
    expect(checkAssignmentRequest({ presetKey: "custom:unison", minutes: 15, custom: { name: "x", params: [] } }).ok).toBe(false);
    expect(checkAssignmentRequest({ presetKey: "custom:piece", minutes: 15, custom: { name: "x", params: {} } }).ok).toBe(false);
  });
  test("the stored exercise reads back, and nothing else does", () => {
    expect(assignedExercise({ id: "custom", exercise: packed })).toBe(packed);
    expect(assignedExercise({ exercise: 3 })).toBeNull();
    expect(assignedExercise(null)).toBeNull();
  });
});

describe("the wizard's trip to the page", () => {
  const base: AssignDraft = { presetKey: "step:sbs-01-rhythm", fixed: false, classIds: ["c1"], minutes: 15, dueAt: "", note: "", title: "" };
  test("only a custom one or one exercise for everyone needs the page", () => {
    expect(needsPage(base)).toBe(false);
    expect(needsPage({ ...base, fixed: true })).toBe(true);
    expect(needsPage({ ...base, presetKey: "custom:unison" })).toBe(true);
  });
  test("it opens the preset's own link, marked", () => {
    expect(designHref("step:sbs-01-rhythm", [])).toMatch(/^\/sightreading\?step=sbs-01-rhythm&assigning=1$/);
    expect(designHref("uil:UIL 3", [])).toBe("/choral-sightreading?uil=UIL%203&assigning=1");
    expect(designHref("custom:choral", [])).toBe("/choral-sightreading?assigning=1");
    expect(designHref("saved:gone", [])).toBeNull();
  });
  test("a fixed one comes back only with an exercise", () => {
    const d = { ...base, fixed: true };
    expect(finishOnPage(d, { params: {}, exercise: null })).toBeNull();
    const done = finishOnPage(d, { params: {}, exercise: packed })!;
    expect(done.exercise).toBe(packed);
    expect(draftComplete(done)).toBe(true);
  });
  test("a custom one comes back with the page's settings under its title", () => {
    const done = finishOnPage({ ...base, presetKey: "custom:unison", title: "Do to so" }, { params: { bpm: 80 }, exercise: packed })!;
    expect(done.custom).toEqual({ name: "Do to so", params: { bpm: 80 } });
    expect(done.exercise).toBeUndefined();
    expect(draftComplete(done)).toBe(true);
  });
});
