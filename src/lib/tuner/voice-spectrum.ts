/**
 * The Analysis tool's reading of a sung spectrum (tests:
 * tests/unit/voice-spectrum.test.ts). Pure functions over a dB magnitude
 * spectrum as an AnalyserNode reports it:
 *
 * - harmonicLevels: each harmonic of the note up to 5 kHz, in dB against the
 *   strongest.
 * - spectralEnvelope: the spectrum's outline, a smooth curve through the
 *   harmonics' peaks, where a vowel's resonances show as humps.
 * - estimateFormants: F1 and F2 by analysis by synthesis. Every pair of
 *   resonances on a grid predicts the harmonics' levels; the singer's own
 *   downward slope is fitted as it goes; the pair that predicts the heard
 *   levels best wins. It uses every harmonic, so it copes where they are too
 *   sparse to show the humps, and it assumes no slope. Measured against
 *   synthetic voices with other resonance widths than it assumes and 2 dB of
 *   noise on every harmonic: 88 of 90 vowels right across bass to soprano,
 *   F1 within about 7%. Picking humps from the outline managed 59.
 * - classifyVowel: the nearest of the five choral vowels to F1 and F2.
 * - toneMeasures: H1 against H2, ring (energy around 3 kHz), brightness.
 *
 * A vowel is its F1 and F2, so the guess is as good as the envelope. It is
 * good for low and middle voices; high in a soprano's range the harmonics are
 * too far apart to show the humps, and trained sopranos move their formants
 * toward the pitch anyway, so there the guess says it cannot tell.
 */

export type Spectrum = { db: Float32Array; sampleRate: number; fftSize: number };
export type HarmonicLevel = { k: number; hz: number; db: number };
export type Formants = { f1: number; f2: number | null };
export type VowelId = "ee" | "eh" | "ah" | "oh" | "oo";
export type VowelGuess = { vowel: VowelId; confidence: number; reliable: boolean };

export const MAX_HZ = 5000;
const FLOOR_DB = 80;
const MAX_HARMONICS = 40;
/**
 * Above about A4 the harmonics are too sparse to place F1 and F2 (a trained
 * soprano also moves them toward the pitch), so the guess says it cannot
 * tell; from about E4 it is offered as a rough one.
 */
export const RELIABLE_BELOW_HZ = 440;
export const ROUGH_ABOVE_HZ = 330;

/** Parabolic refinement of a peak at bin b: [offset in bins, height]. */
function refine(y: ArrayLike<number>, b: number): [number, number] {
  const a = y[b - 1], c = y[b + 1], m = y[b];
  if (a === undefined || c === undefined || !Number.isFinite(a) || !Number.isFinite(c)) return [0, m];
  const den = a - 2 * m + c;
  if (den >= 0) return [0, m];
  const d = Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / den));
  return [d, m - 0.25 * (a - c) * d];
}

/** Each harmonic's peak, in the spectrum's own dB. */
function harmonicPeaks(s: Spectrum, f0: number, maxHz: number): HarmonicLevel[] {
  const binHz = s.sampleRate / s.fftSize;
  const last = s.db.length - 2;
  const out: HarmonicLevel[] = [];
  for (let k = 1; k <= MAX_HARMONICS && k * f0 <= maxHz; k++) {
    const c = (k * f0) / binHz;
    const half = Math.max(2, Math.round((0.3 * f0) / binHz));
    const lo = Math.max(1, Math.round(c) - half);
    const hi = Math.min(last, Math.round(c) + half);
    if (lo > hi) break;
    let best = lo;
    for (let b = lo + 1; b <= hi; b++) if (s.db[b] > s.db[best]) best = b;
    const [d, db] = refine(s.db, best);
    if (!Number.isFinite(db)) continue;
    out.push({ k, hz: (best + d) * binHz, db });
  }
  return out;
}

export function harmonicLevels(s: Spectrum, f0: number, maxHz = MAX_HZ): HarmonicLevel[] {
  const out = harmonicPeaks(s, f0, maxHz);
  const top = Math.max(...out.map((h) => h.db));
  return out.map((h) => ({ ...h, db: Math.max(-FLOOR_DB, h.db - top) }));
}

/**
 * A smooth curve through points (hz, dB), one value per bin up to n bins:
 * Catmull-Rom, so a hump between two harmonics peaks between them, where the
 * resonance is, rather than on one of them.
 */
function curveThrough(pts: { hz: number; db: number }[], n: number, binHz: number): Float32Array {
  const out = new Float32Array(n);
  if (!pts.length) return out;
  let i = 0;
  for (let b = 0; b < n; b++) {
    const hz = b * binHz;
    if (hz <= pts[0].hz) { out[b] = pts[0].db; continue; }
    if (hz >= pts[pts.length - 1].hz) { out[b] = pts[pts.length - 1].db; continue; }
    while (pts[i + 1].hz < hz) i++;
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const t = (hz - p1.hz) / (p2.hz - p1.hz);
    const t2 = t * t, t3 = t2 * t;
    out[b] =
      0.5 *
      (2 * p1.db +
        (-p0.db + p2.db) * t +
        (2 * p0.db - 5 * p1.db + 4 * p2.db - p3.db) * t2 +
        (-p0.db + 3 * p1.db - 3 * p2.db + p3.db) * t3);
  }
  return out;
}

