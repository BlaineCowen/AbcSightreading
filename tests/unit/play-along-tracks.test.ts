import { describe, expect, test } from "bun:test";
import { BACKING_TRACKS, barsFor, maxBarsIn } from "../../src/lib/play-along/backing-tracks";
import { planBars, planFromForm } from "../../src/lib/unison-form";
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

  test("every loop fits in its meter's shared exercise; a track with a form has its own", () => {
    for (const t of BACKING_TRACKS) {
      if (t.form) continue;
      expect(barsFor(t)).toBeLessThanOrEqual(maxBarsIn(t.meter));
    }
  });

  test("each track's form adds up to its bars and plans to a whole exercise", () => {
    for (const t of BACKING_TRACKS.filter((x) => x.form)) {
      expect(t.form!.reduce((sum, s) => sum + s.bars, 0)).toBe(t.bars);
      expect(planBars(planFromForm(t.form!))).toBe(t.bars);
    }
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
});
