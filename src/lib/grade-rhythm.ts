import { STRICTNESS, letterFor, type GradeNote, type GradeRest, type Strictness } from "./grade";
import type { Clap } from "./clap-detect";

/**
 * Grading a rhythm clapped, tapped on the spacebar or on the pad: only each
 * note's start counts (a held note is not held), and a rest is silence.
 *
 * Claps are matched to notes one to one and in order, each only near its own
 * note (`windowsFor`), so two claps on one note are a match and a stray, and
 * one clap cannot serve two notes. A note's credit is the onset rule the
 * singing grade uses: full within the strictness's window, down to nothing at
 * three times it; no clap, nothing. Every clap matched to no note - in a rest,
 * a second clap on a note, before or after the music - is a stray, and counts
 * as one more note scored 0: one stray in 16 notes costs what one missed note
 * does.
 *
 * A class is graded as one room (`who: "class"`): each clap is the room's
 * burst (clap-detect `detectBursts`), whose level against the room's usual
 * one is the root of the share of the room that clapped. A stray burst counts
 * by that - one child in twenty clapping early about a fifth of a stray, half
 * the room 0.7 - and a note only part of the room clapped (under WEAK_SHARE,
 * about a sixth of the room) gets that part of its credit.
 * How together the room was is reported, not scored.
 */

export type ClapWho = "solo" | "class";
export type ClapNote = {
  cursor: number;
  startUnits: number;
  lengthUnits: number;
  /** How early (-) or late the clap was, in beats; null when missed. */
  onsetBeats: number | null;
  missed: boolean;
  rhythm: number;
};
/** A clap that matched no note; `units` is where it fell from the first downbeat. */
export type StrayClap = { t: number; units: number; weight: number };
export type ClapResult = {
  rhythm: number;
  letter: string;
  notes: ClapNote[];
  strays: StrayClap[];
  /** A class: the median width of its claps, in ms (how together it was). */
  together?: number;
  /** How far behind (+) or ahead the claps ran as a whole, in ms (`steadyLag`). */
  lagMs: number;
  /** Whether that lag was taken out of the timing (an unchecked microphone's). */
  lagForgiven: boolean;
};

/**
 * How far behind the music the claps ran as a whole: the median of each
 * clap's distance to its nearest note, from those within a quarter beat
 * either way of one, when there are at least four; 0 otherwise.
 */
export function steadyLag(claps: { t: number }[], onsets: number[], beatMs: number): number {
  const errs: number[] = [];
  for (const c of claps) {
    let best = Infinity;
    for (const on of onsets) if (Math.abs(c.t - on) < Math.abs(best)) best = c.t - on;
    if (Math.abs(best) <= Math.max(0.25 * beatMs, 120)) errs.push(best);
  }
  if (errs.length < 4) return 0;
  errs.sort((a, b) => a - b);
  return errs[errs.length >> 1];
}
/** No more than this is ever taken for a steady lag (more is the clapper, not the microphone). */
export const MAX_LAG_MS = 250;

/** Below this share of the room's usual loudness, a note was clapped by only part of it. */
export const WEAK_SHARE = 0.4;

/** How together a class was: Tight, Fair or Ragged. */
export const togetherLabel = (ms: number) => (ms < 40 ? "Tight" : ms <= 90 ? "Fair" : "Ragged");

/**
 * Where each note may be clapped: its onset, give or take three windows, and
 * never past halfway to a neighbouring note. Reaching all the way to the
 * neighbour let every clap after a missed note slide one note over (each then
 * "a beat late") rather than one note being missed.
 */
export function windowsFor(onsets: number[], reach: number, edge = reach) {
  // Before the first note and after the last there is no neighbour: `edge`
  // (half a beat) keeps a clap in the count-in from counting as a stray.
  return onsets.map((on, i) => ({
    from: on - Math.min(reach, i ? (on - onsets[i - 1]) / 2 : edge),
    to: on + Math.min(reach, i < onsets.length - 1 ? (onsets[i + 1] - on) / 2 : edge),
  }));
}