/**
 * The outline, in the spectrum's dB, one value per bin up to maxHz: a curve
 * through the harmonics' peaks, so it sits on the harmonics it outlines.
 */
export function spectralEnvelope(s: Spectrum, f0: number, maxHz = MAX_HZ): Float32Array {
  const binHz = s.sampleRate / s.fftSize;
  const n = Math.min(s.db.length, Math.floor(maxHz / binHz));
  return curveThrough(harmonicPeaks(s, f0, maxHz), n, binHz);
}

/** A resonance's response at f, in dB (a two-pole filter, the vocal tract's building block). */
function resonanceDb(f: number, fc: number, bw: number) {
  const num = fc * fc + (bw / 2) * (bw / 2);
  const den = Math.sqrt(((fc - f) ** 2 + (bw / 2) ** 2) * ((fc + f) ** 2 + (bw / 2) ** 2));
  return 20 * Math.log10(num / den);
}

/**
 * The noise floor, in dB against the strongest harmonic: the median of the
 * spectrum midway between harmonics, where only noise is. Harmonics that do
 * not stand clear of it are noise, not voice, and are left out of the fit.
 */
export function noiseFloor(s: Spectrum, f0: number, maxHz = MAX_HZ): number {
  const binHz = s.sampleRate / s.fftSize;
  const top = Math.max(...harmonicPeaks(s, f0, maxHz).map((h) => h.db));
  const between: number[] = [];
  for (let k = 1; (k + 0.5) * f0 <= maxHz; k++) {
    const v = s.db[Math.round(((k + 0.5) * f0) / binHz)];
    if (Number.isFinite(v)) between.push(v);
  }
  if (!between.length || !Number.isFinite(top)) return -FLOOR_DB;
  between.sort((x, y) => x - y);
  return Math.max(-FLOOR_DB, between[Math.floor(between.length / 2)] - top);
}

// The grid the fit searches, in Hz.
const F1_GRID = Array.from({ length: 31 }, (_, i) => 200 + 30 * i); // 200 to 1100
const F2_GRID = Array.from({ length: 40 }, (_, i) => 550 + 60 * i); // 550 to 2890
const F3_GRID = [2200, 2500, 2800, 3100];

/**
 * F1 and F2 that best explain the harmonics' levels. `fit` is how far off the
 * best prediction still is, in dB per harmonic: small is a clean vowel.
 *
 * F3 is searched too: fixed, it was wrong for most voices, and the fit then
 * spent F2 on explaining F3's hump; a back vowel (F1 and F2 close together,
 * little energy above) came out as [i]. The F1 and F2 region counts for more
 * than the top of the spectrum, and harmonics near the noise floor not at all.
 */
export function estimateFormants(h: HarmonicLevel[], f0: number, floorDb = -60): (Formants & { fit: number }) | null {
  const pts = h.filter((x) => x.hz <= 4000 && x.db > Math.max(-60, floorDb + 8));
  if (pts.length < 3) return null;
  const n = pts.length;
  const lx = pts.map((x) => Math.log2(x.hz / f0));
  const w = pts.map((x) => (x.hz <= 1500 ? 1 : x.hz <= 2500 ? 0.6 : 0.35));
  let sw = 0, swx = 0, swxx = 0;
  for (let i = 0; i < n; i++) { sw += w[i]; swx += w[i] * lx[i]; swxx += w[i] * lx[i] * lx[i]; }
  const den = sw * swxx - swx * swx || 1;
  const table = (grid: number[], bw: number) => grid.map((fc) => pts.map((x) => resonanceDb(x.hz, fc, bw)));

  const errorOf = (r1: number[], r2: number[], r3: number[]) => {
    let swy = 0, swxy = 0;
    const r = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      r[i] = pts[i].db - r1[i] - r2[i] - r3[i];
      swy += w[i] * r[i];
      swxy += w[i] * lx[i] * r[i];
    }
    const slope = (sw * swxy - swx * swy) / den;
    // A voice does not rise with frequency, nor fall more than 24 dB an octave.
    if (slope > 0 || slope < -24) return Infinity;
    const off = (swy - slope * swx) / sw;
    let e = 0;
    for (let i = 0; i < n; i++) e += w[i] * (r[i] - off - slope * lx[i]) ** 2;
    return e / sw;
  };

  const t1 = table(F1_GRID, 90), t2 = table(F2_GRID, 110), t3 = table(F3_GRID, 150);
  let best = { i1: -1, i2: -1, i3: -1, err: Infinity };
  for (let i1 = 0; i1 < F1_GRID.length; i1++) {
    for (let i2 = 0; i2 < F2_GRID.length; i2++) {
      if (F2_GRID[i2] < F1_GRID[i1] + 150) continue;
      for (let i3 = 0; i3 < F3_GRID.length; i3++) {
        if (F3_GRID[i3] < F2_GRID[i2] + 250) continue;
        const err = errorOf(t1[i1], t2[i2], t3[i3]);
        if (err < best.err) best = { i1, i2, i3, err };
      }
    }
  }
  if (best.i1 < 0 || !Number.isFinite(best.err)) return null;

  // Refine F1 and F2 on a finer grid around the best, F3 where it was.
  const r3 = t3[best.i3];
  const c1 = F1_GRID[best.i1], c2 = F2_GRID[best.i2];
  let fine = { f1: c1, f2: c2, err: best.err };
  for (let f1 = Math.max(200, c1 - 30); f1 <= Math.min(1100, c1 + 30); f1 += 10) {
    const r1 = pts.map((x) => resonanceDb(x.hz, f1, 90));
    for (let f2 = Math.max(550, c2 - 60, f1 + 150); f2 <= Math.min(2900, c2 + 60); f2 += 20) {
      const err = errorOf(r1, pts.map((x) => resonanceDb(x.hz, f2, 110)), r3);
      if (err < fine.err) fine = { f1, f2, err };
    }
  }
  return { f1: fine.f1, f2: fine.f2, fit: Math.sqrt(fine.err) };
}

