import { uilPresets } from "./uil-presets";
import type { VoiceTexture } from "./voice-texture";

/**
 * Planning a whole sight-reading example, rather than a phrase of one.
 *
 * `generateChoralExercise` writes 8 to 16 bars of good music and stops, which
 * is a phrase. A UIL example is 24 to 56 bars with a shape: a statement, a
 * departure that leans somewhere other than home, something imitative in the
 * middle at the upper levels, a return, and a close. `sectional-form.ts` can
 * already join independently generated sections; what was missing was anything
 * that decides WHAT the sections should be. That is this.
 *
 * It plans and does not generate. The output is a description - how many bars,
 * split how, in what key area, in what texture - which `buildSectionalExercise`
 * then realises. Keeping the two apart means the plan can be read, tested and
 * argued with on its own, and none of it touches the generator.
 *
 * Everything here is measured against two real examples in `scores/`:
 * `forgotten.abc` (44 bars, A-flat, SATB, level 4) and `summer-rains.abc`
 * (24 bars, G, SA, level 2), and against `notes/uil-criteria.md`.
 *
 * **What a plan cannot yet be turned into.** `keyArea` is planned and not yet
 * honoured: `generateChordProgression` has no way to be told to begin or cadence
 * anywhere but the tonic, so a section marked "dominant" will currently be
 * generated at home. The plan says what the piece should do; making the
 * generator do it is the next piece of work, and it is deliberately described
 * here rather than quietly omitted.
 *
 * Two other gaps, both visible against `forgotten`: its return is a FOUR-bar
 * recall of an eight-bar statement, where a plan's return is the whole
 * statement, because `sectional-form.ts` copies a section entire. And its coda
 * is ten bars against a planned four. Partial restatement would close both.
 */

/** What a section is for. */
export type SectionStyle =
  | "statement"
  | "departure"
  | "episode"
  | "imitative"
  | "return"
  | "close"
  | "coda";

/**
 * Where a section's harmony leans.
 *
 * Not a modulation with a new key signature - a tonicisation, the section
 * cadencing on that chord instead of home. `forgotten` does it at every
 * interior cadence: bars 4, 8, 15 and 26 all land on E-flat, the dominant of
 * A-flat.
 */
export type KeyArea = "tonic" | "dominant" | "relative-minor";

export type PlannedSection = {
  label: string;
  measures: number;
  /** Bar this section begins at, counting from 1. */
  startsAtBar: number;
  style: SectionStyle;
  keyArea: KeyArea;
  texture: VoiceTexture;
  /** Restates an earlier section by label - see sectional-form.ts. */
  restates?: string;
};

export type FormPlan = {
  level: number;
  meter: string;
  key: string;
  measures: number;
  sections: PlannedSection[];
  /**
   * The bar a lower level may stop on, where the piece reaches a full cadence
   * before the coda. One example serving two levels is standard practice.
   */
  shortEndingBar?: number;
  /** Share of bars in a polyphonic texture, against the level's ceiling. */
  polyphony: { share: number; ceiling: number };
};

export type FormPlanOptions = {
  level: number;
  /** "4/4", "3/4", "2/4". Changes the bar count, not the music. */
  meter?: string;
  /** A major key. Minor is refused here - see `planForm`. */
  key?: string;
  /** Overrides the level's own length. Must be inside the required range. */
  measures?: number;
  /** Injected for tests; defaults to Math.random. */
  rng?: () => number;
};

/**
 * The polyphony ceiling per level, from notes/uil-criteria.md.
 *
 * Levels 1 and 2 are "homophonic only" and "homophonic with a few simple
 * parallel motion lines" - no imitative section at all. 3 is "no more than 20%",
 * 4 "up to 30%", 5 "up to 50%". This is the budget the imitative section is
 * spent from, and `planForm` will not exceed it.
 */
export const POLYPHONY_CEILING: Record<number, number> = {
  1: 0,
  2: 0,
  3: 0.2,
  4: 0.3,
  5: 0.5,
};

/** Beats in a bar, from a meter name. */
function beatsPerMeasure(meter: string): number {
  const top = parseInt(meter.split("/")[0], 10);
  if (!Number.isFinite(top) || top <= 0) {
    throw new Error(`Unrecognised meter "${meter}".`);
  }
  return top;
}

/**
 * How many bars the level wants, in the meter asked for.
 *
 * The criteria state lengths in 4/4 and then say "or equivalent in 3/4", which
 * means the same amount of MUSIC, not the same number of barlines. Level 3 is
 * the one place the document does the arithmetic itself - 32-36 measures in 4/4
 * or 42-48 in 3/4 - and converting by beats reproduces exactly that, which is
 * the check that this reading is right.
 */
export function requiredMeasures(level: number, meter = "4/4"): [number, number] {
  const preset = uilPresets[`UIL ${level}` as keyof typeof uilPresets];
  if (!preset) throw new Error(`No such level: ${level}.`);
  const [min, max] = preset.measureRange;
  const beats = beatsPerMeasure(meter);
  return [Math.floor((min * 4) / beats), Math.floor((max * 4) / beats)];
}

