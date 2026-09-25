export interface RawPitch {
  frequency: number;
  /** NSDF value at the chosen peak, 0..1 (1 = perfectly periodic). */
  clarity: number;
}

export const MIN_FREQ_HZ = 50;
export const MAX_FREQ_HZ = 1500;
/** A key maximum this close to the highest one wins if it comes first. */
const KEY_MAX_RATIO = 0.9;
/** Keep any peak at least this strong as an alternative for the tracker. */
const CANDIDATE_RATIO = 0.6;
const MAX_CANDIDATES = 6;

/**
 * McLeod Pitch Method, returning every key maximum as a candidate rather than
 * committing to one. A single per-frame choice cannot recover from a frame
 * where the wrong peak happens to be tallest — the pYIN result: keep the
 * alternatives and let a temporal model choose. Candidates come back ordered
 * by lag (highest frequency first).
 */
export function detectCandidates(
  buffer: Float32Array,
  sampleRate: number
): RawPitch[] {
  const len = buffer.length;
  const minLag = Math.max(1, Math.floor(sampleRate / MAX_FREQ_HZ));
  const maxLag = Math.min(len - 2, Math.ceil(sampleRate / MIN_FREQ_HZ));

  // Prefix sums of squares so both segment energies are O(1) per lag.
  const sq = new Float64Array(len + 1);
  for (let i = 0; i < len; i++) sq[i + 1] = sq[i] + buffer[i] * buffer[i];
  if (sq[len] <= 0) return [];

  const nsdf = new Float32Array(maxLag + 1);
  for (let lag = 0; lag <= maxLag; lag++) {
    let acf = 0;
    const n = len - lag;
    for (let j = 0; j < n; j++) acf += buffer[j] * buffer[j + lag];
    const m = sq[n] + (sq[len] - sq[lag]);
    nsdf[lag] = m > 0 ? (2 * acf) / m : 0;
  }

  // Collect key maxima: the highest point of each positive lobe after the
  // first negative-going zero crossing.
  const peaks: { lag: number; value: number }[] = [];
  let lag = 1;
  while (lag <= maxLag && nsdf[lag] > 0) lag++; // skip the lobe at lag 0
  while (lag <= maxLag) {
    while (lag <= maxLag && nsdf[lag] <= 0) lag++;
    let bestLag = -1;
    let best = -Infinity;
    while (lag <= maxLag && nsdf[lag] > 0) {
      if (nsdf[lag] > best) {
        best = nsdf[lag];
        bestLag = lag;
      }
      lag++;
    }
    if (bestLag >= minLag) peaks.push({ lag: bestLag, value: best });
  }
  if (peaks.length === 0) return [];

  const refine = (l: number): RawPitch => {
    // Parabolic interpolation around the peak.
    const alpha = nsdf[l - 1];
    const beta = nsdf[l];
    const gamma = l < maxLag ? nsdf[l + 1] : nsdf[l];
    const denom = alpha - 2 * beta + gamma;
    const shift = denom !== 0 ? (0.5 * (alpha - gamma)) / denom : 0;
    return {
      frequency: sampleRate / (l + shift),
      clarity: Math.min(1, beta - 0.25 * (alpha - gamma) * shift),
    };
  };

  let highest = -Infinity;
  for (const p of peaks) highest = Math.max(highest, p.value);
  return peaks
    .filter((p) => p.value >= highest * CANDIDATE_RATIO)
    .slice(0, MAX_CANDIDATES)
    .map((p) => refine(p.lag));
}

/**
 * The single best estimate for callers with no temporal context: the first key
 * maximum within KEY_MAX_RATIO of the tallest, which is what avoids
 * octave-down errors on an isolated frame.
 */
export function detectPitch(
  buffer: Float32Array,
  sampleRate: number
): RawPitch | null {
  const candidates = detectCandidates(buffer, sampleRate);
  if (candidates.length === 0) return null;
  let best = candidates[0];
  for (const c of candidates) if (c.clarity > best.clarity) best = c;
  return candidates.find((c) => c.clarity >= best.clarity * KEY_MAX_RATIO) ?? best;
}
