/**
 * The ear-training quizzes (Blaine, 17 November 2026: ear-training games
 * from learnmusic.fun, for points if the teacher allows it; the first is
 * Solfège ear training). Pure and seeded: the browser plays a round from a
 * seed, and the server deals the same round from the same seed and marks the
 * answers itself (src/lib/server/ear-games.ts), so a round can't be made up.
 *
 * A round is QUIZ_LENGTH questions. Each question is a note, as semitones
 * from the tonic (negative below it); the answer is its pitch class from the
 * tonic, 0 to 11, which every naming (solfège, numbers, fixed do, letters)
 * names one way.
 */

export const QUIZ_LENGTH = 10;

/**
 * How fast an honest round can go (the server refuses faster ones, ear-games.ts):
 * the key, then for each question the wait before the tiles open (they open as
 * its last note sounds) and the NEXT_AFTER_RIGHT pause after a right answer,
 * with a second to spare. Keep in step with playEar's timings and EarQuiz.
 */
export const NEXT_AFTER_RIGHT = 0.9;
/** The key in playEar: the chord 1.3 s, seven notes 0.5 s apart, then a breath: about 5.7 s. */
const KEY_SECONDS = 5;
const floorFor = (key: number, open: number) => key + QUIZ_LENGTH * (open + NEXT_AFTER_RIGHT) - 1;

