import { describe, expect, test } from "bun:test";
import { SUB_PATTERNS, barEvents, beatLevelsFor, beatLevelsFrom, maskFor, patternOf, subMaskFrom } from "../../src/lib/tuner/click-pattern";
import { barClicks } from "../../src/lib/playback-click";
import { METERS } from "../../src/lib/tuner/meters";

describe("the click's bar model", () => {
  test("settings from before it click exactly as they did: every meter, subdivision and accent", () => {
    for (const m of METERS) for (const subdivision of m.subdivisions) for (const accent of [true, false]) {
      const events = barEvents({ beats: m.beats, subdivision, accent });
      expect(events.map((e) => e.level)).toEqual(barClicks(m.beats, subdivision, accent));
      expect(events.every((e) => e.gain === 1)).toBe(true);
      // Evenly spaced, beat by beat.
      events.forEach((e, i) => expect(e.at).toBeCloseTo(i / subdivision, 9));
    }
  });

  test("a silent beat is silent with its subdivisions; a soft one is soft", () => {
    const ev = barEvents({ beats: 4, subdivision: 2, accent: true, beatLevels: ["accent", "off", "soft", "normal"] });
    expect(ev.map((e) => [e.at, e.level, e.gain])).toEqual([
      [0, "downbeat", 1], [0.5, "sub", 1],
      [2, "beat", 0.45], [2.5, "sub", 0.45],
      [3, "beat", 1], [3.5, "sub", 1],
    ]);
  });

  test("a mask plays only its slots: the off-beat, swing", () => {
    expect(barEvents({ beats: 2, subdivision: 2, accent: true, subMask: "01" }).map((e) => [e.at, e.level])).toEqual([[0.5, "sub"], [1.5, "sub"]]);
    const swing = barEvents({ beats: 1, subdivision: 3, accent: false, subMask: "101" });
    expect(swing.map((e) => e.at)).toEqual([0, 2 / 3]);
  });

  test("levels and masks that do not fit fall back to the plain bar", () => {
    expect(beatLevelsFor({ beats: 3, accent: true, beatLevels: ["soft", "soft"] })).toEqual(["accent", "normal", "normal"]);
    expect(maskFor(4, "101")).toEqual([true, true, true, true]);
    expect(maskFor(2, "00")).toEqual([true, true]);
    expect(subMaskFrom("1011", 4)).toBe("1011");
    expect(subMaskFrom("1111", 4)).toBeNull(); // a full mask is no mask
    expect(subMaskFrom("10", 4)).toBeNull();
    expect(beatLevelsFrom(["accent", "frog"], 2)).toBeNull();
    expect(beatLevelsFrom(["off", "soft"], 2)).toEqual(["off", "soft"]);
  });

  test("the picker's patterns are well formed and found again from their settings", () => {
    const ids = SUB_PATTERNS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of SUB_PATTERNS) {
      expect(p.mask.length).toBe(p.grid);
      expect(patternOf(p.grid, p.mask.includes("0") ? p.mask : null, p.meter)?.id).toBe(p.id);
    }
  });
});
