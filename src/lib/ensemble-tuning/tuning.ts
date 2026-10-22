/**
 * The Ensemble tab's rules: how in tune each note is, which part sang or
 * played it, and how each part did. Pure, so the unit tests hold them
 * (tests/unit/ensemble-tuning.test.ts); the listening is in analyse.ts.
 *
 * Tuning is judged against equal temperament at the tuner's A (Blaine,
 * 22 October 2026: against A440, so a choir sagging flat together shows
 * everywhere, which OmniPitch's own rule - each note against the notes around
 * it - would hide).
 */

/** A separated note's slow pitch, as OmniPitch's /api/curve: cents from the written note at A440. */
export interface NoteCurve {
  /** Seconds of the first point, from the take's start, and between points. */
  t0: number;
  dt: number;
  /** Loudness-weighted mean, in cents. */
  center: number;
  /** Slow movement and the rest (vibrato, wobble), per point, in cents, around `center`. */
  drift: Float32Array | number[];
  mod: Float32Array | number[];
  /** False where the tracker slipped (spikes): the pitch is still used, the trace is not drawn. */
  drawn: boolean;
}

export interface MeasuredNote {
  start: number;
  end: number;
  /** The written note (MIDI) it is heard as. */
  midi: number;
  /** Loudness, 0..1. */
  velocity: number;
  /** The pitch heard, in cents from `midi` at A440: the held pitch where measured, else Basic Pitch's own. */
  a440Cents: number;
  /** True when that came from the note's own separated pitch curve (Basic Pitch alone reads to about 33 cents). */
  measured: boolean;
  /** False where the two readings disagree (combineReadings): drawn as unsure, left out of the parts' figures. */
  sure: boolean;
  curve?: NoteCurve;
}

/** Two readings of a note further apart than this leave it unsure. */
export const AGREE_CENTS = 12;

/**
 * One reading from two: the separated curve's held pitch, and the mix's own
 * harmonics where no other note covers them (harmonic-pitch.ts). Measured on
 * the Choral Singing Dataset quartets (scripts/check-ensemble-real.ts), where
 * they agree the error is about 4-5 cents (median) and three notes in four
 * are within 10. Where they disagree the harmonics are nearer (median 11
 * cents against the separation's 19: the separated curve can lock onto a
 * neighbour's partial), but a fifth are still off by more than 25, so such a
 * note is shown as unsure rather than out of tune, and left out of the parts'
 * figures. With one reading only, it stands, as sure.
 */
export function combineReadings(separated: number | null, harmonic: number | null): { cents: number; sure: boolean } | null {
  if (separated === null && harmonic === null) return null;
  if (separated === null) return { cents: harmonic!, sure: true };
  if (harmonic === null) return { cents: separated, sure: true };
  if (Math.abs(separated - harmonic) <= AGREE_CENTS) return { cents: (separated + harmonic) / 2, sure: true };
  return { cents: harmonic, sure: false };
}

/** Cents above A440 of an A of `a4` Hz. */
export const a4Offset = (a4: number) => 1200 * Math.log2(a4 / 440);

/**
 * How far a note is from equal temperament at the tuner's A, signed (sharp
 * positive), and the note that is nearest: a note heard 60 cents flat of D is
 * 40 cents sharp of C sharp, and is read as that.
 */
export function tuningOf(n: Pick<MeasuredNote, "midi" | "a440Cents">, a4 = 440): { midi: number; cents: number } {
  const c = n.a440Cents - a4Offset(a4);
  const shift = Math.round(c / 100);
  return { midi: n.midi + shift, cents: c - 100 * shift };
}

/** In tune within this, as the tuner's green. */
export const IN_TUNE_CENTS = 10;
/** Off past this, as the tuner's red. */
export const OFF_CENTS = 25;

// ---------------------------------------------------------------------------
// The held pitch (OmniPitch index.html `heldPitch`)

/** Slower than this (cents a second), the voice is holding a pitch; a scoop or slide moves faster. */
const STEADY_SLOPE = 100;

/**
 * Where a note is held, from its slow pitch (centre + drift): the stretches
 * where it stays put (each at least 0.12 s), and the pitch heard, their
 * median. The loudness-weighted mean is pulled off by a scoop into the note
 * and its fall at the end; the held pitch is what a listener hears as the
 * note's tuning.
 */
