import { describe, expect, test } from "bun:test";
import { detectCandidates, detectPitch } from "../../src/lib/tuner/autocorrelation";
import { PitchTracker } from "../../src/lib/tuner/pitch-tracker";
import { freqToNote, noteToFreq } from "../../src/lib/tuner/pitch";
import { dbfs, rms } from "../../src/lib/tuner/harmonics";

/**
 * abcTuner's detection, ported from the tuner project (whose
 * scripts/pitch-bench.ts is the full benchmark). These pin the basics on a
 * voice-like tone - harmonics falling off, a little vibrato - so a change here
 * that breaks detection shows up before a singer finds it.
 */

const SR = 48000;
const BUFFER = 2048;

function voice(f0: number, seconds = 1, vibratoCents = 12): Float32Array {
  const out = new Float32Array(Math.floor(SR * seconds));
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const f = f0 * 2 ** ((vibratoCents * Math.sin((2 * Math.PI * 5.5 * i) / SR)) / 1200);
    phase += (2 * Math.PI * f) / SR;
    let s = 0;
    for (let k = 1; k <= 8; k++) s += Math.sin(k * phase) / k ** 1.2;
    out[i] = s * 0.18;
  }
  return out;
}

const cents = (a: number, b: number) => 1200 * Math.log2(a / b);

describe("tuner detection", () => {
  test("a single frame finds the note sung, bass to soprano", () => {
    for (const [name, octave] of [["E", 2], ["A", 2], ["C", 3], ["G", 3], ["A", 4], ["E", 5], ["C", 6]] as const) {
      const f0 = noteToFreq(name, octave);
      const frame = voice(f0, 0.2, 0).subarray(0, BUFFER);
      const found = detectPitch(frame, SR);
      expect(found).not.toBeNull();
      // Within 5 cents, and the right note and octave - no octave errors.
      expect(Math.abs(cents(found!.frequency, f0))).toBeLessThan(5);
      expect(freqToNote(found!.frequency)).toMatchObject({ name, octave });
    }
  });

  test("the tracker holds a steady note through vibrato", () => {
    const f0 = noteToFreq("A", 4);
    const signal = voice(f0, 1.5);
    const tracker = new PitchTracker("medium");
    const readings: number[] = [];
    for (let at = 0, t = 0; at + BUFFER <= signal.length; at += BUFFER, t += (BUFFER / SR) * 1000) {
      const frame = signal.subarray(at, at + BUFFER);
      const f = tracker.update(detectCandidates(frame, SR), dbfs(rms(frame)), t);
      if (f !== null) readings.push(f);
    }
    // Confirmed within the first few frames, then held.
    expect(readings.length).toBeGreaterThan(25);
    for (const f of readings) expect(freqToNote(f).name).toBe("A");
  });

  test("silence gives no pitch", () => {
    expect(detectPitch(new Float32Array(BUFFER), SR)).toBeNull();
  });
});
