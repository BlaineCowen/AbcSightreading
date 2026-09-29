import { describe, expect, test } from "bun:test";
import { RUN_DEFAULTS, runOptionsFrom } from "../../src/lib/practice-run";

/**
 * A practice run's settings, kept in a saved preset and on the device beside
 * the exercise's own. Written before the code. What comes back from storage
 * is whatever an older version or a hand-edited link left there, so each
 * setting is checked and falls back on its own.
 */
describe("a practice run's settings, read back", () => {
  test("a full set comes back as it went in", () => {
    const saved = {
      exercises: 8, repeats: 3, rampBpm: 5, previewSeconds: 10,
      repeatCursor: "off", repeatAnnotation: "kodaly",
      repeatNotes: "off", repeatMetronome: "on", repeatDrone: "same", repeatCountIn: "off",
    };
    expect(runOptionsFrom(saved)).toEqual(saved);
  });

  test("nothing saved (a preset from before runs were kept) is null, so the page keeps its own", () => {
    expect(runOptionsFrom(undefined)).toBeNull();
    expect(runOptionsFrom(null)).toBeNull();
    expect(runOptionsFrom("run")).toBeNull();
  });

  test("each unusable setting falls back on its own; the rest are kept", () => {
    const r = runOptionsFrom({ exercises: 5, repeats: 9, rampBpm: -3, previewSeconds: 99, repeatCursor: "sideways", repeatNotes: "on" })!;
    expect(r.exercises).toBe(RUN_DEFAULTS.exercises); // 5 is not one of the choices
    expect(r.repeats).toBe(RUN_DEFAULTS.repeats);
    expect(r.rampBpm).toBe(RUN_DEFAULTS.rampBpm);
    expect(r.previewSeconds).toBe(RUN_DEFAULTS.previewSeconds);
    expect(r.repeatCursor).toBe("same");
    expect(r.repeatNotes).toBe("on");
  });

  test("the defaults are the page's own", () => {
    expect(RUN_DEFAULTS).toEqual({
      exercises: 4, repeats: 2, rampBpm: 0, previewSeconds: 5,
      repeatCursor: "same", repeatAnnotation: "same",
      repeatNotes: "same", repeatMetronome: "same", repeatDrone: "same", repeatCountIn: "on",
    });
  });
});
