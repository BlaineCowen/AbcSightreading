import { describe, expect, test } from "bun:test";
import { applyMixLevels } from "../../src/lib/mix-volumes";

const tracks = () => [
  [
    { instrument: "acoustic_grand_piano", volume: 80 },
    { instrument: "acoustic_grand_piano", volume: 100 },
  ],
  [
    { instrument: "percussion", volume: 76 },
    { instrument: "percussion", volume: 30 },
  ],
];

describe("applyMixLevels", () => {
  test("levels of 1 leave every note as written", () => {
    expect(applyMixLevels(tracks(), { playback: 1, metronome: 1 })).toEqual(tracks());
  });

  test("the metronome level touches only the drum track", () => {
    const out = applyMixLevels(tracks(), { playback: 1, metronome: 0 });
    expect(out[0].map((n) => n.volume)).toEqual([80, 100]);
    expect(out[1].map((n) => n.volume)).toEqual([0, 0]);
  });

  test("the playback level touches only the voices", () => {
    const out = applyMixLevels(tracks(), { playback: 0.5, metronome: 1 });
    expect(out[0].map((n) => n.volume)).toEqual([40, 50]);
    expect(out[1].map((n) => n.volume)).toEqual([76, 30]);
  });

  test("velocities stay whole and inside MIDI's range", () => {
    const out = applyMixLevels(tracks(), { playback: 1.5, metronome: 0.33 });
    for (const n of out.flat()) {
      expect(Number.isInteger(n.volume)).toBe(true);
      expect(n.volume).toBeGreaterThanOrEqual(0);
      expect(n.volume).toBeLessThanOrEqual(127);
    }
    expect(out[0][1].volume).toBe(127);
  });

  test("a bad level falls back to as-written rather than silence or NaN", () => {
    const out = applyMixLevels(tracks(), { playback: Number.NaN, metronome: -2 });
    expect(out[0].map((n) => n.volume)).toEqual([80, 100]);
    expect(out[1].map((n) => n.volume)).toEqual([0, 0]);
  });
});
