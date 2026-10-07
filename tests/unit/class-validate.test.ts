import { describe, expect, test } from "bun:test";
import { checkClassName, MAX_CLASS_NAME_LENGTH, parsePresetKey, presetKeyOf } from "../../src/lib/class-validate";

describe("checkClassName", () => {
  test("trims, and refuses empty or long names", () => {
    expect(checkClassName("  Varsity Treble ")).toEqual({ ok: true, value: "Varsity Treble" });
    expect(checkClassName("   ").ok).toBe(false);
    expect(checkClassName(7).ok).toBe(false);
    expect(checkClassName("x".repeat(MAX_CLASS_NAME_LENGTH + 1)).ok).toBe(false);
  });
});

describe("parsePresetKey", () => {
  test("names a real step, a real level, or a saved preset's id", () => {
    expect(parsePresetKey("step:pitch-do-re-mi")).toEqual({ kind: "step", id: "pitch-do-re-mi" });
    expect(parsePresetKey("uil:UIL 3")).toEqual({ kind: "uil", level: "UIL 3" });
    expect(parsePresetKey("saved:cmuh6flaj0000ozpmmdcjxh54")).toEqual({ kind: "saved", id: "cmuh6flaj0000ozpmmdcjxh54" });
  });

  test("refuses anything else", () => {
    for (const bad of ["step:no-such-step", "uil:UIL 9", "saved:", "saved:../x", "diff:Beginner", "step", 3, null]) {
      expect(parsePresetKey(bad)).toBeNull();
    }
  });

  test("keys round-trip", () => {
    expect(parsePresetKey(presetKeyOf.step("parts-four"))).toEqual({ kind: "step", id: "parts-four" });
    expect(parsePresetKey(presetKeyOf.uil("UIL 1"))).toEqual({ kind: "uil", level: "UIL 1" });
  });
});

describe("curriculum track keys", () => {
  test("half of a real step is a key; a step with no notes yet has no notes half", () => {
    expect(parsePresetKey("track:band-trumpet-03:notes")).toEqual({ kind: "track", stepId: "band-trumpet-03", part: "notes" });
    expect(parsePresetKey(presetKeyOf.track("band-tuba-01", "rhythm"))).toEqual({ kind: "track", stepId: "band-tuba-01", part: "rhythm" });
    expect(parsePresetKey("track:band-trumpet-01:notes")).toBeNull();
    expect(parsePresetKey("track:band-oboe-01:rhythm")).toBeNull();
    expect(parsePresetKey("track:band-trumpet-03")).toBeNull();
  });
});
