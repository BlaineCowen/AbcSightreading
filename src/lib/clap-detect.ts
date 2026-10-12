/**
 * Claps from the microphone, for grading a rhythm (grade-rhythm.ts).
 *
 * The clap worklet (public/clap-detector.js) reports, for every 128-sample
 * block (about 2.7 ms), the power above about 1.5 kHz and the power over the
 * whole band, stamped on the page's clock (performance.now). A clap is
 * broadband and sudden; a voice puts little of itself above 1.5 kHz and the
 * room's hum none, so the high band carries the claps. The tuner's own frames
 * are 2048 samples and stamped when they reach the main thread, which is too
 * coarse and too jittery for this.
 *
 * Two readings of the same blocks:
 * - one person (`detectClaps`): every sudden rise of the high band, at least
 *   CLAP_REFRACTORY_MS apart, is a clap, timed where it crosses the threshold;
 * - a class (`detectBursts`): a room clapping together is a burst tens of ms
 *   wide. Each burst is one clap, timed where half its energy has arrived
 *   (the middle of the room), with how wide it was (`spread`, how together
 *   the class is) and how loud (how much of the class clapped).
 */

export type ClapBlock = { t: number; hi: number; full: number };
export type Clap = { t: number; level: number; spread?: number; voiced?: boolean };

/** A clap rises this far above the running floor. */
export const CLAP_RISE_DB = 9;
/** The floor: the median of the high band over this much before. */
const FLOOR_MS = 300;
/**
 * A clap is sudden: it peaks RISE_DB above the quietest of the RISE_MS before
 * it. A real clap rose 40 dB or more in Blaine's run; the bumps in a clap's
 * own ring (a reflection 60 ms on rose 12 dB) did not, and at 9 dB over 10 ms
 * they were counted as a second clap each.
 */
const RISE_MS = 30;
const RISE_DB = 20;
/** No quieter than this (dB of the high band's power): the room's own noise. */
const ABS_GATE_DB = -70;
/** The peak is looked for this soon after the crossing. */
const PEAK_MS = 15;
/** Two claps of one person are at least this far apart (a clap rings on). */
export const CLAP_REFRACTORY_MS = 60;
/** A sound this much louder than what crossed first, within the refractory time, is the clap. */
const LOUDER_DB = 10;
/** At its peak at least this share of a clap's power is in the high band (a voice's is far less). */
const HI_SHARE = 0.15;
/**
 * A class's burst needs less: a room chanting "ta" on the clap fills the low
 * band, and a whole room's clap peaked with 8-20% of its power up high in
 * Blaine's runs. At 0.15 the clap on beat 2 of his 8 October run (43 dB over
 * the quiet before it) was thrown away and the note marked missed (89, should
 * have been 100); at 0.08 it grades 100, and no other run sent did worse. A
 * chant that gets through is marked voiced and never counts as a stray.
 */
const CLASS_HI_SHARE = 0.08;
/** A class's burst: gaps shorter than this inside it do not end it. */
const BURST_GAP_MS = 30;
/** A burst wider than this is two (a fast rhythm clapped raggedly): split at its quietest point. */
const BURST_MAX_MS = 200;

const db = (p: number) => 10 * Math.log10(p + 1e-12);

