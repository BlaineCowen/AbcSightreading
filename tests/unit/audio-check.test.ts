import { describe, expect, test } from "bun:test";
import { BEEP_MS, GAP_MS, beepWindows, beepsHeard, bleeds, meterLevel, voiceHeard, type Heard } from "../../src/lib/pieces/audio-check";

/** Frames every 46 ms (the tuner's) from 0 to `ms`, each from `at(t)`. */
const frames = (ms: number, at: (t: number) => Omit<Heard, "t">): Heard[] => {
  const out: Heard[] = [];
  for (let t = 0; t <= ms; t += 46) out.push({ t, ...at(t) });
  return out;
};
const windows = beepWindows(100);
const inBeep = (t: number) => windows.some((w) => t >= w.from && t <= w.to);
const end = 100 + 3 * (BEEP_MS + GAP_MS);

describe("the beep test", () => {
  test("speakers the microphone hears: the beep's pitch, or a clear rise in level", () => {
    const byPitch = frames(end, (t) => (inBeep(t) ? { pitchHz: 880, dbfs: -40 } : { pitchHz: null, dbfs: -42 }));
    expect(beepsHeard(byPitch, windows)).toBe(3);
    // An octave out (the detector's usual slip) still counts.
    const octave = frames(end, (t) => (inBeep(t) ? { pitchHz: 440, dbfs: -55 } : { pitchHz: null, dbfs: -56 }));
    expect(beepsHeard(octave, windows)).toBe(3);
    const byLevel = frames(end, (t) => (inBeep(t) ? { pitchHz: null, dbfs: -30 } : { pitchHz: null, dbfs: -55 }));
    expect(bleeds(beepsHeard(byLevel, windows))).toBe(true);
  });

  test("headphones: quiet throughout, or a room's noise that does not follow the beeps", () => {
    expect(beepsHeard(frames(end, () => ({ pitchHz: null, dbfs: -Infinity })), windows)).toBe(0);
    const room = frames(end, (t) => ({ pitchHz: t % 500 < 100 ? 220 : null, dbfs: -48 + (t % 300 < 50 ? 3 : 0) }));
    expect(bleeds(beepsHeard(room, windows))).toBe(false);
  });
});

describe("the microphone test", () => {
  test("a voice held half a second", () => {
    expect(voiceHeard(frames(1000, (t) => ({ pitchHz: 200, dbfs: t > 300 ? -30 : -70 })))).toBe(true);
    expect(voiceHeard(frames(1000, (t) => ({ pitchHz: null, dbfs: t % 200 < 50 ? -30 : -70 })))).toBe(false);
    expect([meterLevel(-Infinity), meterLevel(-70), meterLevel(-40), meterLevel(0)]).toEqual([0, 0, 0.5, 1]);
  });
});
