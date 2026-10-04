import { describe, expect, test } from "bun:test";
import { BACKING_TRACKS, barsFor, maxBarsIn } from "../../src/lib/play-along/backing-tracks";
import { tempoChoices } from "../../src/lib/play-along/timeline";
import { EXERCISE_METER_NAMES } from "../../src/lib/meter";

/**
 * The play-along video writes one exercise per meter, long enough for every
 * track in it, so swapping tracks costs nothing. These hold that together.
 */

describe("one exercise per meter", () => {
  test("every meter the videos offer has a track", () => {
    for (const m of EXERCISE_METER_NAMES) expect(BACKING_TRACKS.some((t) => t.meter === m)).toBe(true);
  });

  test("every track fits in its meter's exercise", () => {
    for (const t of BACKING_TRACKS) expect(barsFor(t)).toBeLessThanOrEqual(maxBarsIn(t.meter));
  });

  test("a full-length track is exactly its own bars; a loop whole repeats of itself", () => {
    for (const t of BACKING_TRACKS) {
      if (t.fullLength) expect(barsFor(t)).toBe(t.bars);
      else expect(barsFor(t) % t.bars).toBe(0);
    }
  });

  test("no meter asks for an absurdly long exercise", () => {
    // scripts/check-play-along-length.ts generates each meter at its maxBarsIn.
    for (const m of EXERCISE_METER_NAMES) expect(maxBarsIn(m)).toBeLessThanOrEqual(100);
  });

  test("tracks sharing a file agree on its length in time", () => {
    const byFile = new Map<string, number[]>();
    for (const t of BACKING_TRACKS) {
      const beats = Number(t.meter.split("/")[0]) / (t.meter.endsWith("/8") ? 3 : 1);
      const seconds = (barsFor(t) * beats * 60) / t.bpm;
      byFile.set(t.file, [...(byFile.get(t.file) ?? []), seconds]);
    }
    for (const secs of byFile.values()) expect(Math.max(...secs) - Math.min(...secs)).toBeLessThan(0.01);
  });
});

describe("tempo choices", () => {
  test("half speed to 150% in 5% steps, as whole BPM", () => {
    expect(tempoChoices(100)).toEqual(Array.from({ length: 21 }, (_, i) => 50 + i * 5));
    expect(tempoChoices(80)[0]).toBe(40);
    expect(tempoChoices(80).at(-1)).toBe(120);
    expect(tempoChoices(70)).toContain(35);
    expect(tempoChoices(70)).toContain(105);
  });

  test("every track's own tempo is a choice, and the choices never repeat", () => {
    for (const t of BACKING_TRACKS) {
      const c = tempoChoices(t.bpm);
      expect(c).toContain(t.bpm);
      expect(new Set(c).size).toBe(c.length);
      expect([...c].sort((a, b) => a - b)).toEqual(c);
    }
  });

  test("every drum loop has its ending on disk (drums.ts renders them)", () => {
    const { existsSync } = require("fs");
    const loops = BACKING_TRACKS.filter((t) => t.id.startsWith("drums-"));
    expect(loops.length).toBeGreaterThan(0);
    for (const t of loops) {
      expect(t.ending).toBe(`/backing/${t.id}-end.mp3`);
      expect(existsSync(`public${t.ending}`)).toBe(true);
    }
  });
});