function median(xs: number[]): number {
  if (!xs.length) return -Infinity;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Each block's floor: the median high-band level over the FLOOR_MS before it. */
function floors(blocks: ClapBlock[]): number[] {
  const out: number[] = [];
  const levels = blocks.map((b) => db(b.hi));
  let from = 0;
  for (let i = 0; i < blocks.length; i++) {
    while (from < i && blocks[i].t - blocks[from].t > FLOOR_MS) from++;
    out.push(i === from ? levels[i] - CLAP_RISE_DB : median(levels.slice(from, i)));
  }
  return out;
}

/** One person's claps. */
export function detectClaps(blocks: ClapBlock[]): Clap[] {
  const floor = floors(blocks);
  const levels = blocks.map((b) => db(b.hi));
  const claps: Clap[] = [];
  let quietUntil = -Infinity;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const level = db(b.hi);
    if (b.t < quietUntil || level < ABS_GATE_DB || level - floor[i] < CLAP_RISE_DB) continue;
    const peakFrom = (k: number) => {
      let pk = k;
      for (let j = k + 1; j < blocks.length && blocks[j].t - blocks[k].t <= PEAK_MS; j++) if (blocks[j].hi > blocks[pk].hi) pk = j;
      return pk;
    };
    let peak = peakFrom(i);
    let before = Infinity;
    for (let j = i - 1; j >= 0 && b.t - blocks[j].t <= RISE_MS; j--) before = Math.min(before, levels[j]);
    if (before !== Infinity && levels[peak] - before < RISE_DB) continue;
    // A much louder sound just after is the clap; what crossed first was its
    // faint lead-in (or the click heard back), and the refractory time would
    // have hidden the clap itself (a Windows laptop, 12 October 2026: the
    // lead-in at 0.01, the clap 30 ms on at 0.5).
    let at = i;
    for (let j = peak + 1; j < blocks.length && blocks[j].t - b.t <= CLAP_REFRACTORY_MS; j++) {
      if (levels[j] < levels[peak] + LOUDER_DB) continue;
      at = j;
      peak = peakFrom(j);
    }
    const p = blocks[peak];
    if (p.hi < HI_SHARE * p.full) continue;
    claps.push({ t: blocks[at].t, level: Math.sqrt(p.hi) });
    quietUntil = blocks[at].t + CLAP_REFRACTORY_MS;
  }
  return claps;
}

/** A class clapping together: one clap a burst. */
export function detectBursts(blocks: ClapBlock[]): Clap[] {
  const floor = floors(blocks);
  // The blocks well above the floor, as runs; short gaps inside a run are kept.
  const runs: [number, number][] = [];
  for (let i = 0; i < blocks.length; i++) {
    const on = db(blocks[i].hi) >= ABS_GATE_DB && db(blocks[i].hi) - floor[i] >= CLAP_RISE_DB - 3;
    if (!on) continue;
    const last = runs[runs.length - 1];
    if (last && blocks[i].t - blocks[last[1]].t <= BURST_GAP_MS) last[1] = i;
    else runs.push([i, i]);
  }
  const out: Clap[] = [];
  const energy = (i: number) => Math.max(0, blocks[i].hi - Math.pow(10, floor[i] / 10));
  const read = (a: number, z: number) => {
    let peak = a;
    for (let i = a; i <= z; i++) if (blocks[i].hi > blocks[peak].hi) peak = i;
    if (blocks[peak].hi < CLASS_HI_SHARE * blocks[peak].full) return;
    if (blocks[z].t - blocks[a].t > BURST_MAX_MS) {
      // Split where it is quietest, away from its ends.
      const lo = a + Math.floor((z - a) * 0.2);
      const hi = z - Math.floor((z - a) * 0.2);
      let cut = lo;
      for (let i = lo; i <= hi; i++) if (energy(i) < energy(cut)) cut = i;
      read(a, cut);
      read(cut + 1, z);
      return;
    }
    let total = 0;
    for (let i = a; i <= z; i++) total += energy(i);
    if (total <= 0) return;
    const at = (share: number) => {
      let sum = 0;
      for (let i = a; i <= z; i++) {
        sum += energy(i);
        if (sum >= share * total) return blocks[i].t;
      }
      return blocks[z].t;
    };
    // Its level is the root of its whole energy, not its peak: twenty people a
    // few ms apart peak little higher than one, but their energy is twenty
    // times one's. So a level against the room's is the root of the share of
    // the room that clapped: one in twenty about 0.22, half the room 0.71.
    out.push({ t: at(0.5), level: Math.sqrt(total), spread: at(0.8) - at(0.2) });
  };
  for (const [a, z] of runs) read(a, z);
  return out;
}

/**
 * The page's own click, heard back through the microphone. The count-in
 * clicks while nobody should clap, so what the microphone hears just after
 * those clicks is the echo: its delay and its level are learned there.
 * Afterwards a sound at a click's echo is a clap only if it is clearly louder
 * than the echo (ECHO_MARGIN). With echo cancellation doing its job nothing is
 * learned and nothing is dropped.
 *
 * The delay matters since the listener hears the raw microphone (12 October
 * 2026): on a Windows laptop the click came back 160 ms after the beat, and
 * looked for only within 40 ms of the beat it was never learned. With the
 * clapper's own 100 ms forgiven as the microphone's, the echo then sat nearer
 * the note than the clap itself and took it, the clap marked "extra".
 */
