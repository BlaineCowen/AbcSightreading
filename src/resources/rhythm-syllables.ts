/**
 * Rhythm syllable systems for rhythm-only exercises.
 *
 * A system is data, not code: adding Takadimi, du-de or counting numbers should
 * mean adding another object here, not touching the generator. The resolver in
 * generateUnison.ts consults these fields in a fixed order — see
 * `rhythmSyllableFor`.
 */
export type SyllableSystem = {
  id: string;
  label: string;
  /**
   * Syllables for a whole named rhythm, indexed by the note's patternIndex.
   * Use this for figures whose syllables are idiomatic rather than derivable
   * from duration and position. Checked first, so a system can override
   * anything — including rests inside a named figure.
   */
  byName: Record<string, string[]>;
  /** Syllables for the sixteenth-note slots within one beat. */
  slots: string[];
  /** A note filling exactly one beat. */
  beat: string;
  /** A note lasting `beats` beats, where beats >= 2. */
  sustain: (beats: number) => string;
  /** Any rest. */
  rest: string;
};

export const kodaly: SyllableSystem = {
  id: "kodaly",
  label: "Kodály",
  byName: {
    // Idiomatic figures. The dotted pairs are named rather than derived because
    // their second note lands off the sixteenth grid the slot rule assumes.
    dotEighthSixteenth: ["tim", "ri"],
    // The "(i)" marks where beat two falls, so the second downbeat is felt.
    dotQuarterEighth: ["ta-(i)", "ti"],
    dotHalfQuarter: ["tu-u-u", "ta"],
    // Not currently generated - there is no eighthQuarterEighth in rhythms.ts -
    // but this is the standard name for the figure, ready for when it is added.
    eighthQuarterEighth: ["syn", "co", "pa"],
  },
  slots: ["ti", "ki", "ti", "ki"],
  beat: "ta",
  sustain: (beats: number) => "tu" + "-u".repeat(Math.max(0, beats - 1)),
  rest: "sh",
};

export const syllableSystems: Record<string, SyllableSystem> = {
  [kodaly.id]: kodaly,
};

export const defaultSyllableSystem = kodaly;
