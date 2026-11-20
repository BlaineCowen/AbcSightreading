/**
 * Note Rain: notes fall, name each before it lands (Blaine, 17 November 2026:
 * bring it over from learnmusic.fun, it "needs to be fixed"; 18 November:
 * "it never gets fast enough... on the hardest difficulty I can play it
 * easily with my mouse while talking", endless should "keep speeding up until
 * the player runs out of strikes", the ramp faster overall, easier options of
 * three or five notes, and a clearer way to choose the notes).
 *
 * Written fresh from learnmusic.fun's ideas (src/lib/game/noteRain.ts there),
 * not ported. Pure: what can fall, how fast, which note next.
 *
 * Notes are diatonic steps (octave * 7 + letter, C = 0): middle C is 28,
 * treble's bottom line E4 is 30, bass's G2 is 18. No accidentals on the
 * notes, but a key (20 November 2026, Blaine: "change keys for solfège",
 * movable do): the cards carry its key signature, so in G every F is F♯,
 * the letters say so, and do is the key's tonic (G is do, F♯ is ti).
 *
 * The speed (measured 18 November 2026; learnmusic.fun's Hard): it started at
 * 1.2x, added 0.75x a minute and stopped at 2.2x, so a note took about 5.8 s
 * to fall at the start of a 60-second storm and about 1.8 s only at its very
 * end. Here the speed doubles every DOUBLE_SECONDS from the start chosen,
 * with no top in Endless, and more notes fall at once as it rises.
 */

export type Clef = "treble" | "bass";
export const LETTERS = ["C", "D", "E", "F", "G", "A", "B"] as const;
export type Letter = (typeof LETTERS)[number];
/** Fixed do, C is do (the site's other fixed-do naming, ear-quiz.ts). */
export const FIXED_DO: Record<Letter, string> = { C: "do", D: "re", E: "mi", F: "fa", G: "sol", A: "la", B: "ti" };

/**
 * The keys a round can be in: C and up to three sharps or flats (the choir
 * keys). In C everything is as it was; a setup only stores `key` when it isn't C.
 */
export const RAIN_KEYS = ["C", "G", "D", "A", "F", "Bb", "Eb"] as const;
export type RainKey = (typeof RAIN_KEYS)[number];
const SHARPS: Letter[] = ["F", "C", "G", "D", "A", "E", "B"];
const FLATS: Letter[] = ["B", "E", "A", "D", "G", "C", "F"];
const KEY_SIG: Record<RainKey, number> = { C: 0, G: 1, D: 2, A: 3, F: -1, Bb: -2, Eb: -3 };
/** -1, 0 or 1: what the key signature does to a letter. */
export function accOf(l: Letter, key: RainKey = "C"): number {
  const n = KEY_SIG[key];
  if (n > 0) return SHARPS.slice(0, n).includes(l) ? 1 : 0;
  return FLATS.slice(0, -n).includes(l) ? -1 : 0;
}
/** "B♭", "F♯", "G": a key or a letter as a musician writes it. */
export const keyLabel = (k: RainKey) => k.replace("b", "♭");
export const letterName = (l: Letter, key: RainKey = "C") => l + ["♭", "", "♯"][accOf(l, key) + 1];
const SOLFA = ["do", "re", "mi", "fa", "sol", "la", "ti"];
/** Movable do: the key's tonic is do. */
export const solfegeOf = (l: Letter, key: RainKey = "C") => SOLFA[(LETTERS.indexOf(l) - LETTERS.indexOf(key[0] as Letter) + 7) % 7]!;
const SEMIS: Record<Letter, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** A step's MIDI note in a key (middle C, step 28, is 60). */
export const midiOf = (step: number, key: RainKey = "C") => 12 * (octaveOf(step) + 1) + SEMIS[letterOf(step)] + accOf(letterOf(step), key);

