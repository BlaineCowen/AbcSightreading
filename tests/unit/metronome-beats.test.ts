import { describe, expect, test } from "bun:test";
import {
  crossedWholeBeat,
  metronomeClickFor,
  newMetronomeBeatState,
} from "../../src/lib/metronome-beats";

/**
 * The cursor needs a high beatSubdivisions to glide, which makes abcjs's
 * beatCallback fire many times per beat. The metronome hangs off that same
 * callback, so without gating it clicks once per subdivision. That failure is
 * audible but invisible, and a backgrounded browser tab cannot demonstrate the
 * click rate, so it is pinned down here instead.
 */
describe("metronome beat gating", () => {
  const SUBDIVISIONS = 16;

  /** Replays a whole exercise the way abcjs would call back. */
  function clicksOver(beats: number, beatsPerMeasure: number) {
    const state = newMetronomeBeatState();
    const clicks: { beat: number; isDownbeat: boolean }[] = [];
    const steps = beats * SUBDIVISIONS;
    for (let i = 0; i < steps; i++) {
      const beatNumber = i / SUBDIVISIONS;
      const result = metronomeClickFor(state, beatNumber, beatsPerMeasure);
      if (result.click) {
        clicks.push({ beat: beatNumber, isDownbeat: result.isDownbeat });
      }
    }
    return clicks;
  }

  test("clicks once per beat, not once per subdivision", () => {
    const clicks = clicksOver(16, 4);
    expect(clicks.length).toBe(16);
    // The ungated version would have produced one per callback.
    expect(clicks.length).not.toBe(16 * SUBDIVISIONS);
  });

  test("every click lands on a whole beat", () => {
    for (const c of clicksOver(16, 4)) {
      expect(Number.isInteger(c.beat)).toBe(true);
    }
  });

  test("accents beat one of each measure", () => {
    const clicks = clicksOver(8, 4);
    expect(clicks.filter((c) => c.isDownbeat).map((c) => c.beat)).toEqual([
      0, 4,
    ]);
  });

  test("accents follow the meter in 3/4", () => {
    const clicks = clicksOver(9, 3);
    expect(clicks.filter((c) => c.isDownbeat).map((c) => c.beat)).toEqual([
      0, 3, 6,
    ]);
  });

  test("holds for any subdivision count, including awkward ones", () => {
    for (const subdivisions of [1, 2, 3, 7, 16, 64]) {
      const state = newMetronomeBeatState();
      let clicks = 0;
      for (let i = 0; i < 12 * subdivisions; i++) {
        if (metronomeClickFor(state, i / subdivisions, 4).click) clicks++;
      }
      expect(clicks).toBe(12);
    }
  });

  test("a beat that is skipped entirely still clicks once", () => {
    // A throttled or backgrounded tab jumps several beats between callbacks;
    // the click must not fire repeatedly to catch up, nor be lost.
    const state = newMetronomeBeatState();
    const seen: number[] = [];
    for (const beatNumber of [0, 3.4, 3.9, 7.2, 7.99, 11.1]) {
      if (metronomeClickFor(state, beatNumber, 4).click) seen.push(beatNumber);
    }
    expect(seen).toEqual([0, 3.4, 7.2, 11.1]);
  });

  test("crossedWholeBeat fires once per beat, for the beat cursor", () => {
    // The beat-by-beat cursor steps on this rather than on every callback.
    const state = newMetronomeBeatState();
    let steps = 0;
    for (let i = 0; i < 12 * 16; i++) {
      if (crossedWholeBeat(state, i / 16)) steps++;
    }
    expect(steps).toBe(12);
  });
});