/** mulberry32: a small seeded random number source, the same on every machine. */
export function rngFrom(seed: number): () => number {
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
const pick = <T>(rng: () => number, list: readonly T[]): T => list[Math.floor(rng() * list.length)]!;
export const pcOf = (semis: number) => ((semis % 12) + 12) % 12;

// ── Solfège ear training ───────────────────────────────────────────────────

export type Tonality = "major" | "minor";
/** How the notes are named: movable do, scale degrees, fixed do (C is do), letter names. */
export type NameAs = "solfege" | "numbers" | "fixed" | "letters";
export type MinorAs = "la" | "do";

export type SolfegeSetup = {
  tonality: Tonality;
  /** 1 to SOLFEGE_LEVELS.length; 0 is Custom (`notes`). */
  level: number;
  /** Custom: the notes, as semitones from the tonic, -7 to 12. */
  notes?: number[];
  nameAs: NameAs;
  minorAs: MinorAs;
  /** Sound the tonic before each note (the key is played at the start of every round either way). */
  tonicFirst: boolean;
};

/** The levels, as semitones from the tonic: the order abcStepByStep brings notes in. */
export const SOLFEGE_LEVELS: Record<Tonality, { name: string; notes: number[] }[]> = {
  major: [
    { name: "Do, mi, so", notes: [0, 4, 7] },
    { name: "Do, re, mi", notes: [0, 2, 4] },
    { name: "Up to so", notes: [0, 2, 4, 5, 7] },
    { name: "Up to la", notes: [0, 2, 4, 5, 7, 9] },
    { name: "The whole scale", notes: [0, 2, 4, 5, 7, 9, 11, 12] },
    { name: "Below do", notes: [-5, -3, -1, 0, 2, 4, 5, 7] },
    { name: "Low so to high do", notes: [-5, -3, -1, 0, 2, 4, 5, 7, 9, 11, 12] },
    { name: "Chromatic", notes: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
  ],
  minor: [
    { name: "La, do, mi", notes: [0, 3, 7] },
    { name: "La, ti, do", notes: [0, 2, 3] },
    { name: "Up to mi", notes: [0, 2, 3, 5, 7] },
    { name: "Up to fa", notes: [0, 2, 3, 5, 7, 8] },
    { name: "The whole scale", notes: [0, 2, 3, 5, 7, 8, 10, 12] },
    { name: "Below la", notes: [-5, -4, -2, 0, 2, 3, 5, 7] },
    { name: "With si (harmonic)", notes: [-5, -4, -1, 0, 2, 3, 5, 7, 8, 11, 12] },
    { name: "Chromatic", notes: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
  ],
};

/** A setup as sent from anywhere (the browser's own storage, a request), made safe. */
export function checkSolfegeSetup(v: unknown): SolfegeSetup {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const tonality: Tonality = o.tonality === "minor" ? "minor" : "major";
  const levels = SOLFEGE_LEVELS[tonality].length;
  const level = typeof o.level === "number" && Number.isInteger(o.level) && o.level >= 0 && o.level <= levels ? o.level : 1;
  const notes = Array.isArray(o.notes)
    ? [...new Set(o.notes.filter((n): n is number => typeof n === "number" && Number.isInteger(n) && n >= -7 && n <= 12))].sort((a, b) => a - b)
    : [];
  const nameAs: NameAs = (["solfege", "numbers", "fixed", "letters"] as const).includes(o.nameAs as NameAs) ? (o.nameAs as NameAs) : "solfege";
  return {
    tonality,
    // Custom needs two pitch classes to tell apart; with fewer it is level 1.
    level: level === 0 && new Set(notes.map(pcOf)).size < 2 ? 1 : level,
    ...(level === 0 ? { notes } : {}),
    nameAs,
    minorAs: o.minorAs === "do" ? "do" : "la",
    tonicFirst: o.tonicFirst !== false,
  };
}

/** Solfège: the key, then the tonic 1.1 s before each note (or the note alone). */
export const solfegeMinSeconds = (s: SolfegeSetup) => floorFor(KEY_SECONDS, s.tonicFirst ? 1.1 : 0);

export const solfegeNotes = (s: SolfegeSetup) => (s.level === 0 ? s.notes ?? [] : SOLFEGE_LEVELS[s.tonality][s.level - 1]!.notes);

/** Tonics a round may be in, as MIDI notes near the middle of a voice; the round's notes fit 53 to 79. */
const TONICS = [60, 62, 63, 65, 67, 57, 58]; // C D Eb F G A Bb
/** Their letter names, for fixed do and letters. */
const TONIC_NAMES: Record<number, string> = { 60: "C", 62: "D", 63: "Eb", 65: "F", 67: "G", 57: "A", 58: "Bb", 64: "E", 61: "C#", 66: "F#", 59: "B", 56: "Ab" };

export type SolfegeRound = {
  /** The tonic, a MIDI note, and its name. */
  tonic: number;
  tonicName: string;
  /** Each question's note, semitones from the tonic. */
  questions: number[];
  /** The answers to offer, as pitch classes from the tonic, low to high. */
  choices: number[];
};

/**
 * One round from a seed. In minor the tonic is la (or do, do-based): the
 * same note either way; only the names change. Notes come from a shuffled
 * bag, so every note of the level is heard before one comes again, and never
 * the same note twice in a row.
 */
export function solfegeRound(setup: SolfegeSetup, seed: number): SolfegeRound {
  const rng = rngFrom(seed);
  const notes = solfegeNotes(setup);
  // A tonic whose notes stay inside 53..79.
  const fits = TONICS.filter((t) => t + Math.min(...notes) >= 53 && t + Math.max(...notes) <= 79);
  const tonic = pick(rng, fits.length ? fits : [60]);
  const questions: number[] = [];
  let bag: number[] = [];
  while (questions.length < QUIZ_LENGTH) {
    const last = pcOf(questions[questions.length - 1] ?? 99);
    // Left with only the note just played (so and low so): the next bag joins in.
    if (!bag.some((n) => pcOf(n) !== last)) bag = [...bag, ...notes];
    const n = pick(rng, bag.filter((n) => pcOf(n) !== last));
    bag.splice(bag.indexOf(n), 1);
    questions.push(n);
  }
  return { tonic, tonicName: TONIC_NAMES[tonic] ?? "C", questions, choices: [...new Set(notes.map(pcOf))].sort((a, b) => a - b) };
}

// ── Names ──────────────────────────────────────────────────────────────────

/** Movable do in major, by pitch class from do (chromatic: di, me, fi, le, te, the ones choirs meet first). */
const MAJOR_SOLFEGE = ["do", "di", "re", "me", "mi", "fa", "fi", "so", "le", "la", "te", "ti"];
/** Minor, do-based: do re me fa so le te (ti for the raised seventh). */
const MINOR_DO = ["do", "di", "re", "me", "mi", "fa", "fi", "so", "le", "la", "te", "ti"];
/** Minor, la-based: la ti do re mi fa so (si for the raised seventh). */
const MINOR_LA = ["la", "li", "ti", "do", "di", "re", "ri", "mi", "fa", "fi", "so", "si"];
const MAJOR_NUMBERS = ["1", "♯1", "2", "♭3", "3", "4", "♯4", "5", "♭6", "6", "♭7", "7"];
const MINOR_NUMBERS = ["1", "♯1", "2", "3", "♮3", "4", "♯4", "5", "6", "♮6", "7", "♯7"];
/** Letters a step above the tonic's letter, for spelling. */
const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
const NATURAL = [0, 2, 4, 5, 7, 9, 11];
/** For each pitch class from the tonic, the scale degree it is spelled on (0 = the tonic's letter). */
const DEGREE_OF = [0, 0, 1, 2, 2, 3, 3, 4, 5, 5, 6, 6];
const FIXED_DO: Record<string, string> = { C: "do", D: "re", E: "mi", F: "fa", G: "sol", A: "la", B: "ti" };

/** A note spelled from the tonic's name: Bb's fourth is Eb, D's third is F#. */
export function spell(tonicName: string, pc: number): string {
  const letter = tonicName[0]!;
  const tonicPc = NATURAL[LETTERS.indexOf(letter)]! + (tonicName.includes("#") ? 1 : tonicName.includes("b") ? -1 : 0);
  // Major and minor spell alike: pitch class 3 a third, 8 a sixth, 10 and 11 sevenths.
  const degree = DEGREE_OF[pc]!;
  const target = LETTERS[(LETTERS.indexOf(letter) + degree) % 7]!;
  let diff = pcOf(tonicPc + pc - NATURAL[LETTERS.indexOf(target)]!);
  if (diff > 6) diff -= 12;
  return target + (diff > 0 ? "♯".repeat(diff) : "♭".repeat(-diff));
}

/** What a note is called in this setup (the answer buttons, the key strip, the feedback). */
export function nameOf(setup: SolfegeSetup, round: Pick<SolfegeRound, "tonicName">, pc: number): string {
  const minor = setup.tonality === "minor";
  if (setup.nameAs === "numbers") return (minor ? MINOR_NUMBERS : MAJOR_NUMBERS)[pc]!;
  if (setup.nameAs === "solfege") return (!minor ? MAJOR_SOLFEGE : setup.minorAs === "do" ? MINOR_DO : MINOR_LA)[pc]!;
  const name = spell(round.tonicName, pc);
  if (setup.nameAs === "letters") return name;
  return FIXED_DO[name[0]!]! + name.slice(1);
}

/** The key as it is played (tonic chord, then 1 3 5 3 1 5 1), in semitones from the tonic. */
export const keyPattern = (t: Tonality) => (t === "minor" ? [0, 3, 7, 3, 0, -5, 0] : [0, 4, 7, 4, 0, -5, 0]);
export const keyChord = (t: Tonality) => (t === "minor" ? [0, 3, 7] : [0, 4, 7]);

// ── Interval ear training ───────────────────────────────────────────────────

/**
 * Two notes, one after the other (up, down, or either) or together: name the
 * distance. The first levels are sizes only, from a major scale (step or
 * skip, then 2nds to 5ths, then to the octave), the way sight singers meet
 * them; then major and minor and perfect, by semitones. An answer is the size
 * (2 to 8) on the sizes levels, the semitones (1 to 12) on the others.
 */
export type Direction = "up" | "down" | "both" | "together";
export type IntervalSetup = {
  /** 1 to INTERVAL_LEVELS.length; 0 is Custom (`semis`). */
  level: number;
  semis?: number[];
  direction: Direction;
};
export const INTERVAL_LEVELS: { name: string; sizes?: number[]; semis?: number[] }[] = [
  { name: "Step or skip", sizes: [2, 3] },
  { name: "2nds to 5ths", sizes: [2, 3, 4, 5] },
  { name: "2nds to the octave", sizes: [2, 3, 4, 5, 6, 7, 8] },
  { name: "Major and minor 2nds and 3rds", semis: [1, 2, 3, 4] },
  { name: "3rds, 4th, 5th, octave", semis: [3, 4, 5, 7, 12] },
  { name: "Add the 6ths", semis: [3, 4, 5, 7, 8, 9, 12] },
  { name: "All of them", semis: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
];
export const INTERVAL_NAMES: Record<number, string> = {
  1: "Minor 2nd", 2: "Major 2nd", 3: "Minor 3rd", 4: "Major 3rd", 5: "Perfect 4th", 6: "Tritone",
  7: "Perfect 5th", 8: "Minor 6th", 9: "Major 6th", 10: "Minor 7th", 11: "Major 7th", 12: "Octave",
};
const SIZE_NAMES: Record<number, string> = { 2: "2nd", 3: "3rd", 4: "4th", 5: "5th", 6: "6th", 7: "7th", 8: "Octave" };

export function checkIntervalSetup(v: unknown): IntervalSetup {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const level = typeof o.level === "number" && Number.isInteger(o.level) && o.level >= 0 && o.level <= INTERVAL_LEVELS.length ? o.level : 1;
  const semis = Array.isArray(o.semis) ? [...new Set(o.semis.filter((n): n is number => typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 12))].sort((a, b) => a - b) : [];
  const direction: Direction = (["up", "down", "both", "together"] as const).includes(o.direction as Direction) ? (o.direction as Direction) : "up";
  return { level: level === 0 && semis.length < 2 ? 1 : level, ...(level === 0 && semis.length >= 2 ? { semis } : {}), direction };
}

/** The answers a setup offers: sizes on the sizes levels, else semitones. */
/** Intervals: no key; the second note 1 s after the first, or both at once. */
export const intervalMinSeconds = (s: IntervalSetup) => floorFor(0, s.direction === "together" ? 0 : 1);

export function intervalChoices(s: IntervalSetup): { sizes: boolean; values: number[] } {
  if (s.level === 0) return { sizes: false, values: s.semis ?? [] };
  const l = INTERVAL_LEVELS[s.level - 1]!;
  return l.sizes ? { sizes: true, values: l.sizes } : { sizes: false, values: l.semis! };
}
export function intervalName(s: IntervalSetup, value: number): string {
  const { sizes } = intervalChoices(s);
  if (!sizes) return INTERVAL_NAMES[value] ?? String(value);
  if (s.level === 1) return value === 2 ? "Step (2nd)" : "Skip (3rd)";
  return SIZE_NAMES[value] ?? String(value);
}

export type IntervalRound = {
  /** Each question: its two notes as MIDI, in the order played (together: low first), and its answer. */
  questions: { from: number; to: number; answer: number }[];
  together: boolean;
};

/** A major scale's degree k (any integer) as semitones from its tonic. */
const degreeSemis = (k: number) => 12 * Math.floor(k / 7) + NATURAL[((k % 7) + 7) % 7]!;

export function intervalRound(setup: IntervalSetup, seed: number): IntervalRound {
  const rng = rngFrom(seed);
  const { sizes, values } = intervalChoices(setup);
  const together = setup.direction === "together";
  const questions: IntervalRound["questions"] = [];
  let bag: number[] = [];
  while (questions.length < QUIZ_LENGTH) {
    const last = questions[questions.length - 1]?.answer;
    if (!bag.some((v) => v !== last)) bag = [...bag, ...values];
    const answer = pick(rng, bag.filter((v) => v !== last));
    bag.splice(bag.indexOf(answer), 1);
    const down = setup.direction === "down" || (setup.direction === "both" && rng() < 0.5);
    let from: number, to: number;
    if (sizes) {
      // From a major scale: a tonic, a degree to start on, the size counted in scale steps.
      const tonic = pick(rng, TONICS);
      const starts = Array.from({ length: 21 }, (_, i) => i - 7).filter((k) => {
        const a = tonic + degreeSemis(k);
        const b = tonic + degreeSemis(k + (down ? -1 : 1) * (answer - 1));
        return Math.min(a, b) >= 52 && Math.max(a, b) <= 81;
      });
      const k = pick(rng, starts);
      from = tonic + degreeSemis(k);
      to = tonic + degreeSemis(k + (down ? -1 : 1) * (answer - 1));
    } else {
      const span = answer;
      const lows = Array.from({ length: 81 - span - 52 + 1 }, (_, i) => 52 + i).filter((m) => m >= 55 && m + span <= 79);
      const low = pick(rng, lows);
      [from, to] = down ? [low + span, low] : [low, low + span];
    }
    if (together && from > to) [from, to] = [to, from];
    questions.push({ from, to, answer });
  }
  return { questions, together };
}
