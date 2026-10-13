import { ClefType, type PartsObject } from "../types";
import { ensembleInstrument, scoreOrder, type EnsembleInstrument } from "./instruments";

/**
 * An ensemble written as a chorale: any instruments and voices, in any
 * numbers, sharing two to four harmony parts, the way a band chorale doubles
 * its lines (Blaine, 13 October 2026: chorale style, up to four parts,
 * doubling, voices beside instruments).
 *
 * Every player is lined up from the highest register to the lowest and the
 * line is cut into parts where registers differ most, so a section can be
 * split (Trumpet 1 and 2) and a tuba always ends up on the bass. A part's
 * range is what its players share; one that barely overlaps plays the line an
 * octave up or down (a flute over a soprano line). Parts that would sit in the
 * same register (four trumpets) are staggered, each a band of it.
 *
 * The parts are then handed to the Choral writer under the names whose
 * texture fits (SATB, SAB, SA or TB), in its own octave (Choral pitch is
 * concert + 7: its clefs write a voice an octave up and read it back down).
 */

export type EnsembleMember = { instrument: string; count: number };

export type EnsemblePart = {
  /** The Choral writer's name for it (Soprano, Alto ...). */
  name: string;
  /** 0 is the bass. */
  order: number;
  /** Concert range written in, comfortable and outer. */
  current: [number, number];
  range: [number, number];
};

/** One staff: an instrument on a part (two of them on one part share it). */
export type EnsembleStaff = {
  id: string;
  name: string;
  short: string;
  instrument: EnsembleInstrument;
  count: number;
  /** Index into the parts, 0 the top. */
  part: number;
  /** Octaves the instrument plays the part away from its written pitch. */
  octave: number;
};

export type Arrangement = { parts: EnsemblePart[]; staves: EnsembleStaff[]; partsObject: PartsObject };

/** Choral pitch for a concert one (see the header). */
export const CHORAL_BIAS = 7;
/** The narrowest a part is written in, in steps: a sixth. */
const MIN_SPAN = 5;
/** How far past its comfortable range a part may reach, in steps. */
const REACH = 2;
/** Two parts further apart than this (steps, between their middles) are not a duet in thirds and sixths. */
const WIDE_DUO = 7;
/** The widest gap between two parts' ranges, in steps (a fourth); wider, the lower is written an octave up. */
const MAX_GAP = 3;

const NAMES: Record<number, string[]> = {
  4: ["Soprano", "Alto", "Tenor", "Bass"],
  3: ["Soprano", "Alto", "Baritone"],
};

const mid = (i: EnsembleInstrument) => (i.concert.min + i.concert.max) / 2;

/** How many parts: one a player, at most four, at least two. */
export const partCount = (members: EnsembleMember[]) =>
  Math.max(2, Math.min(4, members.reduce((a, m) => a + Math.max(0, m.count), 0)));

/**
 * Cut the players, highest first, into `n` runs where registers differ most:
 * the cuts that leave the least spread inside the parts.
 */
function cut(players: EnsembleInstrument[], n: number): number[][] {
  const len = players.length;
  const spread = (a: number, b: number) => mid(players[a]) - mid(players[b - 1]);
  // best[k][j]: the least total spread putting the first j players in k parts.
  const best: number[][] = Array.from({ length: n + 1 }, () => new Array(len + 1).fill(Infinity));
  const from: number[][] = Array.from({ length: n + 1 }, () => new Array(len + 1).fill(0));
  best[0][0] = 0;
  for (let k = 1; k <= n; k++)
    for (let j = k; j <= len; j++)
      for (let i = k - 1; i < j; i++) {
        const v = best[k - 1][i] + spread(i, j);
        if (v < best[k][j]) {
          best[k][j] = v;
          from[k][j] = i;
        }
      }
  const out: number[][] = [];
  for (let k = n, j = len; k > 0; k--) {
    const i = from[k][j];
    out.unshift(Array.from({ length: j - i }, (_, x) => i + x));
    j = i;
  }
  return out;
}

const overlap = (a: { min: number; max: number }, b: { min: number; max: number }) => Math.min(a.max, b.max) - Math.max(a.min, b.min);

/** A part's main instrument: the one most of its players play (the higher on a tie). */
const mainOf = (tally: Map<string, number>) =>
  ensembleInstrument[[...tally.entries()].sort((a, b) => b[1] - a[1] || mid(ensembleInstrument[b[0]]) - mid(ensembleInstrument[a[0]]))[0][0]];

/** The best of an octave up, down or none for an instrument to play a line in `range`: the octave and how much it shares. */
function fitOctave(inst: EnsembleInstrument, range: { min: number; max: number }) {
  let octave = 0;
  let shared = -Infinity;
  for (const o of [0, -1, 1]) {
    const v = overlap({ min: inst.concert.min - 7 * o, max: inst.concert.max - 7 * o }, range);
    if (v > shared + 1) {
      shared = v;
      octave = o;
    }
  }
  return { octave, shared };
}

