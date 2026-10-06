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
export type Clap = { t: number; level: number; spread?: number };

/** A clap rises this far above the running floor. */
export const CLAP_RISE_DB = 9;
/** The floor: the median of the high band over this much before. */
const FLOOR_MS = 300;
/** A clap is sudden: this far above the quietest of the RISE_MS before it (a clap's own ringing tail never is). */
const RISE_MS = 10;
/** No quieter than this (dB of the high band's power): the room's own noise. */
const ABS_GATE_DB = -70;
/** The peak is looked for this soon after the crossing. */
const PEAK_MS = 15;
/** Two claps of one person are at least this far apart (a clap rings on). */
export const CLAP_REFRACTORY_MS = 60;
/** At its peak at least this share of a clap's power is in the high band (a voice's is far less). */
const HI_SHARE = 0.15;
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
    let before = Infinity;
    for (let j = i - 1; j >= 0 && b.t - blocks[j].t <= RISE_MS; j--) before = Math.min(before, levels[j]);
    if (before !== Infinity && level - before < CLAP_RISE_DB) continue;
    let peak = i;
    for (let j = i + 1; j < blocks.length && blocks[j].t - b.t <= PEAK_MS; j++) if (blocks[j].hi > blocks[peak].hi) peak = j;
    const p = blocks[peak];
    if (p.hi < HI_SHARE * p.full) continue;
    claps.push({ t: b.t, level: Math.sqrt(p.hi) });
    quietUntil = b.t + CLAP_REFRACTORY_MS;
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
    if (blocks[peak].hi < HI_SHARE * blocks[peak].full) return;
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
 * clicks while nobody should clap, so what the microphone hears near those
 * clicks is the echo, and its level is learned there. Afterwards a sound near
 * a click is a clap only if it is clearly louder than the echo (6 dB). With
 * echo cancellation doing its job nothing is learned and nothing is dropped.
 */
export const ECHO_NEAR_MS = 40;
export function withoutClickEcho(claps: Clap[], clicks: number[], countInEnd: number): Clap[] {
  const near = (c: Clap) => clicks.some((k) => Math.abs(c.t - k) <= ECHO_NEAR_MS);
  const heard = claps.filter((c) => c.t < countInEnd && near(c)).map((c) => c.level);
  if (!heard.length) return claps;
  const echo = median(heard);
  return claps.filter((c) => !(near(c) && c.level < echo * 2));
}
