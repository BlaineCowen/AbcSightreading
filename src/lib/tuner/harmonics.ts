import type { Harmonic, HarmonicAnalysis } from "./types";

export function rms(buffer: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
  return Math.sqrt(sum / buffer.length);
}

export function dbfs(rmsValue: number): number {
  return rmsValue > 0 ? 20 * Math.log10(rmsValue) : -Infinity;
}

const dbToAmp = (db: number) => Math.pow(10, db / 20);

/**
 * Locate the first `n` partials of `f0` in a dB magnitude spectrum
 * (as returned by AnalyserNode.getFloatFrequencyData) and derive
 * simple tone-quality measures from them.
 */
export function analyzeHarmonics(
  spectrumDb: Float32Array,
  sampleRate: number,
  fftSize: number,
  f0: number,
  n = 8
): HarmonicAnalysis | null {
  const binHz = sampleRate / fftSize;
  const maxBin = spectrumDb.length - 1;
  const toBin = (hz: number) => Math.round(hz / binHz);

  const harmonics: Harmonic[] = [];
  let peakAmp = 0;

  for (let k = 1; k <= n; k++) {
    const target = k * f0;
    const lo = Math.max(1, toBin(target * 0.97));
    const hi = Math.min(maxBin, toBin(target * 1.03));
    if (lo > hi) break;

    let bestBin = lo;
    for (let b = lo + 1; b <= hi; b++) {
      if (spectrumDb[b] > spectrumDb[bestBin]) bestBin = b;
    }
    const db = spectrumDb[bestBin];
    if (!Number.isFinite(db)) continue;
    const amplitude = dbToAmp(db);
    peakAmp = Math.max(peakAmp, amplitude);
    harmonics.push({ k, freqHz: bestBin * binHz, db, amplitude });
  }

  if (harmonics.length === 0 || peakAmp === 0) return null;

  // Band energy and centroid over [0.5 f0, (n + 0.5) f0].
  const bandLo = Math.max(1, toBin(f0 * 0.5));
  const bandHi = Math.min(maxBin, toBin(f0 * (n + 0.5)));
  let bandEnergy = 0;
  let weightedHz = 0;
  for (let b = bandLo; b <= bandHi; b++) {
    const a = dbToAmp(spectrumDb[b]);
    const e = a * a;
    bandEnergy += e;
    weightedHz += e * b * binHz;
  }

  let harmonicEnergy = 0;
  for (const h of harmonics) {
    const c = toBin(h.freqHz);
    for (let b = Math.max(1, c - 1); b <= Math.min(maxBin, c + 1); b++) {
      const a = dbToAmp(spectrumDb[b]);
      harmonicEnergy += a * a;
    }
  }

  const centroidHz = bandEnergy > 0 ? weightedHz / bandEnergy : f0;
  const hnr = bandEnergy > 0 ? Math.min(1, harmonicEnergy / bandEnergy) : 0;
  const brightness = Math.min(1, Math.max(0, centroidHz / f0 / n));

  return {
    harmonics: harmonics.map((h) => ({ ...h, amplitude: h.amplitude / peakAmp })),
    hnr,
    centroidHz,
    brightness,
  };
}
