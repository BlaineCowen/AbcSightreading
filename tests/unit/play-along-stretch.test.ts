import { describe, expect, test } from "bun:test";
import { stretchChannels } from "../../src/lib/play-along/stretch";

/**
 * The play-along tempo control stretches the backing track offline. What
 * matters is timing: after a stretch every hit must land where the new tempo
 * puts it, or the ball and the music part company.
 */

const RATE = 44100;

/** A click train: a short decaying 1 kHz burst on every beat. */
function clicks(bpm: number, beats: number): Float32Array {
  const beat = Math.round((60 / bpm) * RATE);
  const x = new Float32Array(beat * beats);
  for (let b = 0; b < beats; b++) {
    for (let i = 0; i < 600; i++) x[b * beat + i] = Math.sin((2 * Math.PI * 1000 * i) / RATE) * Math.exp(-i / 150);
  }
  return x;
}

/** Onset times in seconds: where the level jumps after a quiet stretch. */
function onsets(x: Float32Array): number[] {
  let peak = 0;
  for (const v of x) peak = Math.max(peak, Math.abs(v));
  const out: number[] = [];
  let quiet = 0;
  for (let i = 0; i < x.length; i++) {
    if (Math.abs(x[i]) > peak * 0.3) {
      if (quiet > 2000) out.push(i / RATE);
      quiet = 0;
    } else quiet++;
  }
  return out;
}

describe("stretching keeps the beat", () => {
  for (const rate of [0.85, 0.92, 1.08, 1.15]) {
    test(`at ${rate}x every click lands on the new beat`, () => {
      const x = clicks(100, 16);
      const quietStart = new Float32Array(3000);
      // A little silence first, as real tracks have none but the check should hold either way.
      const input = new Float32Array(quietStart.length + x.length);
      input.set(x, quietStart.length);
      const [l] = stretchChannels([input, input], rate);
      expect(Math.abs(l.length - input.length / rate)).toBeLessThan(2);
      const got = onsets(l);
      const beat = 60 / (100 * rate);
      const first = quietStart.length / RATE / rate;
      expect(got.length).toBeGreaterThanOrEqual(15);
      // Each click against its nearest beat of the new tempo.
      const errs = got.map((t) => t - first - Math.round((t - first) / beat) * beat);
      const mean = errs.reduce((a, e) => a + e, 0) / errs.length;
      // On average on the beat (measured about 1 ms), each within WSOLA's own
      // jitter (measured up to 10 ms over 90 s, with no drift).
      expect(Math.abs(mean)).toBeLessThan(0.003);
      for (const e of errs) expect(Math.abs(e)).toBeLessThan(0.012);
    });
  }

  test("1x is an unchanged copy", () => {
    const x = clicks(90, 4);
    const [l] = stretchChannels([x, x], 1);
    expect(l).toEqual(x);
    expect(l).not.toBe(x);
  });
});