/** The bottom staff line's step: treble E4, bass G2. */
export const BOTTOM_LINE: Record<Clef, number> = { treble: 30, bass: 18 };
export const letterOf = (step: number): Letter => LETTERS[((step % 7) + 7) % 7]!;
export const octaveOf = (step: number) => Math.floor(step / 7);
/** "E4", "C5": a note's name with its octave (the staff picker's labels). */
export const noteLabel = (step: number, key: RainKey = "C") => `${letterName(letterOf(step), key)}${octaveOf(step)}`;

/** Every note Customize offers for a clef: two ledger lines below the staff to two above. */
export function clefRange(clef: Clef): number[] {
  const b = BOTTOM_LINE[clef];
  return Array.from({ length: 17 }, (_, i) => b - 4 + i);
}
/** On a line (true) or a space, for the staff picker's Lines and Spaces. */
export const onLine = (clef: Clef, step: number) => (step - BOTTOM_LINE[clef]) % 2 === 0;

/** The levels, easiest first; each a set of steps per clef. */
export const RAIN_LEVELS: { name: string; steps: Record<Clef, number[]> }[] = [
  // Three neighbours in the middle of the staff (learnmusic.fun's Easy).
  { name: "Three notes", steps: { treble: [32, 33, 34], bass: [24, 25, 26] } },
  // A hand's five: middle C up to G; in bass, C3 up to G3.
  { name: "Five notes", steps: { treble: [28, 29, 30, 31, 32], bass: [21, 22, 23, 24, 25] } },
  { name: "The lines", steps: { treble: [30, 32, 34, 36, 38], bass: [18, 20, 22, 24, 26] } },
  { name: "The spaces", steps: { treble: [31, 33, 35, 37], bass: [19, 21, 23, 25] } },
  { name: "The whole staff", steps: { treble: range(30, 38), bass: range(18, 26) } },
  { name: "Staff and middle C", steps: { treble: range(28, 38), bass: range(18, 28) } },
  { name: "Ledger lines", steps: { treble: range(26, 42), bass: range(14, 30) } },
];
function range(lo: number, hi: number) {
  return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
}

export type RainSpeed = "relaxed" | "medium" | "fast" | "extreme";
export type RainRound = "sprint" | "storm" | "twenty" | "endless";
export type RainNames = "letters" | "solfege";
export type RainSetup = {
  clef: Clef;
  /** 1 to RAIN_LEVELS.length; 0 is Customize (`notes`). */
  level: number;
  /** Customize: the steps chosen, inside clefRange. */
  notes?: number[];
  speed: RainSpeed;
  round: RainRound;
  names: RainNames;
  /** Not C: the key (stored only when it isn't C, so older setups read the same). */
  key?: RainKey;
};

export function checkRainSetup(v: unknown): RainSetup {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const clef: Clef = o.clef === "bass" ? "bass" : "treble";
  const okLevel = typeof o.level === "number" && Number.isInteger(o.level) && o.level >= 0 && o.level <= RAIN_LEVELS.length;
  const allowed = new Set(clefRange(clef));
  const notes = Array.isArray(o.notes) ? [...new Set(o.notes.filter((n): n is number => typeof n === "number" && allowed.has(n)))].sort((a, b) => a - b) : [];
  const level = okLevel ? (o.level as number) : 1;
  return {
    clef,
    // Customize needs two letters to tell apart; with fewer it is level 1.
    level: level === 0 && new Set(notes.map(letterOf)).size < 2 ? 1 : level,
    ...(level === 0 ? { notes } : {}),
    speed: (["relaxed", "medium", "fast", "extreme"] as const).includes(o.speed as RainSpeed) ? (o.speed as RainSpeed) : "medium",
    round: (["sprint", "storm", "twenty", "endless"] as const).includes(o.round as RainRound) ? (o.round as RainRound) : "storm",
    names: o.names === "solfege" ? "solfege" : "letters",
    ...(RAIN_KEYS.includes(o.key as RainKey) && o.key !== "C" ? { key: o.key as RainKey } : {}),
  };
}

