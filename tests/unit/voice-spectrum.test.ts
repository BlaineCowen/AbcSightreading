import { describe, expect, test } from "bun:test";
import {
  VOWELS,
  classifyVowel,
  estimateFormants,
  harmonicLevels,
  noiseFloor,
  spectralEnvelope,
  toneMeasures,
  type Spectrum,
} from "../../src/lib/tuner/voice-spectrum";

/**
 * The Analysis tool's spectrum: harmonic levels, the smoothed outline (the
 * spectral envelope), the first two resonances (formants) and a guess at the
 * vowel. Written before the code, against synthetic voices built the way a
 * voice is: a harmonic source falling 12 dB an octave, shaped by resonances
 * at the vowel's formants, drawn the way an AnalyserNode reports it (dB per
 * bin, each harmonic a narrow peak, a noise floor between).
 */

const SR = 48000;
const FFT = 8192;
const binHz = SR / FFT;

/** Magnitude of a resonance at f (a two-pole filter's response), in dB. */
function resonanceDb(f: number, fc: number, bw: number) {
  const num = fc * fc + (bw / 2) * (bw / 2);
  const den = Math.sqrt(((fc - f) ** 2 + (bw / 2) ** 2) * ((fc + f) ** 2 + (bw / 2) ** 2));
  return 20 * Math.log10(num / den);
}

function voice(
  f0: number,
  formants: [number, number, number],
  opts: { tilt?: number; noise?: number; widths?: number[]; jitter?: number; rnd?: () => number } = {}
): Spectrum {
  const n = FFT / 2;
  const lin = new Float64Array(n);
  const bws = opts.widths ?? [80, 100, 140];
  for (let k = 1; k * f0 < SR / 2 - 200; k++) {
    const f = k * f0;
    const wobble = opts.jitter ? (opts.rnd!() * 2 - 1) * opts.jitter : 0;
    const db = -(opts.tilt ?? 12) * Math.log2(k) + formants.reduce((a, fc, i) => a + resonanceDb(f, fc, bws[i]), 0) + wobble;
    const amp = 10 ** (db / 20);
    const c = f / binHz;
    for (let b = Math.max(0, Math.floor(c - 4)); b <= Math.min(n - 1, Math.ceil(c + 4)); b++) {
      lin[b] += amp * Math.exp(-(((b - c) / 1.4) ** 2));
    }
  }
  const floor = 10 ** ((opts.noise ?? -70) / 20);
  const db = new Float32Array(n);
  let peak = 0;
  for (let b = 0; b < n; b++) peak = Math.max(peak, lin[b]);
  for (let b = 0; b < n; b++) db[b] = 20 * Math.log10(lin[b] / peak + floor) - 30;
  return { db, sampleRate: SR, fftSize: FFT };
}

// Formants (F1, F2, F3) for a man's voice; a woman's run about 15% higher.
const MALE: Record<string, [number, number, number]> = {
  ee: [280, 2250, 2900],
  eh: [500, 1800, 2500],
  ah: [720, 1150, 2500],
  oh: [450, 800, 2400],
  oo: [310, 800, 2250],
};
const female = (f: [number, number, number]) => f.map((x) => x * 1.15) as [number, number, number];

describe("harmonic levels", () => {
  test("each harmonic of the note, at its frequency, strongest at 0 dB", () => {
    const s = voice(200, MALE.ah);
    const h = harmonicLevels(s, 200);
    expect(h[0].k).toBe(1);
    expect(h.length).toBeGreaterThanOrEqual(20); // up to 5 kHz
    for (const x of h.slice(0, 10)) expect(Math.abs(x.hz - x.k * 200)).toBeLessThan(binHz);
    expect(Math.max(...h.map((x) => x.db))).toBeCloseTo(0, 5);
    // "ah" has F1 near 720: the third and fourth harmonics (600, 800 Hz) outweigh the tenth (2 kHz).
    const at = (k: number) => h.find((x) => x.k === k)!.db;
    expect(at(4)).toBeGreaterThan(at(10));
  });

  test("a harmonic lost in the noise reads at the floor, not as a peak", () => {
    const s = voice(150, MALE.oo, { noise: -40 });
    const h = harmonicLevels(s, 150);
    expect(Math.min(...h.map((x) => x.db))).toBeGreaterThan(-80);
  });
});