export function heldPitch(c: Pick<NoteCurve, "center" | "drift" | "dt">): number {
  const n = c.drift.length;
  const slow = (i: number) => c.center + c.drift[i];
  if (n < 3 || !c.dt) return c.center;
  const k = Math.max(1, Math.round(0.01 / c.dt)); // slope over ±10 ms
  const runs: { a: number; b: number; level: number; frames: number[] }[] = [];
  let run: { a: number; b: number } | null = null;
  const close = () => {
    if (run && (run.b - run.a) * c.dt >= 0.12) {
      const v = Array.from({ length: run.b - run.a }, (_, q) => slow(run!.a + q)).sort((x, y) => x - y);
      runs.push({ a: run.a, b: run.b, level: v[v.length >> 1], frames: v });
    }
    run = null;
  };
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - k), hi = Math.min(n - 1, i + k);
    const slope = Math.abs(slow(hi) - slow(lo)) / ((hi - lo) * c.dt);
    if (slope > STEADY_SLOPE || (run && Math.abs(slow(i) - slow(run.a)) > 40)) close();
    if (slope <= STEADY_SLOPE) {
      run ??= { a: i, b: i };
      run.b = i + 1;
    }
  }
  close();
  // Runs a brief wobble broke apart, at the same pitch, are one run.
  for (let i = runs.length - 1; i > 0; i--) {
    const a = runs[i - 1], b = runs[i];
    if (Math.abs(a.level - b.level) < 40 && (b.a - a.b) * c.dt < 0.08) {
      a.frames = a.frames.concat(b.frames).sort((x, y) => x - y);
      a.level = a.frames[a.frames.length >> 1];
      a.b = b.b;
      runs.splice(i, 1);
    }
  }
  const all = runs.flatMap((r) => r.frames).sort((x, y) => x - y);
  return all.length ? all[all.length >> 1] : c.center;
}

/**
 * A curve is drawn only if it tracked the note: a jump of over 60 cents
 * between neighbouring points (real vibrato moves about 5) is a slip, on a
 * weak or misheard note, and would draw as spikes.
 */
export function curveTracks(drift: ArrayLike<number>, mod: ArrayLike<number>): boolean {
  for (let i = 1; i < drift.length; i++) {
    if (Math.abs(drift[i] + mod[i] - drift[i - 1] - mod[i - 1]) >= 60) return false;
  }
  return true;
}

/** Basic Pitch's own reading, loudness-weighted, for a note whose separation gave nothing. */
export function roughCents(cents: ArrayLike<number>, amp: ArrayLike<number>): number {
  let s = 0, w = 0;
  for (let i = 0; i < cents.length; i++) {
    s += cents[i] * amp[i];
    w += amp[i];
  }
  return w > 0 ? s / w : 0;
}

// ---------------------------------------------------------------------------
// Separation windows (polypitch separate.rs `note_windows`)

const TAIL = 0.4, REGION_PAD = 1.0, WINDOW = 6.0;

/**
 * Notes grouped into shared crops, so one fit separates several: a note joins
 * a window that holds its whole span (a second either side, plus its tail).
 * Each window: its seconds [a, b] and the indices of the notes it measures.
 */
