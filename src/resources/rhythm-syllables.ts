/**
 * Rhythm syllable systems for rhythm-only exercises.
 *
 * A system is data, not code: adding Takadimi, du-de or another counting
 * dialect should mean adding another object here, not touching the generator.
 * The resolver in generateUnison.ts consults these fields in a fixed order -
 * see `rhythmSyllableFor`.
 *
 * Every field may be a plain string or a function of the note's metric context.
 * Kodály needs only strings, because its syllables depend on duration and
 * position *within a beat*: the third sixteenth of a beat is "ti" wherever that
 * beat falls. Counting depends on which beat of the *measure* a note starts on -
 * the same note is "1", "2", "3" or "4" - so its rules are functions.
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
  /** Beats in a measure - 4, 3 or 2. Beat numbers wrap at this. */
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
   * anything - including rests inside a named figure.
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
    // The reverse of dotQuarterEighth. Named rather than derived for the same
    // reason as the others, and for one more: the sustain rule spells a held
    // note by the beats it crosses, not by its length, so deriving this gave
    // "tu-u" - identical to a half note, though this is a beat and a half
    // starting off the beat. The "a" is beat two, landing inside the long note.
    eighthDotQuarter: ["ti", "ti-a"],
  },
  slots: ["ti", "ki", "ti", "ki"],
  beat: "ta",
  sustain: (c) => "tu" + "-u".repeat(c.crossedBeats.length),
  rest: "(sh)",
};

/**
 * Held notes and rests spell out the beats they run through, so a student can
 * see where the next downbeat lands inside a long note. The "_" is a separator,
 * not decoration: AbcjsSingle splits on it to redraw each held beat above the
 * beat it actually marks, joined by a rule. Left undecorated the text still
 * reads correctly on its own ("1_2_3").
 *
 * A held note's beats are bare, since the rule already says the note is being
 * held. A rest keeps its parentheses throughout, because there the parentheses
 * mean something else - nothing is sounding at all.
 */
const heldBeats = (c: SyllableContext, parenthesised = false) =>
  c.crossedBeats
    .map((n) => (parenthesised ? `_(${n})` : `_${n}`))
    .join("");

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
  rest: (c) => `(${c.startLabel})` + heldBeats(c, true),
};

/** The ids the client may ask for. Only this string crosses the wire, so keep
 *  the union and the registry together - adding a system to one without the
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

// ── A teacher's own syllables ────────────────────────────────────────────────
//
// Kodály is taught in many dialects - ta-a or tu-u, ti-ti or ti-ka, "sh" or
// "rest" - and a class reads best in the words its teacher uses. So a director
// can keep their own set on their account: the same shape as Kodály (a beat, the
// four sixteenth positions, a held note, a rest, and the figures named whole),
// with their words. It is plain data, so it crosses the wire with the exercise
// where a SyllableSystem, which holds functions, cannot.

/** The id a page asks for to get the teacher's own set. */
export const CUSTOM_SYLLABLE_ID = "custom";

/** The figures a set names whole, and how many notes each has. */
export const NAMED_FIGURES = {
  dotQuarterEighth: 2,
  dotHalfQuarter: 2,
  eighthQuarterEighth: 3,
  eighthDotQuarter: 2,
  dotEighthSixteenth: 2,
} as const;
export type NamedFigure = keyof typeof NAMED_FIGURES;

export type CustomSyllables = {
  /** A note that starts on a beat and fills it: the quarter. */
  beat: string;
  /** The four sixteenth positions of a beat. Eighths take the first and third. */
  slots: [string, string, string, string];
  /** A held note: this, then `holdEach` once per further beat it runs through. */
  holdStart: string;
  /** May be empty, for systems that do not voice the held beats. */
  holdEach: string;
  rest: string;
  named: Record<NamedFigure, string[]>;
};

export const MAX_SYLLABLE_LENGTH = 12;
/**
 * What a syllable may not contain. It is written into an ABC annotation, so no
 * quote or backslash; "_" is how the page splits a held note's beats; "%" starts
 * an ABC comment; and a syllable is one word under one note, so no spaces.
 */