export const ECHO_NEAR_MS = 40;
/**
 * A sound at the echo must be this many times the count-in's echo to be a
 * clap (9.5 dB): the run's echoes came back up to twice the count-in's (0.15
 * against 0.07), a clap at 0.37 and up.
 */
const ECHO_MARGIN = 3;
/** An echo is quieter than this share of the run's loud sounds, its claps (the Windows laptop's: 0.13). */
const ECHO_MAX_SHARE = 0.4;
/** The echo is looked for this long after each count-in click. */
export const ECHO_MAX_DELAY_MS = 300;
export function withoutClickEcho<T extends Clap>(claps: T[], clicks: number[], countInEnd: number): T[] {
  const delays: number[] = [];
  const levels: number[] = [];
  for (const k of clicks.filter((k) => k < countInEnd)) {
    const c = claps.find((c) => c.t >= k - ECHO_NEAR_MS && c.t <= k + ECHO_MAX_DELAY_MS && c.t < countInEnd);
    if (c) {
      delays.push(c.t - k);
      levels.push(c.level);
    }
  }
  if (delays.length < 2) return claps;
  const delay = median(delays);
  const echo = median(levels);
  // As loud as the run's own claps is not an echo: the room clapped along
  // with the count-in (Blaine's class, 8 October), and taken for the echo it
  // threw out every clap of the run.
  // The run's claps are its loud sounds (much of what is heard may be echo).
  const after = claps.filter((c) => c.t >= countInEnd).map((c) => c.level).sort((a, b) => a - b);
  const run = after.length ? after[Math.floor(after.length * 0.8)] : 0;
  if (run > 0 && echo > ECHO_MAX_SHARE * run) return claps;
  const near = (c: Clap) => clicks.some((k) => Math.abs(c.t - (k + delay)) <= ECHO_NEAR_MS);
  return claps.filter((c) => !(near(c) && c.level < echo * ECHO_MARGIN));
}

/**
 * The microphone's sound at about 16 kHz, its first sample at page time `t0`
 * (clap-listener.ts), for telling a clap from a chanted syllable.
 */
export type ClapAudio = { t0: number; rate: number; samples: Float32Array };

/** How pitched a sound is: above this, a voice (a chanted "ta"), not a clap. */
export const VOICED_ABOVE = 0.45;

/**
 * How pitched the sound is just after `t` (page ms): the strongest normalised
 * autocorrelation over the lags of a voice's pitch (80-500 Hz), over 80 ms
 * from 30 ms in (past the attack, into the vowel or the clap's ring). A clap
 * is noise: about 0.1-0.25. A sung or chanted syllable is periodic: 0.5-0.95.
 * Measured on Blaine's class recordings (6 October): every clap below 0.38,
 * the chant 0.42 and up.
 */
export function voicingAt(audio: ClapAudio, t: number): number {
  const n = Math.round(0.08 * audio.rate);
  const i = Math.round(((t - audio.t0 + 30) / 1000) * audio.rate);
  if (i < 0 || i + n > audio.samples.length) return 0;
  let mean = 0;
  for (let k = 0; k < n; k++) mean += audio.samples[i + k];
  mean /= n;
  const y = new Float32Array(n);
  let energy = 0;
  for (let k = 0; k < n; k++) {
    y[k] = audio.samples[i + k] - mean;
    energy += y[k] * y[k];
  }
  if (energy < 1e-7) return 0;
  let best = 0;
  for (let lag = Math.floor(audio.rate / 500); lag <= Math.floor(audio.rate / 80); lag++) {
    let s = 0;
    for (let k = 0; k + lag < n; k++) s += y[k] * y[k + lag];
    if (s > best) best = s;
  }
  return best / energy;
}

/** Each sound marked as a voice or not (VOICED_ABOVE). */
export function markVoiced<T extends Clap>(claps: T[], audio: ClapAudio | null): (T & { voiced: boolean })[] {
  return claps.map((c) => ({ ...c, voiced: !!audio && voicingAt(audio, c.t) > VOICED_ABOVE }));
}
