/**
 * Catch the tune's tunes (components/games/CatchTheTune.svelte), copied from
 * Octavo Academy (src/lib/adaptive/ui/tune-path.ts, 2 November 2026), where
 * the game began: short walks over a set of
 * notes, the moves limited to what is being taught (steps and repeats, then
 * skips, then leaps), ending on do; a level's new note is in every tune.
 *
 * Notes are solfège in a major key, below do and above it too: "low so",
 * "low la", "low ti", "do" ... "ti", "high do", "high re", "high mi". A
 * note's step is its place in the scale (do 0, re 1, low ti -1, high do 7),
 * so a step is a move of 1 and a skip of 2 whichever notes are in the set.
 */

const NAMES = ["do", "re", "mi", "fa", "so", "la", "ti"];
const SEMIS = [0, 2, 4, 5, 7, 9, 11];
const COLORS = ["#ef6f6c", "#f2994a", "#f2c94c", "#7bc67e", "#4fb3bf", "#5b8def", "#9b7be0"];

/** A note's place in the scale from do ("low la" -2, "high do" 7), or NaN for a name it doesn't know. */
export function stepOf(syl: string): number {
  const m = syl.trim().toLowerCase().match(/^(low |high )?(do|re|mi|fa|so|sol|la|ti|si)$/);
  if (!m) return NaN;
  const i = NAMES.indexOf(m[2] === "sol" ? "so" : m[2] === "si" ? "ti" : m[2]);
  return i + (m[1] === "low " ? -7 : m[1] === "high " ? 7 : 0);
}
const oct = (step: number) => Math.floor(step / 7);
const idx = (step: number) => ((step % 7) + 7) % 7;
export const sylOf = (step: number) => `${oct(step) < 0 ? "low " : oct(step) > 0 ? "high " : ""}${NAMES[idx(step)]}`;
export const semiOf = (step: number) => oct(step) * 12 + SEMIS[idx(step)];
export const colorOf = (step: number) => COLORS[idx(step)];
/** The short name on a narrow screen: d r m, with a comma under (l,) or a mark over (d') for the octaves. */
export const shortOf = (step: number) => `${NAMES[idx(step)][0]}${oct(step) < 0 ? "," : oct(step) > 0 ? "'" : ""}`;

export type PathLevel = {
  name: string;
  /** What the hint says the level moves by. */
  moves: string;
  /** The notes in play (solfège: "low la", "do", "high do"...). */
  notes: string[];
  /** How many notes, fewest and most. */
  length: [number, number];
  /** The biggest move in scale steps: 1 steps, 2 skips, 4 do to so, 7 an octave. */
  maxMove: number;
  /**
   * Exactly which moves, in scale steps (0 a repeat, 1 a step, 2 a skip, 3 a
   * 4th, 4 a 5th, 5 a 6th, 7 an octave), when a teacher chose them (abcSR's
   * custom setup, 2 November 2026); without it, every move up to maxMove.
   */
  allowedMoves?: number[];
  /** The note this level brings in: every tune uses it. */
  newNote?: string;
  /** The notes a tune may start on (default do, mi and so, where the set has them). */
  starts?: string[];
  /** The note every tune ends on (default do; null for any). */
  endOn?: string | null;
  /** Fixed tunes to play instead of made-up ones (a lesson's own patterns), in turn. */
  tunes?: string[][];
};

