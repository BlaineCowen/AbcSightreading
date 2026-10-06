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
  /** Sounds not counted as strays: chanted syllables, sounds folded into a class's clap, background. */
  ignored: { voiced: number; merged: number; quiet: number };
  /** Just me, but it sounded like a room (many claps a little apart on each note): try The class. */
  soundedLikeClass?: boolean;
};

/**
 * Within this much of a matched clap (a third of a beat, at most CLAP_MERGE_MS),
 * another sound is the same clap: a class is tens to hundreds of ms wide, and a
 * child a little behind the rest is the room's ragged clap, not an extra one
 * (Blaine's class, 6 October: most "strays" were exactly that). The class only:
 * one person's second clap that close is a double clap and still costs.
 */
export const CLAP_MERGE_MS = 300;
/** Quieter than this share of the run's own claps: the room (talk, a chair), not a clap. */
export const QUIET_SHARE = 0.25;
/**
 * A class's floor, on its burst levels: the faint slivers in Blaine's runs
 * were under 6% of the room's typical clap, and one child clapping alone is
 * about a fifth (the root of 1/20), which should still count as a stray.
 */
export const CLASS_QUIET_SHARE = 0.15;

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
  const all = heard.map((c) => ({ ...c, t: c.t - lat })).sort((a, b) => a.t - b.t);
  // A chanted syllable (clap-detect markVoiced) is never a clap: claps are
  // matched alone, a syllable only fills a note no clap did (a loud chant can
  // bury a clap), and it is never a stray.
  // Background first: much quieter than the run's own sounds (talk, a chair,
  // or the faint leading edge a room's clap can split off just ahead of it,
  // which sat nearer the beat and was matched in its place, the note then
  // credited as clapped by a handful). The reference is the run's typical
  // level, above the median since most of what is heard is claps.
  const levels = all.filter((c) => !c.voiced).map((c) => c.level).sort((a, b) => a - b);
  const typical = levels.length ? levels[Math.floor(levels.length * 0.6)] : 0;
  // A class's claps are all much alike in level; one person's vary far more,
  // and their quiet ones are still claps, so for them the floor applies to
  // strays only (below).
  const isQuiet = (c: Clap) => typical > 0 && c.level < CLASS_QUIET_SHARE * typical;
  const quietHeard = o.who === "class" ? all.filter((c) => !c.voiced && isQuiet(c)) : [];
  const moved = all.filter((c) => !c.voiced && !quietHeard.includes(c));
  const voicedHeard = all.filter((c) => c.voiced);
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
  // A note no clap matched may take a chanted syllable in its window.
  const takenVoiced = new Set<number>();
  const fill: (Clap | null)[] = match.map((j, i) => {
    if (j !== null) return claps[j];
    let best = -1;
    voicedHeard.forEach((c, k) => {
      if (takenVoiced.has(k) || c.t < wins[i].from || c.t > wins[i].to) return;
      if (best < 0 || Math.abs(c.t - onsets[i]) < Math.abs(voicedHeard[best].t - onsets[i])) best = k;
    });
    if (best < 0) return null;
    takenVoiced.add(best);
    return voicedHeard[best];
  });

  const out: ClapNote[] = notes.map((note, i) => {
    const c = fill[i];
    const base = { cursor: note.cursor, startUnits: note.startUnits, lengthUnits: note.lengthUnits };
    if (!c) return { ...base, onsetBeats: null, missed: true, rhythm: 0 };
    const err = c.t - from[i];
    let rhythm = credit(err);
    if (o.who === "class" && usual > 0 && !c.voiced) {
      const share = c.level / usual;
      if (share < WEAK_SHARE) rhythm *= share / WEAK_SHARE;
    }
    return { ...base, onsetBeats: err / beatMs, missed: false, rhythm: Math.round(rhythm) };
  });

  // What is left over: background (much quieter than the claps), then for a
  // class anything close to a clap it matched (the same, ragged clap).
  const matchedAt = fill.filter((c): c is Clap => !!c).map((c) => c.t);
  const merge = Math.min(beatMs / 3, CLAP_MERGE_MS);
  const nearMatched = (c: Clap) => matchedAt.some((t) => Math.abs(t - c.t) <= merge);
  const leftover = claps.filter((_, j) => !used.has(j));
  const quietLeft = o.who === "class" ? [] : leftover.filter((c) => usual > 0 && c.level < QUIET_SHARE * usual);
  const audible = leftover.filter((c) => !quietLeft.includes(c));
  const merged = o.who === "class" ? audible.filter(nearMatched) : [];
  // One person's claps that come in clusters, on note after note: a room graded as one person.
  const clustered = o.who === "solo" ? audible.filter(nearMatched).length : 0;
  const strays: StrayClap[] = audible
    .filter((c) => !merged.includes(c))
    .map((c) => ({
      t: c.t,
      units: (c.t - o.t0) / unitMs,
      weight: o.who === "class" && usual > 0 ? Math.min(1, c.level / usual) : 1,
    }));

  const counted = n + strays.reduce((a, s) => a + s.weight, 0);
  const rhythm = counted ? Math.round(out.reduce((a, x) => a + x.rhythm, 0) / counted) : 0;
  const spreads = fill.filter((c): c is Clap => !!c && !c.voiced).map((c) => c.spread).filter((s): s is number => s !== undefined).sort((a, b) => a - b);
  return {
    rhythm,
    letter: letterFor(rhythm),
    notes: out,
    strays,
    ...(o.who === "class" && spreads.length ? { together: Math.round(spreads[spreads.length >> 1]) } : {}),
    lagMs: Math.round(lag),
    lagForgiven: !!o.forgiveLag,
    ignored: { voiced: voicedHeard.length - takenVoiced.size, merged: merged.length, quiet: quietHeard.filter((c) => !notes.length || c.t >= wins[0].from).length + quietLeft.length },
    ...(clustered >= Math.max(3, 0.25 * n) ? { soundedLikeClass: true } : {}),
  };
}
