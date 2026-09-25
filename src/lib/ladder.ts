/**
 * Step by step: a sight-reading sequence from a class's first rhythm to four
 * parts at UIL level 5 and past it. Separate from the UIL levels, which
 * describe what a contest asks for; this describes how to get there.
 *
 * The sequence follows the usual order of a sound-before-sight choral
 * curriculum (Kodály-based, as the rhythm syllables are):
 *
 * - One new thing per step. A step adds a rhythm, OR pitches, OR a harmony,
 *   OR a texture, OR keys - never two - and `newThing` says which, so a
 *   director can see what the class is being asked to learn.
 * - The new thing arrives on familiar material. New rhythms come on pitches
 *   the class already reads; new pitches on rhythms it already reads; parts
 *   begin on the rhythms and harmony the single line already used.
 * - Rhythm before pitch. The first steps are rhythm alone, spoken on the
 *   syllables, so the first pitched step has only pitch to think about.
 * - Pitch grows out from do: do-re-mi by step, then up to so, then the tonic
 *   triad as the first skips, then la-ti-do above and the notes below do. A new
 *   pitch comes in by step before it is skipped to.
 * - Unison before parts, and two parts before three and four. The first
 *   two-part steps run at level 1 behaviour, where the parts open in unison and
 *   split - the way two-part writing is taught.
 * - Harmony follows the functional order: I, IV and V together (the choral
 *   generator's phrases need a predominant before the cadence, so tonic and
 *   dominant alone cannot make one), then V7, then ii and vi, then secondary
 *   dominants, then minor.
 * - Rests, meters and keys are introduced as their own steps, not slipped in.
 *
 * Steps are addressed by `id`, never by position, so a class's progress keeps
 * pointing at the right step when steps are added or reordered. Never reuse or
 * rename an id; retire it instead.
 *
 * Unison steps are applied over the page's current settings: they set what is
 * read (rhythms, scale degrees, key, meter, skip size, length) and leave the
 * clef and range alone, so a tenor-bass class reads in bass clef at its own
 * pitch. Choral steps use the voice ranges hand-calibrated for the matching UIL
 * level - see uil-presets.ts, and do not invent ranges here.
 */
import { uilPresets, type UILPreset } from "./uil-presets";
import { keySignatures } from "../resources/key-signatures";

export type LadderPage = "unison" | "choral";

/** What a unison step sets on the Unison page. The rest stays as it was. */
export interface UnisonStepSettings {
  rhythmOnly: boolean;
  selectedRhythms: string[];
  selectedTimeSignature: string;
  measures: number;
  /**
   * Eighth pairs sung on one pitch (false) or moving (true). Set by every step
   * rather than left to whatever the page had: on one pitch, ti-ti is read as
   * rhythm alone, which is where the ladder starts.
   */
  moveEighthNotes: boolean;
  /** Pitched steps only. */
  selectedKey?: string;
  selectedScaleDegrees?: number[];
  maxSkip?: number;
  /**
   * Pitched steps: the range, in scale steps below and above do. The range is
   * part of what a step teaches - do-re-mi is do up to mi, not any three notes
   * of an octave - and without it the line can start on high do and have
   * nowhere to go by step. Placed on the do inside the class's own range, so
   * the clef and octave stay theirs (see rangeForStep).
   */
  span?: [below: number, above: number];
}

/**
 * What a choral step sets: a UIL-shaped level, so the Choral page treats it as
 * it treats a UIL level - dimming what is outside it, and running at `level`'s
 * behaviour (unison openings in two parts, how much polyphony, phrase rhyme).
 */
export interface ChoralStepSettings extends Omit<UILPreset, "label" | "measureRange"> {
  /** Measures to start at. Short: this is a drill, not a contest example. */
  measures: number;
  /** Switched on, where the level's list is only what is allowed. */
  selectedRhythmNames: string[];
  voiceTexture?: "full" | "staggered";
}

export interface LadderStep {
  /** Stable forever - class progress is stored against it. */
  id: string;
  /** 1-based position, for display. Derived; not stored anywhere. */
  number: number;
  stage: string;
  /** Short name of the step. */
  title: string;
  /** The one thing this step adds, as a director would say it. */
  newThing: string;
  /** Roughly where a class is against the UIL levels, when it lines up. */
  uil?: number;
  page: LadderPage;
  unison?: UnisonStepSettings;
  choral?: ChoralStepSettings;
}

// ── Building blocks ─────────────────────────────────────────────────────────

const U = uilPresets;

/** The ranges calibrated for a UIL level. */
const rangesOf = (level: 1 | 2 | 3 | 4 | 5) => U[`UIL ${level}`].voiceRanges;