type TemplateSection = {
  label: string;
  style: SectionStyle;
  /** Bars before any scaling. Every template's bases sum to the level's
   *  MINIMUM length, so a plan never has to shrink a section out of existence. */
  base: number;
  keyArea?: KeyArea;
  restates?: string;
  /**
   * Share of any surplus length this section takes. 0 means fixed.
   *
   * The imitative passage carries the most because it is the one thing a long
   * example has that a short one does not, and the statement and its return
   * carry none: a return has to be the same music as the statement to be heard
   * as one, so the pair can only grow together, and in both transcriptions the
   * period they make is 8 bars.
   */
  grow?: number;
};

/**
 * The shape of a piece at each level.
 *
 * Levels 1 and 2 are the rounded binary `summer-rains.abc` uses: a statement, a
 * departure, and the statement again. Level 3 adds a short imitative episode,
 * inside its 20% ceiling. Levels 4 and 5 follow `forgotten.abc`: statement,
 * departure to the dominant, an episode, an imitative passage, the return, a
 * full cadence a level-4 choir could stop on, and a coda.
 */
function template(level: number): TemplateSection[] {
  if (level <= 1) {
    return [
      { label: "A", style: "statement", base: 8 },
      { label: "B", style: "departure", base: 8, grow: 1 },
      { label: "A'", style: "return", base: 8, restates: "A" },
    ];
  }
  if (level === 2) {
    return [
      { label: "A", style: "statement", base: 8 },
      { label: "B", style: "departure", base: 8, grow: 1 },
      { label: "A'", style: "return", base: 8, restates: "A" },
      { label: "coda", style: "coda", base: 4, grow: 1 },
    ];
  }
  if (level === 3) {
    return [
      { label: "A", style: "statement", base: 8 },
      { label: "B", style: "departure", base: 8, grow: 1 },
      { label: "C", style: "imitative", base: 4, grow: 1 },
      { label: "A'", style: "return", base: 8, restates: "A" },
      { label: "coda", style: "coda", base: 4, grow: 1 },
    ];
  }
  // Levels 4 and 5, after forgotten.abc. The bases sum to 36, which is level
  // 4's minimum; level 5 starts 12 bars above it and grows into them.
  return [
    { label: "A", style: "statement", base: 8 },
    { label: "B", style: "departure", base: 4, keyArea: "dominant", grow: 2 },
    {
      label: "C",
      style: "episode",
      base: 4,
      // The other place the harmony is asked to leave home. Level 5 takes the
      // relative minor as well as the dominant; level 4 takes the dominant and
      // stays there.
      keyArea: level >= 5 ? "relative-minor" : "tonic",
      grow: 1,
    },
    { label: "D", style: "imitative", base: 4, grow: 3 },
    { label: "A'", style: "return", base: 8, restates: "A" },
    { label: "close", style: "close", base: 4 },
    { label: "coda", style: "coda", base: 4, grow: 1 },
  ];
}

/**
 * Spread a surplus over the sections that may grow, in whole 4-bar phrases.
 *
 * Proportional to `grow` rather than round-robin. Round-robin put the first
 * flexible section first every time, which at level 2 turned a four-bar
 * surplus into a twelve-bar departure answering an eight-bar statement,
 * instead of the four-bar coda the shape actually wanted.
 */
function absorb(sections: TemplateSection[], surplus: number): number[] {
  const out = sections.map((s) => s.base);
  const growers = sections
    .map((s, i) => ({ i, w: s.grow ?? 0 }))
    .filter((g) => g.w > 0);
  const total = growers.reduce((n, g) => n + g.w, 0);
  if (growers.length === 0 || total === 0 || surplus === 0) return out;

  const GRID = 4;
  let placed = 0;
  for (const g of growers) {
    const share = Math.round((surplus * g.w) / total / GRID) * GRID;
    const capped = Math.max(share, -(out[g.i] - GRID)); // never below one phrase
    out[g.i] += capped;
    placed += capped;
  }
  // Whatever the rounding left goes to the widest grower, because the
  // alternative is a plan whose sections do not sum to its own length.
  const rest = surplus - placed;
  if (rest !== 0) {
    const widest = growers.reduce((a, b) => (b.w > a.w ? b : a));
    out[widest.i] = Math.max(GRID, out[widest.i] + rest);
  }
  return out;
}

/** Major keys a level allows, in the order the preset lists them. */
export function majorKeysFor(level: number): string[] {
  const preset = uilPresets[`UIL ${level}` as keyof typeof uilPresets];
  if (!preset) throw new Error(`No such level: ${level}.`);
  return preset.allowedKeys.filter((k) => !k.endsWith("m"));
}

/**
 * Plan a full-length example.
 *
 * **Always major.** A full example starts in major and a minor key is refused
 * rather than quietly swapped, because a caller asking for one has a different
 * thing in mind and should be told so. Minor belongs to short practice
 * exercises, which is what the generator's own picker already makes.
 */
