/**
 * The Analysis tool's reading of a sung spectrum (tests:
 * tests/unit/voice-spectrum.test.ts). Pure functions over a dB magnitude
 * spectrum as an AnalyserNode reports it:
 *
 * - harmonicLevels: each harmonic of the note up to 5 kHz, in dB against the
 *   strongest.
 * - spectralEnvelope: the spectrum's outline, a smooth curve through the
 *   harmonics' peaks, where a vowel's resonances show as humps.
 * - lpcFormants: F1 and F2 by linear prediction from the waveform, for low
 *   and middle voices (below LPC_BELOW_HZ).
 * - estimateFormants: F1 and F2 by analysis by synthesis, for high voices. Every pair of
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
  const gate = Math.max(-60, floorDb + 8);
  const all = h.filter((x) => x.hz <= 4000);
  const heard = all.filter((x) => x.db > gate);
  if (heard.length < 3) return null;
  // Harmonics lost in the noise are not ignored: "nothing louder than the
  // floor here" is what rules out a resonance there. Ignoring them let a
  // back vowel, with almost nothing above 900 Hz, put F2 at the top of the
  // search, where no heard harmonic contradicted it.
  const quiet = all.filter((x) => x.db <= gate);
  const n = heard.length;
  const lx = heard.map((x) => Math.log2(x.hz / f0));
  const qlx = quiet.map((x) => Math.log2(x.hz / f0));
  const w = heard.map((x) => (x.hz <= 1500 ? 1 : x.hz <= 2500 ? 0.6 : 0.35));
  let sw = 0, swx = 0, swxx = 0;
  for (let i = 0; i < n; i++) { sw += w[i]; swx += w[i] * lx[i]; swxx += w[i] * lx[i] * lx[i]; }
  const den = sw * swxx - swx * swx || 1;
  const table = (grid: number[], bw: number, pts: HarmonicLevel[]) => grid.map((fc) => pts.map((x) => resonanceDb(x.hz, fc, bw)));

  const errorOf = (r1: number[], r2: number[], r3: number[], q1: number[], q2: number[], q3: number[]) => {
    let swy = 0, swxy = 0;
    const r = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      r[i] = heard[i].db - r1[i] - r2[i] - r3[i];
      swy += w[i] * r[i];
      swxy += w[i] * lx[i] * r[i];
    }
    const slope = (sw * swxy - swx * swy) / den;
    // A voice does not rise with frequency, nor fall more than 24 dB an octave.
    if (slope > 0 || slope < -24) return Infinity;
    const off = (swy - slope * swx) / sw;
    let e = 0;
    for (let i = 0; i < n; i++) e += w[i] * (r[i] - off - slope * lx[i]) ** 2;
    // A quiet harmonic the model would make audible counts against it.
    for (let j = 0; j < quiet.length; j++) {
      const over = off + slope * qlx[j] + q1[j] + q2[j] + q3[j] - gate;
      if (over > 0) e += 0.5 * over * over;
    }
    // A gentle pull toward an ordinary voice's slope, so the slope cannot
    // stand in for a resonance.
    e += 0.02 * (slope + 12) ** 2;
    return e / sw;
  };

  const t1 = table(F1_GRID, 90, heard), t2 = table(F2_GRID, 110, heard), t3 = table(F3_GRID, 150, heard);
  const u1 = table(F1_GRID, 90, quiet), u2 = table(F2_GRID, 110, quiet), u3 = table(F3_GRID, 150, quiet);
  let best = { i1: -1, i2: -1, i3: -1, err: Infinity };
  for (let i1 = 0; i1 < F1_GRID.length; i1++) {
    for (let i2 = 0; i2 < F2_GRID.length; i2++) {
      if (F2_GRID[i2] < F1_GRID[i1] + 150) continue;
      for (let i3 = 0; i3 < F3_GRID.length; i3++) {
        if (F3_GRID[i3] < F2_GRID[i2] + 250) continue;
        const err = errorOf(t1[i1], t2[i2], t3[i3], u1[i1], u2[i2], u3[i3]);
        if (err < best.err) best = { i1, i2, i3, err };
      }
    }
  }
  if (best.i1 < 0 || !Number.isFinite(best.err)) return null;

  // Refine F1 and F2 on a finer grid around the best, F3 where it was.
  const r3 = t3[best.i3], q3 = u3[best.i3];
  const c1 = F1_GRID[best.i1], c2 = F2_GRID[best.i2];
  let fine = { f1: c1, f2: c2, err: best.err };
  for (let f1 = Math.max(200, c1 - 30); f1 <= Math.min(1100, c1 + 30); f1 += 10) {
    const r1 = heard.map((x) => resonanceDb(x.hz, f1, 90)), q1 = quiet.map((x) => resonanceDb(x.hz, f1, 90));
    for (let f2 = Math.max(550, c2 - 60, f1 + 150); f2 <= Math.min(2900, c2 + 60); f2 += 20) {
      const err = errorOf(r1, heard.map((x) => resonanceDb(x.hz, f2, 110)), r3, q1, quiet.map((x) => resonanceDb(x.hz, f2, 110)), q3);
      if (err < fine.err) fine = { f1, f2, err };
    }
  }
  return { f1: fine.f1, f2: fine.f2, fit: Math.sqrt(fine.err) };
}

/** Below this pitch the vowel is read by LPC from the waveform; above it, by analysis by synthesis. */
export const LPC_BELOW_HZ = 260;