/**
 * A part's range: its main instrument's (the most players), narrowed by each
 * other instrument on it, fitted an octave away where that overlaps more,
 * never below a sixth.
 */
function bandOf(tally: Map<string, number>) {
  const main = mainOf(tally);
  let lo = main.concert.min;
  let hi = main.concert.max;
  const octaves = new Map<string, number>();
  for (const id of tally.keys()) {
    const inst = ensembleInstrument[id];
    const { octave } = fitOctave(inst, main.concert);
    octaves.set(id, octave);
    // The line it plays is `octave` octaves from where it sounds: narrow the part to fit.
    const nlo = Math.max(lo, inst.concert.min - 7 * octave);
    const nhi = Math.min(hi, inst.concert.max - 7 * octave);
    if (nhi - nlo >= MIN_SPAN) {
      lo = nlo;
      hi = nhi;
    }
  }
  return { lo, hi, octaves };
}

/** The most chairs a section splits into (Trumpet 1, 2, 3); more players double a chair. */
export const MAX_CHAIRS = 3;

/**
 * A section split by chair, as band and orchestra parts are (Blaine, 13
 * October 2026: more than four lines, doubling octaves and parts, so each
 * player can pick a part of their own): two trumpets play the top two parts
 * rather than one line in unison. The harmony stays in four parts; a chair
 * that moves to another part doubles it as written (whole sections still
 * double at the octave: a tuba under the bass line). A chair only moves
 * down, to the part under the section's, then the next, only to one whose
 * players' shared range it fits; the part it leaves always keeps a player.
 */
function splitSections(members: EnsembleMember[], tallies: Map<string, number>[]) {
  // A chair joins a part only if it shares a sixth with the range the part's
  // players already share, and the part, with it, still fits every one of them.
  // 0: as written, 1: an octave away, null: not at all. A voice never takes
  // another part's line an octave away (an instrument may double one).
  const fits = (inst: EnsembleInstrument, part: Map<string, number>): number | null => {
    const band = bandOf(part);
    const fit = fitOctave(inst, { min: band.lo, max: band.hi });
    if (fit.shared < MIN_SPAN) return null;
    // A chair plays the part it moves to as written: whole sections double at
    // the octave (a tuba under the bass line), a split one does not.
    if (fit.octave !== 0) return null;
    const joined = new Map(part).set(inst.id, 1);
    const after = bandOf(joined);
    const allFit = [...joined.keys()].every((id) => {
      const i = ensembleInstrument[id];
      const o = after.octaves.get(id) ?? 0;
      return after.lo >= i.concert.min - 7 * o - 2 && after.hi <= i.concert.max - 7 * o + 2;
    });
    return allFit ? (fit.octave === 0 ? 0 : 1) : null;
  };
  for (const m of members) {
    const inst = ensembleInstrument[m.instrument];
    const want = Math.min(m.count, MAX_CHAIRS);
    for (;;) {
      const on = tallies.map((t, k) => (t.has(inst.id) ? k : -1)).filter((k) => k >= 0);
      if (on.length >= want) break;
      // The nearest part it is not on, the one below first (a second trumpet under the first).
      const near = (k: number) => Math.min(...on.map((j) => Math.abs(j - k)));
      // Only down (a second trumpet under the first, never over it), the nearest part first.
      const lowest = Math.max(...on);
      const next = tallies
        .map((_, k) => k)
        .filter((k) => k > lowest && fits(inst, tallies[k]) !== null)
        .sort((a, b) => near(a) - near(b))[0];
      if (next === undefined) break;
      // From the part where it has the most players; that part keeps one.
      const from = on.sort((a, b) => (tallies[b].get(inst.id) ?? 0) - (tallies[a].get(inst.id) ?? 0))[0];
      const left = (tallies[from].get(inst.id) ?? 0) - 1;
      if (left < 1) break;
      tallies[from].set(inst.id, left);
      tallies[next].set(inst.id, 1);
    }
    // The section shared out evenly across its chairs, the top chairs taking any extra (3, 2, 2 of seven).
    const on = tallies.map((t, k) => (t.has(inst.id) ? k : -1)).filter((k) => k >= 0);
    on.forEach((k, i) => tallies[k].set(inst.id, Math.floor(m.count / on.length) + (i < m.count % on.length ? 1 : 0)));
  }
}