const RESTS_1 = ["wholeRest", "halfRest", "quarterRest"];

const TWO_PART = ["2 Part Treble", "2 Part Tenor/Bass"];
const THREE_PART = ["3 Part Mixed", "3 Part Treble", "3 Part Tenor/Bass"];
const FOUR_PART = ["4 Part Mixed"];
/**
 * Keys for the first three- and four-part steps: ones the class has read.
 * Not C: SSA and TBB in C failed 25-58% of the time at these ranges (the
 * dominant's root sits high - see CLAUDE.md), and a step that will not
 * generate stops a class. C and Bb come back with the new keys at step 18.
 */
const THREE_PART_KEYS = ["F", "G", "D"];

const choral = (s: Omit<ChoralStepSettings, "allowedRhythmNames"> & { allowedRhythmNames?: string[] }) => ({
  ...s,
  allowedRhythmNames: s.allowedRhythmNames ?? [...s.selectedRhythmNames, ...RESTS_1],
});

type StepDef = Omit<LadderStep, "number">;

const FOUNDATIONS = "Rhythm and first pitches";
const LINE = "Reading a single line";
const PARTS = "Two parts";
const THREE = "Three parts";
const FOUR = "Four parts";
const BEYOND = "Beyond UIL 5";

const STEPS: StepDef[] = [
  // ── Rhythm alone, then pitch from do ──────────────────────────────────────
  {
    id: "rhythm-ta-titi",
    stage: FOUNDATIONS,
    title: "Ta and ti-ti",
    newThing: "Quarter notes and eighth-note pairs, rhythm only",
    page: "unison",
    unison: {
      rhythmOnly: true,
      selectedRhythms: ["quarter", "eighthEighth"],
      selectedTimeSignature: "4/4",
      moveEighthNotes: false,
      measures: 4,
    },
  },
  {
    id: "rhythm-tuu-rest",
    stage: FOUNDATIONS,
    title: "Tu-u and the quarter rest",
    newThing: "Half notes and quarter rests, rhythm only",
    page: "unison",
    unison: {
      rhythmOnly: true,
      selectedRhythms: ["quarter", "eighthEighth", "half", "quarterRest"],
      selectedTimeSignature: "4/4",
      moveEighthNotes: false,
      measures: 4,
    },
  },
  {
    id: "pitch-do-re-mi",
    stage: FOUNDATIONS,
    title: "Do, re, mi",
    newThing: "Pitch: do-re-mi by step, on rhythms already read",
    page: "unison",
    unison: {
      rhythmOnly: false,
      selectedRhythms: ["quarter", "eighthEighth", "half"],
      selectedTimeSignature: "4/4",
      moveEighthNotes: false,
      measures: 8,
      selectedKey: "C",
      selectedScaleDegrees: [1, 2, 3],
      maxSkip: 1,
      span: [0, 2],
    },
  },
  {
    id: "pitch-fa-so",
    stage: FOUNDATIONS,
    title: "Up to so",
    newThing: "Fa and so: do to so by step",
    page: "unison",
    unison: {
      rhythmOnly: false,
      selectedRhythms: ["quarter", "eighthEighth", "half"],
      selectedTimeSignature: "4/4",
      moveEighthNotes: false,
      measures: 8,
      selectedKey: "C",
      selectedScaleDegrees: [1, 2, 3, 4, 5],
      maxSkip: 1,
      span: [0, 4],
    },
  },
  {
    id: "skips-tonic-triad",
    stage: FOUNDATIONS,
    title: "Do, mi, so",
    newThing: "First skips: the tonic triad",
    page: "unison",
    unison: {
      rhythmOnly: false,
      selectedRhythms: ["quarter", "eighthEighth", "half"],
      selectedTimeSignature: "4/4",
      moveEighthNotes: false,
      measures: 8,
      selectedKey: "C",
      selectedScaleDegrees: [1, 3, 5],
      maxSkip: 4,
      span: [0, 4],
    },
  },
  {
    id: "steps-and-skips",
    stage: LINE,
    title: "Steps and skips",
    newThing: "Steps and skips together, do to so",
    page: "unison",
    unison: {
      rhythmOnly: false,
      selectedRhythms: ["quarter", "eighthEighth", "half", "quarterRest"],
      selectedTimeSignature: "4/4",
      moveEighthNotes: false,
      measures: 8,
      selectedKey: "C",
      selectedScaleDegrees: [1, 2, 3, 4, 5],
      maxSkip: 4,
      span: [0, 4],
    },
  },
  {
    id: "meter-three",
    stage: LINE,
    title: "Three beats",
    newThing: "3/4 time and the dotted half (tu-u-u)",
    page: "unison",
    unison: {
      rhythmOnly: false,
      selectedRhythms: ["quarter", "eighthEighth", "half", "dotHalf", "quarterRest"],
      selectedTimeSignature: "3/4",
      moveEighthNotes: false,
      measures: 8,
      selectedKey: "C",
      selectedScaleDegrees: [1, 2, 3, 4, 5],
      maxSkip: 4,
      span: [0, 4],
    },
  },
  {
    id: "pitch-la-ti-do",
    stage: LINE,
    title: "La, ti, high do",
    newThing: "The whole scale up from do, new notes by step",
    page: "unison",
    unison: {
      rhythmOnly: false,
      selectedRhythms: ["quarter", "eighthEighth", "half", "dotHalf", "quarterRest"],
      selectedTimeSignature: "4/4",
      moveEighthNotes: false,
      measures: 8,
      selectedKey: "C",
      selectedScaleDegrees: [1, 2, 3, 4, 5, 6, 7],
      maxSkip: 2,
      span: [0, 7],
    },
  },
  {
    id: "pitch-below-do",
    stage: LINE,
    title: "Below do",
    newThing: "Do moves to F, so low so, la and ti appear below it",
    page: "unison",
    unison: {
      rhythmOnly: false,
      selectedRhythms: ["quarter", "eighthEighth", "half", "dotHalf", "quarterRest"],
      selectedTimeSignature: "4/4",
      moveEighthNotes: false,
      measures: 8,
      selectedKey: "F",
      selectedScaleDegrees: [1, 2, 3, 4, 5, 6, 7],
      maxSkip: 4,
      span: [-3, 4],
    },
  },
  {
    id: "rhythm-dotted-quarter",
    stage: LINE,
    title: "Ta-(i) ti",
    newThing: "The dotted quarter and eighth",
    page: "unison",
    unison: {
      rhythmOnly: false,
      selectedRhythms: ["quarter", "eighthEighth", "half", "dotHalf", "dotQuarterEighth", "quarterRest"],
      selectedTimeSignature: "4/4",
      moveEighthNotes: false,
      measures: 8,
      selectedKey: "G",
      selectedScaleDegrees: [1, 2, 3, 4, 5, 6, 7],
      maxSkip: 4,
      span: [-3, 4],
    },
  },

  // ── Parts ──────────────────────────────────────────────────────────────────
  {
    id: "parts-two",
    stage: PARTS,
    title: "Two parts",
    newThing: "A second part, opening in unison and splitting, on I, IV and V",
    page: "choral",
    choral: choral({
      level: 1,
      allowedKeys: ["C", "F", "G"],
      allowedChordNames: ["1", "4", "5"],
      selectedRhythmNames: ["quarter", "half", "eighthEighth"],
      allowedVoicings: TWO_PART,
      allowedMeters: ["4/4"],
      maxSkip: 2,
      measures: 8,
      voiceRanges: rangesOf(1),
    }),
  },
  {
    id: "parts-two-rhythms",
    stage: PARTS,
    title: "Longer notes, three beats",
    newThing: "Whole and dotted half notes in parts, and 3/4",
    uil: 1,
    page: "choral",
    choral: choral({
      level: 1,
      allowedKeys: ["C", "F", "G"],
      allowedChordNames: ["1", "4", "5"],
      selectedRhythmNames: ["quarter", "half", "dotHalf", "whole", "eighthEighth"],
      allowedVoicings: TWO_PART,
      allowedMeters: ["4/4", "3/4"],
      maxSkip: 2,
      measures: 8,
      voiceRanges: rangesOf(1),
    }),
  },
  {
    id: "parts-two-dotted",
    stage: PARTS,
    title: "Ta-(i) ti in parts",
    newThing: "The dotted quarter and eighth, against another part",
    page: "choral",
    choral: choral({
      level: 2,
      allowedKeys: ["C", "F", "G"],
      allowedChordNames: ["1", "4", "5"],
      selectedRhythmNames: ["quarter", "half", "dotHalf", "whole", "eighthEighth", "dotQuarterEighth"],
      allowedVoicings: TWO_PART,
      allowedMeters: ["4/4", "3/4"],
      maxSkip: 2,
      measures: 8,
      voiceRanges: rangesOf(2),
    }),
  },
  {
    id: "parts-v7",
    stage: PARTS,
    title: "V7 and D major",
    newThing: "The dominant seventh, and D major",
    uil: 2,
    page: "choral",
    choral: choral({
      level: 2,
      allowedKeys: ["C", "F", "G", "D"],
      allowedChordNames: ["1", "4", "5", "5-7"],
      selectedRhythmNames: ["quarter", "half", "dotHalf", "whole", "eighthEighth", "dotQuarterEighth"],
      allowedVoicings: TWO_PART,
      allowedMeters: ["4/4", "3/4"],
      maxSkip: 3,
      measures: 8,
      voiceRanges: rangesOf(2),
    }),
  },
  {
    id: "parts-three",
    stage: THREE,
    title: "Three parts",
    newThing: "A third part, on I, IV, V and V7",
    page: "choral",
    choral: choral({
      level: 3,
      // And not D yet: on I, IV, V and V7 alone, SSA in D failed 17% of the
      // time; with ii and vi to use (the next step) it does not.
      allowedKeys: ["F", "G"],
      allowedChordNames: ["1", "4", "5", "5-7"],
      selectedRhythmNames: ["quarter", "half", "dotHalf", "whole", "eighthEighth", "dotQuarterEighth"],
      allowedVoicings: THREE_PART,
      allowedMeters: ["4/4", "3/4"],
      maxSkip: 3,
      measures: 8,
      voiceRanges: rangesOf(3),
    }),
  },
  {
    id: "parts-ii-vi",
    stage: THREE,
    title: "ii and vi",
    newThing: "The supertonic and submediant",
    page: "choral",
    choral: choral({
      level: 3,
      allowedKeys: THREE_PART_KEYS,
      allowedChordNames: ["1", "2", "4", "5", "6", "5-7"],
      selectedRhythmNames: ["quarter", "half", "dotHalf", "whole", "eighthEighth", "dotQuarterEighth"],
      allowedVoicings: THREE_PART,
      allowedMeters: ["4/4", "3/4"],
      maxSkip: 3,
      measures: 8,
      voiceRanges: rangesOf(3),
    }),
  },
  {
    id: "parts-four",
    stage: FOUR,
    title: "Four parts",
    newThing: "SATB, on harmony already read in three parts",
    uil: 3,
    page: "choral",
    choral: choral({
      level: 3,
      allowedKeys: THREE_PART_KEYS,
      allowedChordNames: ["1", "2", "4", "5", "6", "5-7"],
      selectedRhythmNames: ["quarter", "half", "dotHalf", "whole", "eighthEighth", "dotQuarterEighth"],
      allowedVoicings: FOUR_PART,
      allowedMeters: ["4/4", "3/4"],
      maxSkip: 4,
      measures: 8,
      voiceRanges: rangesOf(3),
    }),
  },
  {
    id: "keys-three-accidentals",
    stage: FOUR,
    title: "More keys",
    newThing: "More keys: Bb, A, Eb and Ab, up to three sharps or flats",
    page: "choral",
    choral: choral({
      level: 4,
      allowedKeys: ["Ab", "Eb", "Bb", "F", "C", "G", "D", "A"],
      allowedChordNames: ["1", "2", "4", "5", "6", "5-7"],
      selectedRhythmNames: ["quarter", "half", "dotHalf", "whole", "eighthEighth", "dotQuarterEighth", "dotHalfQuarter"],
      allowedVoicings: [...FOUR_PART, ...THREE_PART],
      allowedMeters: ["4/4", "3/4"],
      maxSkip: 4,
      measures: 8,
      voiceRanges: rangesOf(4),
    }),
  },
  {
    id: "harmony-secondary-dominants",
    stage: FOUR,
    title: "Secondary dominants",
    newThing: "V/V, V/vi and V/ii: the first chromatic notes",
    uil: 4,
    page: "choral",
    choral: choral({
      ...pick(U["UIL 4"]),
      level: 4,
      selectedRhythmNames: ["quarter", "half", "dotHalf", "whole", "eighthEighth", "dotQuarterEighth", "dotHalfQuarter"],
      allowedRhythmNames: U["UIL 4"].allowedRhythmNames,
      measures: 8,
    }),
  },
  {
    id: "keys-minor",
    stage: FOUR,
    title: "Minor keys",
    newThing: "Minor mode, with the raised leading tone",
    page: "choral",
    choral: choral({
      level: 5,
      allowedKeys: ["Am", "Em", "Dm", "Gm", "Bm", "Cm"],
      allowedChordNames: ["m_i", "m_iv", "m_V", "m_V7", "m_VI", "m_iid", "m_III", "m_VII", "m_viid", "m_i6"],
      selectedRhythmNames: ["quarter", "half", "dotHalf", "whole", "eighthEighth", "dotQuarterEighth", "dotHalfQuarter"],
      allowedRhythmNames: U["UIL 4"].allowedRhythmNames,
      allowedVoicings: [...FOUR_PART, ...THREE_PART],
      allowedMeters: ["4/4", "3/4"],
      maxSkip: 5,
      measures: 8,
      voiceRanges: rangesOf(5),
    }),
  },
  {
    id: "rhythm-sixteenths",
    stage: FOUR,
    title: "Ti-ki-ti-ki",
    newThing: "Four sixteenths, and 2/4: all of UIL 5",
    uil: 5,
    page: "choral",
    choral: choral({
      ...pick(U["UIL 5"]),
      level: 5,
      selectedRhythmNames: ["quarter", "half", "dotHalf", "whole", "eighthEighth", "dotQuarterEighth", "dotHalfQuarter", "fourSixteenths"],
      allowedRhythmNames: U["UIL 5"].allowedRhythmNames,
      measures: 8,
    }),
  },

  // ── Past the contest ────────────────────────────────────────────────────────
  {
    id: "rhythm-syncopation",
    stage: BEYOND,
    title: "Syncopation",
    newThing: "Syn-co-pa, and the reversed dots: ti ti-a and tim-ri",
    page: "choral",
    choral: choral({
      ...pick(U["UIL 5"]),
      level: 5,
      selectedRhythmNames: [
        "quarter", "half", "dotHalf", "whole", "eighthEighth", "dotQuarterEighth",
        "dotHalfQuarter", "eighthQuarterEighth", "eighthDotQuarter", "dotEighthSixteenth",
      ],
      allowedRhythmNames: [
        ...U["UIL 5"].allowedRhythmNames,
        "eighthQuarterEighth", "eighthDotQuarter", "dotEighthSixteenth",
      ],
      measures: 8,
    }),
  },
  {
    id: "parts-staggered",
    stage: BEYOND,
    title: "Staggered entrances",
    newThing: "Parts entering one at a time: reading your line against moving ones",
    page: "choral",
    choral: choral({
      ...pick(U["UIL 5"]),
      level: 5,
      selectedRhythmNames: ["quarter", "half", "dotHalf", "whole", "eighthEighth", "dotQuarterEighth", "dotHalfQuarter"],
      allowedRhythmNames: U["UIL 5"].allowedRhythmNames,
      voiceTexture: "staggered",
      measures: 8,
    }),
  },
];