describe("the vowel's resonances", () => {
  for (const [f0, table, who] of [
    [110, MALE, "a bass"],
    [165, MALE, "a baritone"],
    [220, Object.fromEntries(Object.entries(MALE).map(([k, v]) => [k, female(v)])), "an alto"],
    [330, Object.fromEntries(Object.entries(MALE).map(([k, v]) => [k, female(v)])), "a soprano, mid range"],
  ] as const) {
    for (const [vowel, fm] of Object.entries(table)) {
      test(`${who} (${f0} Hz) singing ${vowel}: formants found and the vowel named`, () => {
        const s = voice(f0, fm as [number, number, number]);
        const f = estimateFormants(harmonicLevels(s, f0), f0);
        expect(f).not.toBeNull();
        // F1 within a fifth of a harmonic spacing or 15%, whichever is looser.
        const tol1 = Math.max(fm[0] * 0.15, f0 * 0.6);
        expect(Math.abs(f!.f1 - fm[0])).toBeLessThan(tol1);
        const guess = classifyVowel(f!, f0);
        expect(guess.vowel).toBe(vowel);
        expect(guess.reliable).toBe(true);
      });
    }
  }

  test("a voice unlike the method's own model: other resonance widths, 2 dB of noise, other slopes", () => {
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    let right = 0, all = 0;
    for (const tilt of [6, 9, 12]) {
      for (const f0 of [110, 147, 196, 262, 330]) {
        for (const [vowel, fm] of Object.entries(MALE)) {
          const f = (f0 >= 200 ? female(fm) : fm);
          const s = voice(f0, f, { tilt, widths: [60, 90, 170], jitter: 2, rnd });
          const est = estimateFormants(harmonicLevels(s, f0), f0);
          all++;
          if (est && classifyVowel(est, f0).vowel === vowel) right++;
        }
      }
    }
    expect(right / all).toBeGreaterThanOrEqual(0.9);
  });

  test("back vowels in a man's voice, with a real F3 and F4 and noise: [u] and [o], not [i]", () => {
    // Fixed at 2600 Hz, F3 was spent explaining this voice's hump at 2300 to
    // 2400 and F2 went up to 2900: [u] and [o] came out as [i] in 24 of 28.
    let seed = 3;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const back: [string, [number, number, number]][] = [["oo", [300, 750, 2300]], ["oh", [430, 780, 2400]], ["oo", [320, 850, 2250]], ["oh", [480, 850, 2450]]];
    let right = 0, all = 0;
    for (const tilt of [12, 15, 18]) {
      for (const f0 of [110, 147, 175, 196, 220, 262]) {
        for (const [vowel, fm] of back) {
          const s = voice(f0, fm, { tilt, widths: [70, 90, 150], jitter: 2, rnd, noise: -60 });
          const est = estimateFormants(harmonicLevels(s, f0), f0, noiseFloor(s, f0));
          all++;
          if (est && classifyVowel(est, f0, "low").vowel === vowel) right++;
          if (est) expect(classifyVowel(est, f0, "low").vowel).not.toBe("ee");
        }
      }
    }
    expect(right / all).toBeGreaterThanOrEqual(0.85);
  });

  test("the singer's voice type, not the pitch, sets where the vowels are", () => {
    // A man's [o] at A3: judged against a woman's vowels it is her [u].
    const f = { f1: 420, f2: 790 };
    expect(classifyVowel(f, 220, "low").vowel).toBe("oh");
    expect(classifyVowel({ f1: 500, f2: 910 }, 220, "high").vowel).toBe("oh");
  });

  test("high in a soprano's range the guess says it cannot tell", () => {
    const s = voice(700, female(MALE.ah));
    const f = estimateFormants(harmonicLevels(s, 700), 700);
    const guess = f ? classifyVowel(f, 700) : null;
    if (guess) expect(guess.reliable).toBe(false);
  });

  test("the five choral vowels, each with its sound and a sample word", () => {
    expect(VOWELS.map((v) => v.id)).toEqual(["ee", "eh", "ah", "oh", "oo"]);
    for (const v of VOWELS) expect(v.word.length).toBeGreaterThan(0);
  });
});

describe("the outline drawn over the spectrum", () => {
  test("keeps the voice's slope, so it sits on the harmonics it outlines", () => {
    const s = voice(150, MALE.ah);
    const env = spectralEnvelope(s, 150);
    for (const k of [1, 4, 8]) {
      const b = Math.round((k * 150) / binHz);
      expect(Math.abs(env[b] - s.db[b])).toBeLessThan(8);
    }
  });
});

describe("tone", () => {
  test("H1 against H2: a breathy, flowing tone has a strong fundamental", () => {
    const breathy = toneMeasures(harmonicLevels(voice(150, MALE.ah, { tilt: 16 }), 150), 150);
    const pressed = toneMeasures(harmonicLevels(voice(150, MALE.ah, { tilt: 6 }), 150), 150);
    expect(breathy.h1h2).toBeGreaterThan(pressed.h1h2);
  });

  test("ring: energy around 3 kHz lifts it", () => {
    const plain = toneMeasures(harmonicLevels(voice(150, [720, 1150, 2500]), 150), 150);
    const ringing = toneMeasures(harmonicLevels(voice(150, [720, 1150, 2900], { tilt: 7 }), 150), 150);
    expect(ringing.ringDb).toBeGreaterThan(plain.ringDb);
  });
});