export function planForm(opts: FormPlanOptions): FormPlan {
  const { level, meter = "4/4", rng = Math.random } = opts;
  const [min, max] = requiredMeasures(level, meter);

  if (opts.key && opts.key.endsWith("m")) {
    throw new Error(
      `A full-length example starts in major; "${opts.key}" is minor. Minor keys are for the short practice exercises.`
    );
  }
  const majors = majorKeysFor(level);
  const key = opts.key ?? majors[Math.floor(rng() * majors.length)] ?? "C";
  if (opts.key && !majors.includes(opts.key)) {
    throw new Error(`Level ${level} does not allow the key "${opts.key}".`);
  }

  const measures = opts.measures ?? min;
  if (measures < min || measures > max) {
    throw new Error(
      `Level ${level} in ${meter} wants ${min}-${max} measures; ${measures} is outside that.`
    );
  }

  const spec = template(level);
  const base = spec.reduce((n, s) => n + s.base, 0);
  const lengths = absorb(spec, measures - base);
  // A return is the same music as its statement, so it is the same length.
  spec.forEach((s, i) => {
    if (!s.restates) return;
    const source = spec.findIndex((o) => o.label === s.restates);
    if (source >= 0) lengths[i] = lengths[source];
  });

  const ceiling = POLYPHONY_CEILING[level] ?? 0;

  // Spend no more of the piece on imitation than the level allows.
  //
  // "Up to 30% polyphony" is a ceiling, not a target, and the imitative section
  // is the widest grower - so at the long end of a 2/4 example it outgrew the
  // budget. Shortening it is right where refusing it is not: dropping the
  // section left level 3 with no imitative passage at all at its longest
  // lengths, which is a different shape rather than a compliant one. The bars
  // it gives up go to the coda, or to the widest other grower.
  const GRID = 4;
  const budget = Math.floor((ceiling * measures) / GRID) * GRID;
  const imitativeAt = spec.findIndex((s) => s.style === "imitative");
  if (imitativeAt >= 0 && lengths[imitativeAt] > budget) {
    const excess = lengths[imitativeAt] - budget;
    lengths[imitativeAt] = budget;
    const elsewhere = spec
      .map((s, i) => ({ i, w: s.grow ?? 0 }))
      .filter((g) => g.w > 0 && g.i !== imitativeAt)
      .sort((a, b) => b.w - a.w)[0];
    if (elsewhere) lengths[elsewhere.i] += excess;
  }

  const sections: PlannedSection[] = [];
  let bar = 1;
  let polyphonic = 0;
  for (let i = 0; i < spec.length; i++) {
    const s = spec[i];
    if (lengths[i] <= 0) continue; // a section scaled to nothing is not a section
    // Capped above, so this only ever refuses a section the budget cannot pay
    // for at all - a level whose ceiling times its length is under one phrase.
    // No level is that tight; the branch is kept so a new one cannot slip an
    // over-budget passage through unnoticed.
    const wantsImitation = s.style === "imitative";
    const imitative = wantsImitation && budget >= GRID;
    if (imitative) polyphonic += lengths[i];
    sections.push({
      label: s.label,
      measures: lengths[i],
      startsAtBar: bar,
      style: imitative ? "imitative" : wantsImitation ? "episode" : s.style,
      keyArea: s.keyArea ?? "tonic",
      // The fugue-like texture we do not have; staggered entrances are what
      // stand in for it, and they are genuinely imitative in effect - each part
      // enters on its own, lowest first.
      texture: imitative ? "staggered" : "full",
      ...(s.restates ? { restates: s.restates } : {}),
    });
    bar += lengths[i];
  }

  // Where a lower level stops: the full cadence before the coda.
  const closing = sections.find((s) => s.style === "close");
  const shortEndingBar = closing
    ? closing.startsAtBar + closing.measures - 1
    : undefined;

  return {
    level,
    meter,
    key,
    measures,
    sections,
    shortEndingBar,
    polyphony: { share: polyphonic / measures, ceiling },
  };
}

/** The plan as lines a person can read. */
export function describeForm(plan: FormPlan): string[] {
  const where: Record<KeyArea, string> = {
    tonic: "home",
    dominant: "toward V",
    "relative-minor": "toward vi",
  };
  const lines = [
    `Level ${plan.level}, ${plan.key} major, ${plan.meter}, ${plan.measures} bars`,
  ];
  for (const s of plan.sections) {
    const last = s.startsAtBar + s.measures - 1;
    const bits = [
      `${s.style}${s.restates ? ` of ${s.restates}` : ""}`,
      where[s.keyArea],
      s.texture === "staggered" ? "staggered entrances" : "all voices",
    ];
    lines.push(
      `  ${s.label.padEnd(5)} bars ${String(s.startsAtBar).padStart(2)}-${String(last).padEnd(2)}  ${bits.join(", ")}`
    );
  }
  if (plan.shortEndingBar) {
    lines.push(`  a lower level may stop at bar ${plan.shortEndingBar}`);
  }
  lines.push(
    `  polyphony ${(100 * plan.polyphony.share).toFixed(0)}% of ${(100 * plan.polyphony.ceiling).toFixed(0)}% allowed`
  );
  return lines;
}
