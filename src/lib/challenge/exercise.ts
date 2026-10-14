/**
 * The sing-along challenge's exercises (/challenge): two bars of quarter
 * notes in C major, eight notes, at three levels. Warm-up steps between do
 * and so and comes home to do; Skips adds thirds and the odd fourth across an
 * octave; Wild is "musicality zero" (Blaine's idea in the vault): leaps of a
 * third to an octave, never home, the kind of line nobody would write - C F A
 * G, E B G c.
 *
 * Seeded, so a link (`?c=<seed>`) gives a friend the very same eight notes.
 */

export type ChallengeLevel = "warmup" | "skips" | "wild";
export type ChallengeVoice = "high" | "low";

export const LEVELS: Record<ChallengeLevel, { label: string; blurb: string }> = {
  warmup: { label: "Warm-up", blurb: "Steps from do to so" },
  skips: { label: "Skips", blurb: "Steps and skips in an octave" },
  wild: { label: "Wild", blurb: "Musicality zero. Good luck." },
};
export const LEVEL_IDS = Object.keys(LEVELS) as ChallengeLevel[];

export type ChallengeNote = { midi: number; syl: string };
export type Challenge = {
  level: ChallengeLevel;
  voice: ChallengeVoice;
  seed: number;
  clef: "treble" | "bass";
  notes: ChallengeNote[];
};

export const NOTE_COUNT = 8;
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const SYL = ["do", "di", "re", "ri", "mi", "fa", "fi", "so", "si", "la", "li", "ti"];

/** mulberry32: small, fast, and the same numbers everywhere for a seed. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const newSeed = () => Math.floor(Math.random() * 2 ** 31);

/** A scale degree (0 = do, 7 = the do above, -1 = ti below) as a pitch above `base` (a C). */
export const degreeMidi = (d: number, base: number) => base + 12 * Math.floor(d / 7) + MAJOR[((d % 7) + 7) % 7];
export const syllableOf = (midi: number) => SYL[((midi % 12) + 12) % 12];

function pick<T>(items: T[], weights: number[], rand: () => number): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r < 0) return items[i];
  }
  return items[items.length - 1];
}

/** Degrees for each level. Each walk is drawn again until it keeps its rules (a few tries at most). */
function degreesFor(level: ChallengeLevel, rand: () => number): number[] {
  if (level === "warmup") {
    // Steps (and now and then a note sung again), do to so, ending on do:
    // every move must leave a way home. Seven steps from do cannot end on do,
    // so a repeat is what lets it.
    // It must climb to fa or so, and sing a note again only once.
    for (;;) {
      const d = [0];
      for (let i = 1; i < NOTE_COUNT; i++) {
        const left = NOTE_COUNT - 1 - i;
        const at = d[i - 1];
        const moves = [-1, 0, 1].filter((m) => at + m >= 0 && at + m <= 4 && Math.abs(at + m) <= left);
        d.push(at + pick(moves, moves.map((m) => (m === 0 ? 0.35 : m > 0 ? 1.5 : 1)), rand));
      }
      const repeats = d.slice(1).filter((x, i) => x === d[i]).length;
      if (Math.max(...d) >= 3 && repeats <= 1) return d;
    }
  }
  if (level === "skips") {
    for (;;) {
      const d = [pick([0, 2, 4], [3, 1, 1], rand)];
      for (let i = 1; i < NOTE_COUNT; i++) {
        const left = NOTE_COUNT - 1 - i;
        const at = d[i - 1];
        const moves = [-3, -2, -1, 1, 2, 3].filter((m) => {
          const to = at + m;
          if (to < 0 || to > 7) return false;
          // Home is do or the do above; a move must leave room to reach one by skips.
          return Math.min(Math.abs(to), Math.abs(7 - to)) <= left * 2;
        });
        d.push(at + pick(moves, moves.map((m) => (Math.abs(m) === 1 ? 3 : Math.abs(m) === 2 ? 3 : 1)), rand));
      }
      const last = d[NOTE_COUNT - 1];
      const skips = d.slice(1).filter((x, i) => Math.abs(x - d[i]) >= 2).length;
      if ((last === 0 || last === 7) && skips >= 2) return d;
    }
  }
  // Wild: a third to an octave every time, never the note two before, never home at the end.
  for (;;) {
    const d = [Math.floor(rand() * 9)];
    for (let i = 1; i < NOTE_COUNT; i++) {
      const at = d[i - 1];
      const moves: number[] = [];
      for (let m = -7; m <= 7; m++) {
        const to = at + m;
        if (Math.abs(m) < 2 || to < 0 || to > 10) continue;
        if (i >= 2 && to === d[i - 2]) continue;
        moves.push(m);
      }
      d.push(at + pick(moves, moves.map((m) => (Math.abs(m) <= 4 ? 3 : Math.abs(m) <= 5 ? 2 : 1)), rand));
    }
    if (d[NOTE_COUNT - 1] % 7 !== 0) return d;
  }
}

export function makeChallenge(level: ChallengeLevel, voice: ChallengeVoice, seed: number): Challenge {
  const rand = seededRandom(seed);
  const base = voice === "high" ? 60 : 48;
  const notes = degreesFor(level, rand).map((d) => {
    const midi = degreeMidi(d, base);
    return { midi, syl: syllableOf(midi) };
  });
  return { level, voice, seed, clef: voice === "high" ? "treble" : "bass", notes };
}

/** The link that gives someone else this exercise. */
export function challengeLink(origin: string, c: Pick<Challenge, "level" | "voice" | "seed">) {
  const u = new URL("/challenge", origin);
  u.searchParams.set("l", c.level);
  u.searchParams.set("v", c.voice);
  u.searchParams.set("c", String(c.seed));
  return u.href;
}