const SYLLABLE = /^[^\s"\\_%|]+$/;

type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

function checkSyllable(value: unknown, what: string, allowEmpty = false): Checked<string> {
  if (typeof value !== "string") return { ok: false, error: `${what} is missing.` };
  const s = value.trim();
  if (!s) return allowEmpty ? { ok: true, value: "" } : { ok: false, error: `${what} is empty.` };
  if (s.length > MAX_SYLLABLE_LENGTH) {
    return { ok: false, error: `${what} is longer than ${MAX_SYLLABLE_LENGTH} characters.` };
  }
  if (!SYLLABLE.test(s)) {
    return { ok: false, error: `${what} can't contain spaces or " \\ _ % |.` };
  }
  return { ok: true, value: s };
}

/** A whole set as saved or sent, checked field by field. */
export function checkCustomSyllables(value: unknown): Checked<CustomSyllables> {
  if (typeof value !== "object" || value === null) return { ok: false, error: "Expected a set of syllables." };
  const v = value as Record<string, any>;
  const fields: [keyof CustomSyllables, string, boolean][] = [
    ["beat", "The quarter note", false],
    ["holdStart", "The held note", false],
    ["holdEach", "The held beat", true],
    ["rest", "The rest", false],
  ];
  const out: Partial<CustomSyllables> = {};
  for (const [key, what, allowEmpty] of fields) {
    const c = checkSyllable(v[key], what, allowEmpty);
    if (!c.ok) return c;
    (out as any)[key] = c.value;
  }
  if (!Array.isArray(v.slots) || v.slots.length !== 4) return { ok: false, error: "Expected four sixteenth syllables." };
  const slots: string[] = [];
  for (let i = 0; i < 4; i++) {
    const c = checkSyllable(v.slots[i], `Sixteenth ${i + 1}`);
    if (!c.ok) return c;
    slots.push(c.value);
  }
  out.slots = slots as CustomSyllables["slots"];
  const named = {} as CustomSyllables["named"];
  for (const [figure, count] of Object.entries(NAMED_FIGURES) as [NamedFigure, number][]) {
    const list = v.named?.[figure];
    if (!Array.isArray(list) || list.length !== count) {
      return { ok: false, error: `Expected ${count} syllables for ${figure}.` };
    }
    named[figure] = [];
    for (let i = 0; i < count; i++) {
      const c = checkSyllable(list[i], `Note ${i + 1} of ${figure}`);
      if (!c.ok) return c;
      named[figure].push(c.value);
    }
  }
  out.named = named;
  return { ok: true, value: out as CustomSyllables };
}

/** A set as a working system, for the resolver. */
export function customSyllableSystem(c: CustomSyllables): SyllableSystem {
  return {
    id: CUSTOM_SYLLABLE_ID,
    label: "Mine",
    hint: `${c.beat}, ${c.slots[0]}-${c.slots[2]}, ${c.slots.join("-")}`,
    byName: { ...c.named },
    slots: [...c.slots],
    beat: c.beat,
    sustain: (ctx) => c.holdStart + c.holdEach.repeat(ctx.crossedBeats.length),
    rest: c.rest,
  };
}

/**
 * Places to start from. The first is exactly what the app writes as Kodály -
 * tests/unit/custom-syllables.test.ts holds it to that - and the rest are the
 * common dialects, to be edited from rather than trusted as any one method's
 * canon.
 */
export const syllableTemplates: { id: string; label: string; syllables: CustomSyllables }[] = [
  {
    id: "kodaly",
    label: "Kodály, as the app writes it (tu-u, ti-ki)",
    syllables: {
      beat: "ta",
      slots: ["ti", "ki", "ti", "ki"],
      holdStart: "tu",
      holdEach: "-u",
      rest: "(sh)",
      named: {
        dotQuarterEighth: ["ta-(i)", "ti"],
        dotHalfQuarter: ["tu-u-u", "ta"],
        eighthQuarterEighth: ["syn", "co", "pa"],
        eighthDotQuarter: ["ti", "ti-a"],
        dotEighthSixteenth: ["tim", "ri"],
      },
    },
  },
  {
    id: "kodaly-ta-a",
    label: "Kodály with ta-a and ti-ka",
    syllables: {
      beat: "ta",
      slots: ["ti", "ka", "ti", "ka"],
      holdStart: "ta",
      holdEach: "-a",
      rest: "rest",
      named: {
        dotQuarterEighth: ["ta-i", "ti"],
        dotHalfQuarter: ["ta-a-a", "ta"],
        eighthQuarterEighth: ["syn", "co", "pa"],
        eighthDotQuarter: ["ti", "ta-i"],
        dotEighthSixteenth: ["tim", "ka"],
      },
    },
  },
  {
    id: "takadimi",
    label: "Takadimi",
    syllables: {
      beat: "ta",
      slots: ["ta", "ka", "di", "mi"],
      holdStart: "ta",
      holdEach: "",
      rest: "(ta)",
      named: {
        dotQuarterEighth: ["ta", "di"],
        dotHalfQuarter: ["ta", "ta"],
        eighthQuarterEighth: ["ta", "di", "di"],
        eighthDotQuarter: ["ta", "di"],
        dotEighthSixteenth: ["ta", "mi"],
      },
    },
  },
  {
    id: "gordon",
    label: "Gordon (du, du-de)",
    syllables: {
      beat: "du",
      slots: ["du", "ta", "de", "ta"],
      holdStart: "du",
      holdEach: "",
      rest: "(du)",
      named: {
        dotQuarterEighth: ["du", "de"],
        dotHalfQuarter: ["du", "du"],
        eighthQuarterEighth: ["du", "de", "de"],
        eighthDotQuarter: ["du", "de"],
        dotEighthSixteenth: ["du", "ta"],
      },
    },
  },
];
