/**
 * A note's pitch read straight from the mix, from its own harmonics where no
 * other note sounding with it has a harmonic close by. Where a harmonic is
 * shared (the upper note of an octave has every one of its harmonics inside
 * the lower note's), the two cannot be told apart at a beat's resolution and
 * separation splits the energy between them, so a shared harmonic is left
 * out and the note is read from the rest. A note with none of its own (the
 * octave above another part) gets null, and keeps separation's reading.
 */

export interface SoundingNote {
  start: number;
  end: number;
  /** Its frequency now (Hz), as near as known: the written note and a first reading. */
  freq: number;
}

/** FFT size and hop: about 186 ms at 44.1 kHz, so neighbouring harmonics of low voices fall in separate bins. */
const N = 8192;
const HOP_S = 0.02;
const MAX_HARMONIC = 10;
const TOP_HZ = 5000;

let hann: Float32Array | null = null;
const window_ = () => (hann ??= Float32Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N)));

/** In-place radix-2 FFT of re/im (length N). */
function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

export interface HarmonicReading {
  /** Cents from `ref` Hz: the median over the note's frames. */
  cents: number;
  /** Frames read, and the harmonics used on average. */
  frames: number;
  harmonics: number;
}

/**
 * Note `j`'s pitch in cents from `ref` Hz (its written note at A440), from
 * the middle of its length (the attack and release left out), or null.
 */
export function harmonicPitch(
  samples: Float32Array,
  sampleRate: number,
  notes: SoundingNote[],
  j: number,
  ref: number
): HarmonicReading | null {
  const note = notes[j];
  const dur = note.end - note.start;
  const t0 = note.start + Math.min(0.15, 0.25 * dur), t1 = note.end - Math.min(0.1, 0.15 * dur);
  if (t1 - t0 < 0.05) return null;
  const binHz = sampleRate / N;
  // Harmonics another note comes within this of are shared: three bins (the window's main lobe and a margin).
  const near = 3 * binHz;
  const others = notes.filter((o, k) => k !== j && o.start < t1 && o.end > t0);
  const free: number[] = [];
  for (let h = 1; h <= MAX_HARMONIC; h++) {
    const f = h * note.freq;
    if (f > TOP_HZ || f > sampleRate / 2 - 4 * binHz) break;
    const clash = others.some((o) => {
      for (let m = 1; m * o.freq < f + near * 2 && m <= 24; m++) if (Math.abs(m * o.freq - f) < Math.max(near, f * 0.03)) return true;
      return false;
    });
    if (!clash) free.push(h);
  }
  if (!free.length) return null;

  const w = window_();
  const re = new Float64Array(N), im = new Float64Array(N);
  const readings: number[] = [];
  let used = 0;
  for (let t = t0; t <= t1; t += HOP_S) {
    const c = Math.round(t * sampleRate) - N / 2;
    if (c < 0 || c + N > samples.length) continue;
    for (let i = 0; i < N; i++) {
      re[i] = samples[c + i] * w[i];
      im[i] = 0;
    }
    fft(re, im);
    const mag = (k: number) => Math.log(re[k] * re[k] + im[k] * im[k] + 1e-20);
    let floor = -Infinity;
    // The frame's loudest bin under TOP_HZ, for a floor: a harmonic 50 dB under it is noise.
    for (let k = 1; k < TOP_HZ / binHz; k++) floor = Math.max(floor, mag(k));
    floor -= Math.log(1e5);
    let sum = 0, wsum = 0;
    for (const h of free) {
      const f = h * note.freq;
      // The highest bin within 50 cents of where it should be.
      const lo = Math.max(1, Math.floor((f * 2 ** (-50 / 1200)) / binHz)), hi = Math.ceil((f * 2 ** (50 / 1200)) / binHz);
      let k = lo;
      for (let q = lo; q <= hi; q++) if (mag(q) > mag(k)) k = q;
      if (k === lo || k === hi || mag(k) < floor) continue; // at the edge: no peak inside
      const a = mag(k - 1), b = mag(k), g = mag(k + 1);
      const p = (0.5 * (a - g)) / (a - 2 * b + g);
      const fh = (k + p) * binHz;
      const weight = Math.exp(b / 2); // amplitude
      sum += weight * 1200 * Math.log2(fh / (h * ref));
      wsum += weight;
      used++;
    }
    if (wsum > 0) readings.push(sum / wsum);
  }
  if (readings.length < 2) return null;
  readings.sort((x, y) => x - y);
  return { cents: readings[readings.length >> 1], frames: readings.length, harmonics: used / readings.length };
}