/** A UIL level's fields a choral step can take whole. */
function pick(p: UILPreset) {
  const { allowedKeys, allowedChordNames, allowedVoicings, allowedMeters, maxSkip, voiceRanges } = p;
  return { allowedKeys, allowedChordNames, allowedVoicings, allowedMeters, maxSkip, voiceRanges };
}

export const ladder: LadderStep[] = STEPS.map((s, i) => ({ ...s, number: i + 1 }));

export const ladderById: Record<string, LadderStep> = Object.fromEntries(
  ladder.map((s) => [s.id, s])
);

/** "Step 3 · Do, re, mi" - what the preset bar calls an active step. */
export const stepLabel = (s: LadderStep) => `Step ${s.number} · ${s.title}`;

/** The stages in order, each with its steps. */
export function ladderStages(): { stage: string; steps: LadderStep[] }[] {
  const out: { stage: string; steps: LadderStep[] }[] = [];
  for (const s of ladder) {
    const last = out[out.length - 1];
    if (last?.stage === s.stage) last.steps.push(s);
    else out.push({ stage: s.stage, steps: [s] });
  }
  return out;
}

/**
 * The range a pitched unison step reads in: its span around do, with do the
 * lowest tonic at or above the bottom of the class's current range. Indices
 * are noteArray's, which count scale steps (C=0, D=1 ... seven to the octave),
 * so a key's tonic sits at every index whose remainder is its letter.
 */
export function rangeForStep(
  u: UnisonStepSettings,
  current: { min: number; max: number }
): { min: number; max: number } | null {
  if (!u.span || !u.selectedKey) return null;
  const letter = keySignatures[u.selectedKey]?.rootOffset;
  if (letter === undefined) return null;
  let doIndex = current.min;
  while (((doIndex % 7) + 7) % 7 !== letter) doIndex++;
  const [below, above] = u.span;
  return { min: Math.max(0, doIndex + below), max: doIndex + above };
}

/** The query parameter a page reads to open on a step: /sightreading?step=<id>. */
export const STEP_PARAM = "step";

/** Where a step is read, with the step to load. */
export const stepHref = (s: LadderStep) =>
  `${s.page === "unison" ? "/sightreading" : "/choral-sightreading"}?${STEP_PARAM}=${encodeURIComponent(s.id)}`;