export function planWindows(notes: { start: number; end: number }[]): { a: number; b: number; members: number[] }[] {
  const span = (j: number): [number, number] => [Math.max(0, notes[j].start - REGION_PAD), notes[j].end + TAIL + REGION_PAD];
  let left = notes.map((_, j) => j).sort((p, q) => span(p)[0] - span(q)[0]);
  const out: { a: number; b: number; members: number[] }[] = [];
  while (left.length) {
    const a = span(left[0])[0];
    const b = Math.max(a + WINDOW, span(left[0])[1]);
    out.push({ a, b, members: left.filter((j) => span(j)[1] <= b) });
    left = left.filter((j) => span(j)[1] > b);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Parts

export type EnsembleKind = "voices" | "instruments";

/** The parts' names, top first: a four-part choir is SATB; anything else is numbered from the top. */
export function partNames(count: number, kind: EnsembleKind): string[] {
  if (kind === "voices" && count === 4) return ["Soprano", "Alto", "Tenor", "Bass"];
  if (count === 2) return ["Upper", "Lower"];
  if (count === 3) return ["Top", "Middle", "Bottom"];
  return Array.from({ length: count }, (_, i) => `Part ${i + 1}`);
}

/** Notes starting within this of each other are one onset (a chord). */
const ONSET = 0.06;
/** How strongly a part is pulled back to its own register, against following its last note (semitones per semitone). */
const ANCHOR = 0.5;
/** A part silent this long has forgotten its last note: it is back at its register. */
const FORGET = 2.0;
/** Where the parts are read from: a moment every this many seconds. */
const VOTE_STEP = 0.05;
/** Notes shorter than this are not counted among those sounding (a ghost or a slip of the detector). */
const VOTE_MIN = 0.1;

/**
 * Which part each note belongs to (0 the top). Wherever exactly as many notes
 * sound as there are parts, their order from the top says whose each is, and
 * each moment is a vote; a note takes the part most of its moments gave it.
 * That is most notes in a chorale. The rest (a part resting, or a note the
 * detector added) are placed by `followParts`, each going to the free part
 * whose line, there, is nearest.
 *
 * Measured on the Choral Singing Dataset quartets' score notes: going note by
 * note through onsets alone, a part that rested was taken over by its
 * neighbour, and singers coming in up to 0.12 s apart split a chord across
 * two onsets (Rossinyol's tenor sat in the bass slot through every bass rest).
 */
export function assignParts(notes: { start: number; end: number; midi: number }[], count: number): number[] {
  if (!notes.length || count <= 1) return new Array<number>(notes.length).fill(0);
  const votes = notes.map(() => new Array<number>(count).fill(0));
  let t0 = Infinity, t1 = -Infinity;
  for (const n of notes) {
    t0 = Math.min(t0, n.start);
    t1 = Math.max(t1, n.end);
  }
  const counted = notes.map((_, j) => j).filter((j) => notes[j].end - notes[j].start >= VOTE_MIN);
  for (let t = t0; t < t1; t += VOTE_STEP) {
    const now = counted.filter((j) => notes[j].start <= t && notes[j].end > t);
    if (now.length !== count) continue;
    now.sort((p, q) => notes[q].midi - notes[p].midi).forEach((j, r) => votes[j][r]++);
  }
  const part = votes.map((v) => (v.some((x) => x > 0) ? v.indexOf(Math.max(...v)) : -1));
  if (part.every((p) => p < 0)) return followParts(notes, count);
  // Each part's line from its voted notes: its pitch at any time is that of its nearest voted note.
  const lines = Array.from({ length: count }, () => [] as { t: number; midi: number }[]);
  part.forEach((p, j) => p >= 0 && lines[p].push({ t: (notes[j].start + notes[j].end) / 2, midi: notes[j].midi }));
  lines.forEach((l) => l.sort((a, b) => a.t - b.t));
  const register = registers(notes, count);
  const lineAt = (p: number, t: number) => {
    const l = lines[p];
    if (!l.length) return register[p];
    let best = l[0];
    for (const x of l) if (Math.abs(x.t - t) < Math.abs(best.t - t)) best = x;
    return best.midi;
  };
  const rest = part.map((p, j) => (p < 0 ? j : -1)).filter((j) => j >= 0).sort((p, q) => notes[p].start - notes[q].start);
  for (const j of rest) {
    const n = notes[j], mid = (n.start + n.end) / 2;
    const taken = new Set(part.filter((p, k) => p >= 0 && k !== j && notes[k].start < n.end - 0.05 && notes[k].end > n.start + 0.05));
    let free = Array.from({ length: count }, (_, p) => p).filter((p) => !taken.has(p));
    if (!free.length) free = Array.from({ length: count }, (_, p) => p);
    part[j] = free.reduce((b, p) => (Math.abs(n.midi - lineAt(p, mid)) < Math.abs(n.midi - lineAt(b, mid)) ? p : b), free[0]);
  }
  return part;
}

/** Each part's register: its share of the take's range, by how long each pitch sounds, the top part highest. */
function registers(notes: { start: number; end: number; midi: number }[], count: number): number[] {
  const byPitch = notes.map((n) => ({ m: n.midi, d: Math.max(0.01, n.end - n.start) })).sort((a, b) => a.m - b.m);
  const total = byPitch.reduce((a, x) => a + x.d, 0);
  const quantile = (q: number) => {
    let acc = 0;
    for (const x of byPitch) if ((acc += x.d) >= q * total) return x.m;
    return byPitch[byPitch.length - 1].m;
  };
  return Array.from({ length: count }, (_, i) => quantile((count - i - 0.5) / count));
}

/**
 * Parts note by note, for a take where the full chord never sounds: the
 * notes of each onset, high to low, go to the free parts without crossing, at
 * the least cost - each note's distance from the part's last note, plus half
 * its distance from the part's register, the last note fading back to the
 * register over a rest of two seconds.
 */
function followParts(notes: { start: number; end: number; midi: number }[], count: number): number[] {
  const part = new Array<number>(notes.length).fill(0);
  const register = registers(notes, count);
  const last = register.slice();
  const lastEnd = new Array<number>(count).fill(-Infinity);
  const busyUntil = new Array<number>(count).fill(-Infinity);
  const order = notes.map((_, j) => j).sort((p, q) => notes[p].start - notes[q].start || notes[q].midi - notes[p].midi);
  for (let i = 0; i < order.length; ) {
    const t = notes[order[i]].start;
    const onset: number[] = [];
    while (i < order.length && notes[order[i]].start - t < ONSET) onset.push(order[i++]);
    onset.sort((p, q) => notes[q].midi - notes[p].midi);
    const at = last.map((m, p) => {
      const keep = Math.max(0, 1 - Math.max(0, t - lastEnd[p]) / FORGET);
      return keep * m + (1 - keep) * register[p];
    });
    let free = last.map((_, p) => p).filter((p) => busyUntil[p] <= t + ONSET);
    if (!free.length) free = last.map((_, p) => p);
    const m = onset.length, k = free.length;
    const cost = (a: number, p: number) => {
      const midi = notes[onset[a]].midi, q = free[p];
      return Math.abs(midi - at[q]) + ANCHOR * Math.abs(midi - register[q]);
    };
    let chosen: number[];
    if (m <= k) {
      const best: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(k + 1).fill(Infinity));
      for (let p = 0; p <= k; p++) best[0][p] = 0;
      for (let a = 1; a <= m; a++)
        for (let p = a; p <= k; p++) best[a][p] = Math.min(best[a][p - 1], best[a - 1][p - 1] + cost(a - 1, p - 1));
      chosen = new Array<number>(m);
      for (let a = m, p = k; a > 0; p--) {
        if (p >= a && best[a][p] === best[a - 1][p - 1] + cost(a - 1, p - 1)) {
          chosen[a - 1] = free[p - 1];
          a--;
        }
      }
    } else {
      chosen = onset.map((_, a) => free[free.map((_, p) => p).reduce((b, p) => (cost(a, p) < cost(a, b) ? p : b), 0)]);
    }
    onset.forEach((j, a) => {
      const p = chosen[a];
      part[j] = p;
      last[p] = notes[j].midi;
      lastEnd[p] = Math.max(lastEnd[p], notes[j].end);
      busyUntil[p] = Math.max(busyUntil[p], notes[j].end);
    });
  }
  return part;
}

export interface PartSummary {
  part: number;
  name: string;
  notes: number;
  /** Seconds of notes. */
  seconds: number;
  /** Time-weighted mean of the signed cents: which way the part leans. */
  meanCents: number;
  /** Share of its note time within IN_TUNE_CENTS, 0..1. */
  inTune: number;
  /** Notes past OFF_CENTS. */
  offNotes: number;
  /** Notes left out as unsure. */
  unsure: number;
}

/** How each part did, and the whole group as part -1, from the notes read surely. */
export function summarise(
  notes: MeasuredNote[],
  parts: number[],
  names: string[],
  a4 = 440
): { parts: PartSummary[]; all: PartSummary } {
  const make = (part: number, name: string): PartSummary => ({ part, name, notes: 0, seconds: 0, meanCents: 0, inTune: 0, offNotes: 0, unsure: 0 });
  const out = names.map((name, p) => make(p, name));
  const all = make(-1, "Everyone");
  notes.forEach((n, j) => {
    const { cents } = tuningOf(n, a4);
    const d = Math.max(0, n.end - n.start);
    for (const s of [out[parts[j]], all]) {
      if (!s) continue;
      if (!n.sure) {
        s.unsure++;
        continue;
      }
      s.notes++;
      s.seconds += d;
      s.meanCents += cents * d;
      if (Math.abs(cents) <= IN_TUNE_CENTS) s.inTune += d;
      if (Math.abs(cents) > OFF_CENTS) s.offNotes++;
    }
  });
  for (const s of [...out, all]) {
    if (s.seconds > 0) {
      s.meanCents /= s.seconds;
      s.inTune /= s.seconds;
    }
  }
  return { parts: out, all };
}

/** "18¢ flat", "6¢ sharp", "in tune" (within 2 cents). */
export function leanWords(cents: number): string {
  const r = Math.round(Math.abs(cents));
  if (r <= 2) return "in tune";
  return `${r}¢ ${cents < 0 ? "flat" : "sharp"}`;
}