/**
 * F1 and F2 by linear prediction (LPC), the speech lab's method, from a
 * stretch of the microphone's signal (at least 30 ms). The signal is
 * low-passed and taken down to about 12 kHz, lifted 6 dB an octave, windowed,
 * and fitted with a 12-pole filter; each resonance is a pair of the filter's
 * poles, whose angle is its frequency and whose distance from the unit circle
 * its width.
 *
 * Why both methods: on Blaine's own recording (chest voice around F3) LPC
 * named every vowel steadily, where analysis by synthesis flipped between two
 * near-equal answers frame to frame, [a] and [o] for [e]. LPC in turn goes
 * wrong on a high voice, whose widely spaced harmonics pull the poles onto
 * them; that is where analysis by synthesis did well (his falsetto).
 */
export function lpcFormants(samples: Float32Array, sampleRate: number): Formants | null {
  const D = Math.max(1, Math.round(sampleRate / 12000));
  const fs = sampleRate / D;
  // Low-pass below the new Nyquist: a windowed-sinc FIR, then keep every Dth.
  const taps = 31, cut = 0.45 / D;
  const h = new Float64Array(taps);
  for (let i = 0; i < taps; i++) {
    const m = i - (taps - 1) / 2;
    const sinc = m === 0 ? 2 * cut : Math.sin(2 * Math.PI * cut * m) / (Math.PI * m);
    h[i] = sinc * (0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (taps - 1)));
  }
  const len = Math.floor((samples.length - taps) / D);
  const N = Math.min(len, Math.round(0.03 * fs));
  if (N < 200) return null;
  const x = new Float64Array(N);
  const start = len - N;
  for (let k = 0; k < N; k++) {
    const base = (start + k) * D;
    let acc = 0;
    for (let i = 0; i < taps; i++) acc += h[i] * samples[base + i];
    x[k] = acc;
  }
  for (let k = N - 1; k > 0; k--) x[k] -= 0.97 * x[k - 1];
  for (let k = 0; k < N; k++) x[k] *= 0.54 - 0.46 * Math.cos((2 * Math.PI * k) / (N - 1));

  const p = 12;
  const r = new Float64Array(p + 1);
  for (let k = 0; k <= p; k++) for (let i = k; i < N; i++) r[k] += x[i] * x[i - k];
  if (r[0] <= 0) return null;
  r[0] *= 1.0001; // a touch of white noise keeps the solution stable
  let a = new Float64Array(p + 1);
  a[0] = 1;
  let err = r[0];
  for (let i = 1; i <= p; i++) {
    let acc = r[i];
    for (let j = 1; j < i; j++) acc += a[j] * r[i - j];
    const k = -acc / err;
    const next = a.slice();
    for (let j = 1; j < i; j++) next[j] = a[j] + k * a[i - j];
    next[i] = k;
    a = next;
    err *= 1 - k * k;
    if (err <= 0) return null;
  }

  // The poles: roots of z^p + a1 z^(p-1) + ... + ap, by Durand-Kerner.
  let zr = Array.from({ length: p }, (_, i) => 0.9 * Math.cos((2 * Math.PI * i) / p + 0.4));
  let zi = Array.from({ length: p }, (_, i) => 0.9 * Math.sin((2 * Math.PI * i) / p + 0.4));
  for (let it = 0; it < 120; it++) {
    const nr = zr.slice(), ni = zi.slice();
    let moved = 0;
    for (let i = 0; i < p; i++) {
      let pr = 1, pi = 0;
      for (let j = 1; j <= p; j++) {
        const tr = pr * zr[i] - pi * zi[i] + a[j];
        pi = pr * zi[i] + pi * zr[i];
        pr = tr;
      }
      let dr = 1, di = 0;
      for (let j = 0; j < p; j++) {
        if (j === i) continue;
        const tr = zr[i] - zr[j], ti = zi[i] - zi[j];
        const mr = dr * tr - di * ti;
        di = dr * ti + di * tr;
        dr = mr;
      }
      const den = dr * dr + di * di || 1e-18;
      const qr = (pr * dr + pi * di) / den, qi = (pi * dr - pr * di) / den;
      nr[i] = zr[i] - qr;
      ni[i] = zi[i] - qi;
      moved = Math.max(moved, Math.abs(qr) + Math.abs(qi));
    }
    zr = nr; zi = ni;
    if (moved < 1e-9) break;
  }
  const poles = zr
    .map((re, i) => ({ re, im: zi[i] }))
    .filter((z) => z.im > 1e-6)
    .map((z) => ({ hz: (Math.atan2(z.im, z.re) * fs) / (2 * Math.PI), bw: (-Math.log(Math.hypot(z.re, z.im)) * fs) / Math.PI }))
    .filter((q) => q.hz > 180 && q.bw > 0 && q.bw < 500)
    .sort((u, v) => u.hz - v.hz);
  const f1 = poles.find((q) => q.hz <= 1100);
  if (!f1) return null;
  const f2 = poles.find((q) => q.hz >= f1.hz + 150 && q.hz <= 3000);
  return { f1: f1.hz, f2: f2 ? f2.hz : null };
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