export function gradeClaps(
  schedule: { notes: GradeNote[]; rests: GradeRest[] },
  heard: Clap[],
  o: {
    t0: number;
    bpm: number;
    beatUnits: number;
    strictness: Strictness;
    who: ClapWho;
    latencyMs?: number;
    /**
     * The microphone's delay is a guess (Check timing never run): a steady lag
     * is taken to be the microphone's and not counted. Otherwise it only
     * centres the windows, so one steady lag cannot push every clap of a
     * sixteenth into the next note's window, and lateness still counts.
     */
    forgiveLag?: boolean;
  },
): ClapResult {
  const beatMs = 60_000 / Math.max(1, o.bpm);
  const unitMs = beatMs / Math.max(1, o.beatUnits);
  const tol = STRICTNESS[o.strictness].onsetBeats * beatMs;
  const reach = 3 * tol;
  const notes = schedule.notes;
  const written = notes.map((n) => o.t0 + n.startUnits * unitMs);
  const lat = o.latencyMs ?? 0;
  const moved = heard.map((c) => ({ ...c, t: c.t - lat })).sort((a, b) => a.t - b.t);
  const lag = Math.max(-MAX_LAG_MS, Math.min(MAX_LAG_MS, steadyLag(moved.filter((c) => c.t >= written[0] - beatMs), written, beatMs)));
  // The windows sit where the claps steadily land; the credit is measured
  // from there too when the lag is forgiven, else from the written beat.
  const onsets = written.map((t) => t + lag);
  const from = o.forgiveLag ? onsets : written;
  const wins = windowsFor(onsets, reach, Math.min(reach, beatMs / 2));
  const credit = (err: number) => (Math.abs(err) <= tol ? 100 : Math.max(0, (100 * (reach - Math.abs(err))) / (reach - tol)));

  // Claps from the first note's window on (a clap in the count-in is not graded).
  const claps = moved.filter((c) => !notes.length || c.t >= wins[0].from);

  // The best one-to-one matching in order: dp[i][j] over the first i notes and j claps.
  const n = notes.length;
  const m = claps.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  const fit = (i: number, j: number) => {
    const c = claps[j];
    // The +1 makes a match worth more than none; the last term breaks ties toward the nearer clap.
    return c.t >= wins[i].from && c.t <= wins[i].to ? credit(c.t - from[i]) + 1 - Math.abs(c.t - onsets[i]) / (1000 * reach) : -1;
  };
  for (let i = 1; i <= n; i++)
    for (let j = 1; j <= m; j++) {
      const f = fit(i - 1, j - 1);
      dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1], f >= 0 ? dp[i - 1][j - 1] + f : -Infinity);
    }
  const match: (number | null)[] = new Array(n).fill(null);
  for (let i = n, j = m; i > 0 && j > 0; ) {
    const f = fit(i - 1, j - 1);
    if (f >= 0 && dp[i][j] === dp[i - 1][j - 1] + f) {
      match[i - 1] = j - 1;
      i--;
      j--;
    } else if (dp[i][j] === dp[i - 1][j]) i--;
    else j--;
  }

  const used = new Set(match.filter((j): j is number => j !== null));
  const matchedLevels = [...used].map((j) => claps[j].level).sort((a, b) => a - b);
  const usual = matchedLevels.length ? matchedLevels[matchedLevels.length >> 1] : 0;

  const out: ClapNote[] = notes.map((note, i) => {
    const j = match[i];
    const base = { cursor: note.cursor, startUnits: note.startUnits, lengthUnits: note.lengthUnits };
    if (j === null) return { ...base, onsetBeats: null, missed: true, rhythm: 0 };
    const err = claps[j].t - from[i];
    let rhythm = credit(err);
    if (o.who === "class" && usual > 0) {
      const share = claps[j].level / usual;
      if (share < WEAK_SHARE) rhythm *= share / WEAK_SHARE;
    }
    return { ...base, onsetBeats: err / beatMs, missed: false, rhythm: Math.round(rhythm) };
  });

  const strays: StrayClap[] = claps
    .filter((_, j) => !used.has(j))
    .map((c) => ({
      t: c.t,
      units: (c.t - o.t0) / unitMs,
      weight: o.who === "class" && usual > 0 ? Math.min(1, c.level / usual) : 1,
    }));

  const counted = n + strays.reduce((a, s) => a + s.weight, 0);
  const rhythm = counted ? Math.round(out.reduce((a, x) => a + x.rhythm, 0) / counted) : 0;
  const spreads = [...used].map((j) => claps[j].spread).filter((s): s is number => s !== undefined).sort((a, b) => a - b);
  return {
    rhythm,
    letter: letterFor(rhythm),
    notes: out,
    strays,
    ...(o.who === "class" && spreads.length ? { together: Math.round(spreads[spreads.length >> 1]) } : {}),
    lagMs: Math.round(lag),
    lagForgiven: !!o.forgiveLag,
  };
}