/** The five choral vowels, with formants for a man's voice (a woman's run about 15% higher). */
export const VOWELS: { id: VowelId; ipa: string; word: string; f1: number; f2: number }[] = [
  { id: "ee", ipa: "i", word: "see", f1: 280, f2: 2250 },
  { id: "eh", ipa: "ɛ", word: "bed", f1: 500, f2: 1800 },
  { id: "ah", ipa: "ɑ", word: "father", f1: 720, f2: 1150 },
  { id: "oh", ipa: "o", word: "go", f1: 450, f2: 800 },
  { id: "oo", ipa: "u", word: "who", f1: 310, f2: 800 },
];

/** Hz to Bark, the ear's own scale for comparing resonances. */
const bark = (hz: number) => (26.81 * hz) / (1960 + hz) - 0.53;

export type VoiceType = "low" | "high";

/**
 * How much higher a voice's formants run: a high voice's (alto, soprano,
 * child) about 15% above a low voice's (bass, baritone, tenor). The pitch
 * alone cannot say which voice it is, since men and women both sing between
 * about G3 and E4, and guessing from it compared a man's [o] above G3 with a
 * woman's and called it [u]. So the singer says; the pitch is only a first guess.
 */
export const formantScale = (f0: number, voice?: VoiceType) =>
  (voice ?? guessVoice(f0)) === "high" ? 1.15 : 1;
export const guessVoice = (f0: number): VoiceType => (f0 >= 200 ? "high" : "low");

export function classifyVowel(f: Formants, f0: number, voice?: VoiceType): VowelGuess {
  const scale = formantScale(f0, voice);
  const dist = VOWELS.map((v) => {
    const d1 = bark(f.f1) - bark(v.f1 * scale);
    // Back vowels bring F2 down beside F1, and the outline can merge the
    // two; with no F2 of its own, F1 alone decides.
    const d2 = f.f2 === null ? (v.f2 < 1300 ? 0 : 3) : bark(f.f2) - bark(v.f2 * scale);
    return { v, d: Math.hypot(d1, 0.8 * d2) };
  }).sort((a, b) => a.d - b.d);
  const [best, next] = dist;
  const clear = Math.max(0, Math.min(1, 1 - best.d / (next.d + 1e-6)));
  const confidence = f0 > ROUGH_ABOVE_HZ ? Math.min(clear, 0.4) : clear;
  return { vowel: best.v.id, confidence, reliable: f0 < RELIABLE_BELOW_HZ };
}

/**
 * H1 against H2 (dB): high is a breathy, flowing onset, low or negative a
 * pressed one. Ring (dB): the share of energy from 2 to 4 kHz, where a voice
 * that carries has its singer's formant. Brightness: the spectrum's centre of
 * gravity, in Hz.
 */
export function toneMeasures(h: HarmonicLevel[], f0: number) {
  const at = (k: number) => h.find((x) => x.k === k)?.db ?? -FLOOR_DB;
  const energy = (x: HarmonicLevel) => 10 ** (x.db / 10);
  const total = h.reduce((a, x) => a + energy(x), 0) || 1e-12;
  const ring = h.filter((x) => x.hz >= 2000 && x.hz <= 4000).reduce((a, x) => a + energy(x), 0);
  const centroidHz = h.reduce((a, x) => a + x.hz * energy(x), 0) / total;
  return {
    h1h2: at(1) - at(2),
    ringDb: 10 * Math.log10(ring / total + 1e-12),
    centroidHz,
    brightness: centroidHz / f0,
  };
}