/** The steps a setup rains, low to high. */
export const poolOf = (s: RainSetup): number[] => (s.level === 0 ? s.notes ?? [] : RAIN_LEVELS[s.level - 1]!.steps[s.clef]);
/** The answer buttons: the letters in play, up the scale from the key's tonic (C to B in C). */
export function lettersOf(s: RainSetup): Letter[] {
  const from = LETTERS.indexOf((s.key ?? "C")[0] as Letter);
  const order = LETTERS.map((_, i) => LETTERS[(from + i) % 7]!);
  return order.filter((l) => poolOf(s).some((st) => letterOf(st) === l));
}
/** A letter as the round names it: "F♯" or, in solfège, "ti" (movable do, the key's tonic is do). */
export const nameOf = (l: Letter, names: RainNames, key: RainKey = "C") => (names === "solfege" ? solfegeOf(l, key) : letterName(l, key));

// ── Speed ─────────────────────────────────────────────────────────────────

/** The speed a round starts at, by the setup's choice (1 is a note falling in BASE_FALL_MS). */
export const START_SPEED: Record<RainSpeed, number> = { relaxed: 0.7, medium: 1, fast: 1.5, extreme: 2.2 };
/** The speed doubles every this many seconds (learnmusic.fun's Hard added 62% a minute, then stopped). */
export const DOUBLE_SECONDS = 40;
export const BASE_FALL_MS = 6000;
export const BASE_SPAWN_MS = 2400;
/** Below this a note can't be read at all; the rain still thickens (more at once, closer together). */
export const MIN_FALL_MS = 650;
export const STORM_MS = 60_000;
/** The short storm (Blaine, 20 November 2026: "a 30 second mode"). */
export const SPRINT_MS = 30_000;
/** How long a timed round lasts; null for the untimed ones. */
export const roundMs = (r: RainRound) => (r === "sprint" ? SPRINT_MS : r === "storm" ? STORM_MS : null);
export const TWENTY = 20;
export const STRIKES = 3;
/** After a wrong answer the buttons rest this long, so mashing every letter doesn't pay. */
export const WRONG_LOCK_MS = 450;

/** The speed `ms` into a round: doubling every DOUBLE_SECONDS, without end. */
export const speedAt = (ms: number, start: number) => start * 2 ** (Math.max(0, ms) / 1000 / DOUBLE_SECONDS);
/** How long a note takes from the top to the ground at a speed. */
export const fallMs = (speed: number) => Math.max(MIN_FALL_MS, BASE_FALL_MS / speed);
/** Time between notes appearing. */
export const spawnMs = (speed: number) => BASE_SPAWN_MS / speed;
/** How many notes may be in the air at once. */
export const maxDrops = (speed: number) => Math.min(8, 1 + Math.ceil(speed));

// ── Which note next ─────────────────────────────────────────────────────────

/** A missed note falls more often; a clean answer eases it back (learnmusic.fun's weights). */
export const bumpWeight = (w: number, clean: boolean) => (clean ? Math.max(1, w - 0.5) : Math.min(5, w + 1.5));

/** A weighted pick, never the same note twice running (unless only one). */
export function pickStep(pool: number[], weights: Record<number, number>, last: number | null, rand: () => number = Math.random): number {
  const cands = pool.length > 1 ? pool.filter((s) => s !== last) : pool;
  const total = cands.reduce((t, s) => t + (weights[s] ?? 1), 0);
  let r = rand() * total;
  for (const s of cands) {
    r -= weights[s] ?? 1;
    if (r <= 0) return s;
  }
  return cands[cands.length - 1]!;
}

/** A note as ABC (L:1/1, a whole note), for abcjs to draw: C4 is "C", C5 "c", C3 "C,". */
export function abcOf(step: number): string {
  const l = letterOf(step);
  const o = octaveOf(step);
  if (o >= 5) return l.toLowerCase() + "'".repeat(o - 5);
  return l + ",".repeat(Math.max(0, 4 - o));
}
