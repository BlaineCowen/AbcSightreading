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
/** Above about C5 the envelope cannot show F1 and F2 apart. */
export const RELIABLE_BELOW_HZ = 520;

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
 * F1 and F2 that best explain the harmonics' levels. `fit` is how far off the
 * best prediction still is, in dB per harmonic: small is a clean vowel.
 */
export function estimateFormants(h: HarmonicLevel[], f0: number): (Formants & { fit: number }) | null {
  const pts = h.filter((x) => x.hz <= 4000 && x.db > -60);
  if (pts.length < 3) return null;
  const f3 = 2600 * formantScale(f0);
  const lx = pts.map((x) => Math.log2(x.hz / f0));
  const n = pts.length;
  let sx = 0, sxx = 0;
  for (const v of lx) { sx += v; sxx += v * v; }
  const den = n * sxx - sx * sx || 1;
  const third = pts.map((x) => resonanceDb(x.hz, f3, 150));

  const errorOf = (f1: number, f2: number) => {
    let sy = 0, sxy = 0;
    const r = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      r[i] = pts[i].db - resonanceDb(pts[i].hz, f1, 90) - resonanceDb(pts[i].hz, f2, 110) - third[i];
      sy += r[i]; sxy += lx[i] * r[i];
    }
    const slope = (n * sxy - sx * sy) / den;
    // A voice does not rise with frequency, nor fall 20 dB an octave.
    if (slope > 0 || slope < -20) return Infinity;
    const off = (sy - slope * sx) / n;
    let e = 0;
    for (let i = 0; i < n; i++) e += (r[i] - off - slope * lx[i]) ** 2;
    return e;
  };

  let best = { f1: 0, f2: 0, err: Infinity };
  const search = (f1lo: number, f1hi: number, f1step: number, f2lo: number, f2hi: number, f2step: number) => {
    for (let f1 = f1lo; f1 <= f1hi; f1 += f1step) {
      for (let f2 = Math.max(f2lo, f1 + 150); f2 <= f2hi; f2 += f2step) {
        const err = errorOf(f1, f2);
        if (err < best.err) best = { f1, f2, err };
      }
    }
  };
  search(200, 1100, 30, 600, 2900, 60);
  if (!Number.isFinite(best.err)) return null;
  const c = best;
  search(Math.max(200, c.f1 - 30), Math.min(1100, c.f1 + 30), 10, Math.max(600, c.f2 - 60), Math.min(2900, c.f2 + 60), 20);
  return { f1: best.f1, f2: best.f2, fit: Math.sqrt(best.err / n) };
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

/** How much higher a voice's formants run, from its pitch (a treble voice's are about 15% higher). */
export const formantScale = (f0: number) => (f0 >= 200 ? 1.15 : 1);

export function classifyVowel(f: Formants, f0: number): VowelGuess {
  const scale = formantScale(f0);
  const dist = VOWELS.map((v) => {
    const d1 = bark(f.f1) - bark(v.f1 * scale);
    // Back vowels bring F2 down beside F1, and the outline can merge the
    // two; with no F2 of its own, F1 alone decides.
    const d2 = f.f2 === null ? (v.f2 < 1300 ? 0 : 3) : bark(f.f2) - bark(v.f2 * scale);
    return { v, d: Math.hypot(d1, 0.8 * d2) };
  }).sort((a, b) => a.d - b.d);
  const [best, next] = dist;
  const confidence = Math.max(0, Math.min(1, 1 - best.d / (next.d + 1e-6)));
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
