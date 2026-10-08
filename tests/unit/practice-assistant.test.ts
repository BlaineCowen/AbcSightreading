import { describe, expect, test } from "bun:test";
import {
  DEFAULT_ASSISTANT, assistantFrom, assistedLevels, barIsSilent, beatIsDropped, rampBpm, timeIsUp,
} from "../../src/lib/tuner/practice-assistant";

const on = <K extends keyof typeof DEFAULT_ASSISTANT>(k: K, patch: object) => ({ ...DEFAULT_ASSISTANT[k], on: true, ...patch });

describe("the metronome's practice assistant", () => {
  test("the ramp moves a step every few bars and stops at the target, up or down", () => {
    const up = on("ramp", { step: 4, everyBars: 2, target: 70 });
    expect([0, 1, 2, 3, 4, 8, 40].map((b) => rampBpm(60, b, up))).toEqual([60, 60, 64, 64, 68, 70, 70]);
    const down = on("ramp", { step: 5, everyBars: 1, target: 80 });
    expect([0, 1, 2, 9].map((b) => rampBpm(100, b, down))).toEqual([100, 95, 90, 80]);
    expect(rampBpm(60, 10, DEFAULT_ASSISTANT.ramp)).toBe(60);
  });

  test("silent bars: play two, mute two, repeating; the count-in never silent", () => {
    const s = on("silent", { play: 2, mute: 2 });
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((b) => barIsSilent(b, s))).toEqual([false, false, true, true, false, false, true, true]);
    expect(barIsSilent(-1, s)).toBe(false);
  });

  test("dropped beats: about the share asked for, never beat 1, the same for the same seed", () => {
    const d = on("drop", { percent: 25 });
    let dropped = 0, total = 0;
    for (let bar = 0; bar < 2000; bar++) for (let beat = 0; beat < 4; beat++) {
      const x = beatIsDropped(bar, beat, d, 12345);
      if (beat === 0) expect(x).toBe(false);
      else { total++; if (x) dropped++; }
    }
    expect(dropped / total).toBeGreaterThan(0.22);
    expect(dropped / total).toBeLessThan(0.28);
    expect(beatIsDropped(7, 2, d, 99)).toBe(beatIsDropped(7, 2, d, 99));
  });

  test("a silent bar silences every beat; otherwise only the dropped ones go", () => {
    const levels = ["accent", "normal", "normal", "normal"] as const;
    const a = { silent: on("silent", { play: 1, mute: 1 }), drop: DEFAULT_ASSISTANT.drop };
    expect(assistedLevels([...levels], 1, a, 1)).toEqual(["off", "off", "off", "off"]);
    expect(assistedLevels([...levels], 0, a, 1)).toEqual([...levels]);
    expect(assistedLevels([...levels], -1, a, 1)).toEqual([...levels]);
  });

  test("the time limit, and settings read back whole", () => {
    expect(timeIsUp(299, on("limit", { minutes: 5 }))).toBe(false);
    expect(timeIsUp(300, on("limit", { minutes: 5 }))).toBe(true);
    expect(timeIsUp(9999, DEFAULT_ASSISTANT.limit)).toBe(false);
    expect(assistantFrom(null)).toEqual(DEFAULT_ASSISTANT);
    expect(assistantFrom({ ramp: { on: true, step: 99 } }).ramp).toEqual({ ...DEFAULT_ASSISTANT.ramp, on: true });
  });
});
