/**
 * Rhythm syllable systems for rhythm-only exercises.
 *
 * A system is data, not code: adding Takadimi, du-de or another counting
 * dialect should mean adding another object here, not touching the generator.
 * The resolver in generateUnison.ts consults these fields in a fixed order —
 * see `rhythmSyllableFor`.
 *
 * Every field may be a plain string or a function of the note's metric context.
 * Kodály needs only strings, because its syllables depend on duration and
 * position *within a beat*: the third sixteenth of a beat is "ti" wherever that
 * beat falls. Counting depends on which beat of the *measure* a note starts on —
 * the same note is "1", "2", "3" or "4" — so its rules are functions.
 */

/** What the beat and slot rules get. Deliberately without `startLabel`, which
 *  does not exist yet at the point those two rules run. */
export type PositionContext = {
  /** 1-based beat of the measure the note starts on. */
  beatNumber: number;
  /** Where the note starts, in 32nd-note units from the barline. */
  offsetInMeasure: number;
  /** One beat, in 32nd-note units (8 for a quarter). */
  beatUnits: number;
  /** Beats in a measure — 4, 3 or 2. Beat numbers wrap at this. */
  beatsPerMeasure: number;
  /** This note, in 32nd-note units. */
  noteLength: number;
  /** Index of this note within its parent pattern rhythm. */
  patternIndex: number;
  rest: boolean;
  /** Beat numbers whose downbeat falls strictly inside this note. Empty for a
   *  note that ends before the next beat. A half note on beat 1 gives [2]. */
  crossedBeats: number[];
};

/** What the sustain, rest and named rules get: the above plus the label the
 *  beat/slot rules produced, so a system can decorate it rather than restate
 *  it. Counting's "1_(2)" and "(1)_(2)" are both that label plus a suffix. */
export type SyllableContext = PositionContext & { startLabel: string };

export type PositionSyllable = string | ((ctx: PositionContext) => string);
export type Syllable = string | ((ctx: SyllableContext) => string);

export function resolveSyllable<C>(
  syllable: string | ((ctx: C) => string),
  ctx: C
): string {
  return typeof syllable === "function" ? syllable(ctx) : syllable;
}

export type SyllableSystem = {
  id: string;
  label: string;
  /** One-line example shown under the picker. */
  hint: string;
  /**
   * Syllables for a whole named rhythm, indexed by the note's patternIndex.
   * Use this for figures whose syllables are idiomatic rather than derivable
   * from duration and position. Checked first, so a system can override
   * anything — including rests inside a named figure.
   */
  byName: Record<string, Syllable[]>;
  /** Syllables for the sixteenth-note slots within one beat. */
  slots: PositionSyllable[];
  /** A note that starts on a beat and fills exactly one. */
  beat: PositionSyllable;
  /** A note whose duration carries it past at least one further downbeat. */
  sustain: Syllable;
  /** Any rest. */
  rest: Syllable;
};

export const kodaly: SyllableSystem = {
  id: "kodaly",
  label: "Kodály",
  hint: "ta, ti-ti, ti-ki-ti-ki",
  byName: {
    // Idiomatic figures. The dotted pairs are named rather than derived because
    // their second note lands off the sixteenth grid the slot rule assumes.
    dotEighthSixteenth: ["tim", "ri"],
    // The "(i)" marks where beat two falls, so the second downbeat is felt.
    dotQuarterEighth: ["ta-(i)", "ti"],
    dotHalfQuarter: ["tu-u-u", "ta"],
    // The standard name for the syncopation figure, where the quarter straddles
    // the beat.
    eighthQuarterEighth: ["syn", "co", "pa"],
  },
  slots: ["ti", "ki", "ti", "ki"],
  beat: "ta",
  sustain: (c) => "tu" + "-u".repeat(c.crossedBeats.length),
  rest: "(sh)",
};

/** Held notes and rests both spell out the beats they run through, so a student
 *  can see where the next downbeat lands inside a long note. */
const heldBeats = (c: SyllableContext) =>
  c.crossedBeats.map((n) => `_(${n})`).join("");

export const counting: SyllableSystem = {
  id: "counting",
  label: "Counting",
  hint: "1 2 & 3 e & a 4",
  // Nothing to name: the positional rules already produce the standard count
  // for every figure, the dotted pairs and the syncopation included.
  byName: {},
  slots: [(c) => String(c.beatNumber), "e", "&", "a"],
  beat: (c) => String(c.beatNumber),
  sustain: (c) => c.startLabel + heldBeats(c),
  // A rest is counted silently, which is what the parentheses mean.
  rest: (c) => `(${c.startLabel})` + heldBeats(c),
};

/** The ids the client may ask for. Only this string crosses the wire, so keep
 *  the union and the registry together — adding a system to one without the
 *  other is then a type error rather than a silent fall back to Kodály. */
export type SyllableSystemId = "kodaly" | "counting";

export const syllableSystems: Record<SyllableSystemId, SyllableSystem> = {
  kodaly,
  counting,
};

export function isSyllableSystemId(value: unknown): value is SyllableSystemId {
  return typeof value === "string" && value in syllableSystems;
}

export const defaultSyllableSystem = kodaly;