export const PATH_LEVELS: PathLevel[] = [
  { name: "Steps", moves: "steps and repeats", notes: ["do", "re", "mi"], length: [5, 5], maxMove: 1 },
  { name: "+ so", moves: "steps, skips and repeats", notes: ["do", "re", "mi", "so"], length: [5, 6], maxMove: 2, newNote: "so" },
  { name: "+ la", moves: "steps, skips and repeats", notes: ["do", "re", "mi", "so", "la"], length: [6, 7], maxMove: 2, newNote: "la" },
  { name: "Below do", moves: "steps, skips and repeats", notes: ["low so", "low la", "do", "re", "mi"], length: [6, 7], maxMove: 2, newNote: "low la" },
  { name: "High do", moves: "steps, skips and repeats", notes: ["do", "re", "mi", "so", "la", "high do"], length: [6, 8], maxMove: 2, newNote: "high do", starts: ["do", "mi", "so", "high do"] },
  { name: "+ fa", moves: "steps, skips and repeats", notes: ["do", "re", "mi", "fa", "so", "la"], length: [7, 8], maxMove: 2, newNote: "fa" },
  { name: "Leaps", moves: "any move, even do to so", notes: ["do", "re", "mi", "so", "la"], length: [6, 8], maxMove: 4 }
];

/** The level's notes as steps, low to high. */
export const stepsOf = (level: PathLevel) => [...new Set(level.notes.map(stepOf).filter((s) => !Number.isNaN(s)))].sort((a, b) => a - b);

/** Where a tune can go next from a note: the level's notes no further than its biggest move. */
export function nextFrom(level: PathLevel, step: number): number[] {
  return stepsOf(level).filter((s) => (level.allowedMoves ? level.allowedMoves.includes(Math.abs(s - step)) : Math.abs(s - step) <= level.maxMove));
}

/** A tune (steps) for a level: its next fixed tune, or a made-up one that starts on one of its starts and ends on do, using its bigger moves and its new note. */
export function makePath(level: PathLevel, rand = Math.random, turn = 0): number[] {
  if (level.tunes?.length) return level.tunes[turn % level.tunes.length].map(stepOf);
  const allowed = stepsOf(level);
  const starts = (level.starts?.map(stepOf) ?? [0, 2, 4]).filter((s) => allowed.includes(s));
  const startSet = starts.length ? starts : allowed;
  const end = level.endOn === null ? null : stepOf(level.endOn ?? "do");
  const fresh = level.newNote ? stepOf(level.newNote) : null;
  const biggestMove = level.allowedMoves ? Math.max(...level.allowedMoves) : level.maxMove;
  const repeatWeight = biggestMove <= 1 ? 1.1 : 0.3;
  let best: number[] | null = null;
  for (let tries = 0; tries < 600; tries++) {
    const n = level.length[0] + Math.floor(rand() * (level.length[1] - level.length[0] + 1));
    const tune: number[] = [startSet[Math.floor(rand() * startSet.length)]];
    for (let i = 1; i < n; i++) {
      const here = tune[i - 1];
      const repeated = tune[i - 2] === here;
      const options = nextFrom(level, here).filter((s) => !(s === here && repeated));
      // A custom set of notes and moves can leave a note with nowhere to go.
      if (!options.length) break;
      // Steps most often, the bigger moves less. Repeats belong to the
      // steps-only levels, where the ear is learning to hear "same" (Blaine,
      // 2 November 2026: 6% of Steps tunes had one, too rare there); higher up
      // the moves being taught are skips and leaps, so repeats stay rare.
      const weight = (s: number) => [repeatWeight, 2, 1.4, 0.8, 1][Math.abs(s - here)] ?? 0.5;
      const total = options.reduce((a, s) => a + weight(s), 0);
      let x = rand() * total;
      tune.push(options.find((s) => (x -= weight(s)) < 0) ?? options[options.length - 1]);
    }
    if (tune.length < level.length[0]) continue;
    if (end !== null && allowed.includes(end) && tune[tune.length - 1] !== end) continue;
    if (fresh !== null && !tune.includes(fresh)) continue;
    best ??= tune;
    const biggest = Math.max(...tune.slice(1).map((s, i) => Math.abs(s - tune[i])));
    if (biggest >= Math.min(level.allowedMoves ? Math.max(...level.allowedMoves) : level.maxMove, 3)) return tune;
  }
  return best ?? [startSet[0]];
}

/** Whether a level can make a tune at all (a custom one may not: notes no allowed move can join). */
export const canMakeTune = (level: PathLevel) => makePath(level).length >= level.length[0];