export function arrangeEnsemble(members: EnsembleMember[]): Arrangement {
  const known = members.filter((m) => m.count > 0 && ensembleInstrument[m.instrument]);
  if (!known.length) throw new Error("Choose at least one instrument.");
  // One entry a player, highest first; a lone player still makes two parts, both theirs.
  let players = known.flatMap((m) => Array.from({ length: m.count }, () => ensembleInstrument[m.instrument]));
  players.sort((a, b) => mid(b) - mid(a) || scoreOrder(a.id) - scoreOrder(b.id));
  const n = partCount(known);
  while (players.length < n) players = [...players, players[players.length - 1]];
  const groups = cut(players, n);
  // Who is on each part: instrument -> players.
  const tallies = groups.map((g) => {
    const tally = new Map<string, number>();
    for (const p of g) tally.set(players[p].id, (tally.get(players[p].id) ?? 0) + 1);
    return tally;
  });
  splitSections(known, tallies);

  // Each part's range: its main instrument's (the most players), with the
  // others fitted to it an octave away where that overlaps more.
  const bands = tallies.map((tally) => ({ ...bandOf(tally), tally }));

  // A part far below the one above it (a string bass under violins) is
  // written an octave up and played an octave down, as a bass line doubled
  // 8vb is: two parts more than a fourth apart have no harmony to share.
  for (let k = 1; k < bands.length; k++) {
    while (bands[k - 1].lo - bands[k].hi > MAX_GAP) {
      bands[k].lo += 7;
      bands[k].hi += 7;
      for (const [id, o] of bands[k].octaves) bands[k].octaves.set(id, o - 1);
    }
  }

  // Stagger parts that share a register, top to bottom, each kept a sixth wide.
  const top = Math.max(...bands.map((b) => b.hi));
  const bottom = Math.min(...bands.map((b) => b.lo));
  const window = Math.max(MIN_SPAN + 2, (top - bottom) / n + 3);
  const current = bands.map((b, k) => {
    const centre = top - ((k + 0.5) * (top - bottom)) / n;
    let lo = Math.max(b.lo, Math.round(centre - window / 2));
    let hi = Math.min(b.hi, Math.round(centre + window / 2));
    if (hi - lo < MIN_SPAN) {
      // Too little left: a sixth inside its own range, as near the window as it goes.
      lo = Math.min(Math.max(b.lo, Math.round(centre - MIN_SPAN / 2)), b.hi - MIN_SPAN);
      hi = lo + MIN_SPAN;
    }
    return [lo, hi] as [number, number];
  });

  // Two parts: the SA and TB writers keep a duet in thirds and sixths, which
  // drags a tuba under a trumpet to the top of its range. Parts more than an
  // octave apart are written by the general writer instead (names it does not
  // match: build-chord-notes, by order).
  const apart = n === 2 && (current[0][0] + current[0][1]) / 2 - (current[1][0] + current[1][1]) / 2 > WIDE_DUO;
  const names = NAMES[n] ?? (apart ? ["Upper", "Lower"] : current[0][0] + current[1][0] >= 2 * 12 ? ["Soprano", "Alto"] : ["Tenor", "Bass"]);
  const parts: EnsemblePart[] = current.map((c, k) => ({
    name: names[k],
    order: n - 1 - k,
    current: c,
    range: [Math.max(bands[k].lo - REACH, c[0] - REACH), Math.min(bands[k].hi + REACH, c[1] + REACH)],
  }));

  const partsObject: PartsObject = {
    numofParts: n,
    parts: Object.fromEntries(
      parts.map((p) => [
        p.name,
        {
          order: p.order,
          smallName: p.name.slice(0, 2),
          // Never drawn: the Ensemble score draws each instrument's staff (abc.ts).
          clef: p.order === 0 ? ClefType.Bass : ClefType.Treble,
          range: [p.range[0] + CHORAL_BIAS, p.range[1] + CHORAL_BIAS] as [number, number],
          currentRange: [p.current[0] + CHORAL_BIAS, p.current[1] + CHORAL_BIAS] as [number, number],
        },
      ]),
    ),
  };

  // Staves in score order; an instrument on two parts is numbered (Trumpet 1, 2).
  const staves: EnsembleStaff[] = [];
  for (const m of known) {
    const inst = ensembleInstrument[m.instrument];
    const on = bands.map((b, k) => ({ k, count: b.tally.get(inst.id) ?? 0, octave: b.octaves.get(inst.id) ?? 0 })).filter((x) => x.count > 0);
    on.forEach((x, i) => {
      const numbered = on.length > 1;
      const name = numbered ? `${inst.name} ${i + 1}` : inst.name;
      staves.push({
        id: `${inst.short.replace(/\W/g, "")}${numbered ? i + 1 : ""}`,
        name: x.count > 1 ? `${name} (${x.count})` : name,
        short: numbered ? `${inst.short} ${i + 1}` : inst.short,
        instrument: inst,
        count: x.count,
        part: x.k,
        octave: x.octave,
      });
    });
  }
  staves.sort((a, b) => scoreOrder(a.instrument.id) - scoreOrder(b.instrument.id) || a.part - b.part);
  return { parts, staves, partsObject };
}
