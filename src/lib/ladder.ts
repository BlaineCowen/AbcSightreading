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
  /** A pool of meters, one drawn per exercise; without it, the one meter. */
  meters?: string[];
  /** Pitched steps: a pool of keys, one drawn per exercise; without it, `selectedKey`. */
  keys?: string[];
  bpm?: number;
  /** Write the line over a chord progression (the page's option). */
  progressions?: boolean;
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
  /** Half of a pair on the single line: the rhythm drill or the sung exercise. */
  part?: "rhythm" | "notes";
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

/**
 * The single line, as pairs (Blaine, 7 October 2026, as the band tracks):
 * each step is a rhythm drill that brings in one figure, spoken on Kodály
 * syllables, and a sung exercise that brings in new notes on rhythms learned
 * at least RHYTHM_LEAD steps before - so the class has spoken a rhythm twice
 * before any new note is put on it. The rhythm runs out at step 10; the notes
 * catch up in 11.
 */
const RHYTHM_LEAD = 2;

const RHYTHMS: { title: string; newThing: string; add: string[]; meter?: string }[] = [
  { title: "Ta and ti-ti", newThing: "Quarter notes and eighth-note pairs", add: ["quarter", "eighthEighth"], meter: "4/4" },
  { title: "Ta rest", newThing: "The quarter rest", add: ["quarterRest"] },
  { title: "Ta-a", newThing: "The half note", add: ["half"] },
  { title: "Three beats", newThing: "3/4 time and the dotted half (ta-a-a)", add: ["dotHalf"], meter: "3/4" },
  { title: "Whole notes", newThing: "The whole note, and half and whole rests", add: ["whole", "halfRest", "wholeRest"] },
  { title: "Ta-(i) ti", newThing: "The dotted quarter and eighth", add: ["dotQuarterEighth"] },
  { title: "Syncopa", newThing: "Ti ta ti: eighth, quarter, eighth", add: ["eighthQuarterEighth"] },
  { title: "Tika-tika", newThing: "Four sixteenths", add: ["fourSixteenths"] },
  { title: "Ti-tika, tika-ti", newThing: "An eighth and two sixteenths, and the other way round", add: ["eighthSixteenthSixteenth", "sixteenthSixteenthEighth"] },
  { title: "Two beats", newThing: "2/4 time", add: [], meter: "2/4" },
  { title: "Every rhythm", newThing: "All the rhythms so far, in every meter", add: [] },
];

const SCALE = [1, 2, 3, 4, 5, 6, 7];
const NOTES: Record<number, { title: string; newThing: string; key: string; degrees: number[]; span: [number, number]; maxSkip: number; keys?: string[] }> = {
  3: { title: "Do, re, mi", newThing: "Do-re-mi by step", key: "C", degrees: [1, 2, 3], span: [0, 2], maxSkip: 1 },
  4: { title: "Up to so", newThing: "Fa and so: do to so by step", key: "C", degrees: [1, 2, 3, 4, 5], span: [0, 4], maxSkip: 1 },
  5: { title: "Do, mi, so", newThing: "First skips: the tonic triad", key: "C", degrees: [1, 3, 5], span: [0, 4], maxSkip: 2 },
  6: { title: "Steps and skips", newThing: "Steps and skips together, do to so", key: "C", degrees: [1, 2, 3, 4, 5], span: [0, 4], maxSkip: 2 },
  7: { title: "La, ti, high do", newThing: "The whole scale up from do, new notes by step", key: "C", degrees: SCALE, span: [0, 7], maxSkip: 2 },
  8: { title: "F major", newThing: "A new key: do moves to F", key: "F", degrees: SCALE, span: [0, 7], maxSkip: 2 },
  9: { title: "Below do", newThing: "Low so, la and ti, below do", key: "F", degrees: SCALE, span: [-3, 4], maxSkip: 2 },
  10: { title: "G major", newThing: "A new key: do moves to G", key: "G", degrees: SCALE, span: [-3, 4], maxSkip: 2 },
  11: { title: "Fourths and fifths", newThing: "Wider skips, in C, F and G", key: "C", keys: ["C", "F", "G"], degrees: SCALE, span: [-3, 5], maxSkip: 4 },
};

const known = (n: number) => RHYTHMS.slice(0, Math.max(0, n)).flatMap((r) => r.add);
const meterAt = (n: number) => RHYTHMS[n - 1]?.meter ?? "4/4";
const bpmAt = (n: number) => (n <= 4 ? 60 : n <= 8 ? 66 : 72);

function unisonPair(n: number): StepDef[] {
  const r = RHYTHMS[n - 1];
  const stage = n <= 5 ? FOUNDATIONS : LINE;
  const pad = String(n).padStart(2, "0");
  const out: StepDef[] = [{
    id: `sbs-${pad}-rhythm`,
    stage,
    part: "rhythm",
    title: r.title,
    newThing: r.newThing,
    page: "unison",
    unison: {
      rhythmOnly: true,
      selectedRhythms: known(n),
      selectedTimeSignature: n === RHYTHMS.length ? "4/4" : meterAt(n),
      meters: n === RHYTHMS.length ? ["4/4", "3/4", "2/4"] : undefined,
      measures: n <= 2 ? 4 : 8,
      moveEighthNotes: true,
      bpm: bpmAt(n),
    },
  }];
  const t = NOTES[n];
  if (t) {
    const from = n - RHYTHM_LEAD;
    out.push({
      id: `sbs-${pad}-notes`,
      stage,
      part: "notes",
      title: t.title,
      newThing: t.newThing,
      page: "unison",
      unison: {
        rhythmOnly: false,
        selectedRhythms: known(from),
        // The meter its rhythms were spoken in, RHYTHM_LEAD steps before.
        selectedTimeSignature: meterAt(from),
        measures: 8,
        moveEighthNotes: true,
        bpm: bpmAt(n),
        selectedKey: t.key,
        keys: t.keys,
        selectedScaleDegrees: t.degrees,
        maxSkip: t.maxSkip,
        span: t.span,
        // A line that only steps, over a progression's chords, got stuck on two notes (curriculum tracks).
        progressions: t.maxSkip > 1,
      },
    });
  }
  return out;
}

/** The first steps' old ids (one exercise a step, before the pairs): links, assignments and old progress open the nearest step. */
export const RETIRED_STEPS: Record<string, string> = {
  "rhythm-ta-titi": "sbs-01-rhythm",
  "rhythm-tuu-rest": "sbs-03-rhythm",
  "pitch-do-re-mi": "sbs-03-notes",
  "pitch-fa-so": "sbs-04-notes",
  "skips-tonic-triad": "sbs-05-notes",
  "steps-and-skips": "sbs-06-notes",
  "meter-three": "sbs-04-rhythm",
  "pitch-la-ti-do": "sbs-07-notes",
  "pitch-below-do": "sbs-09-notes",
  "rhythm-dotted-quarter": "sbs-06-rhythm",
};

const STEPS: StepDef[] = [
  // ── The single line: rhythm drills, and sung exercises two steps behind ────
  ...RHYTHMS.flatMap((_, i) => unisonPair(i + 1)),

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
      selectedRhythmNames: ["quarter", "half", "dotHalf", "whole", "eighthEighth", "dotQuarterEighth"],
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
    // UIL keeps altered tones for Level 5 (fi, si, di, te); Level 4 has none.
    uil: 5,
    page: "choral",
    choral: choral({
      ...pick(U["UIL 4"]),
      allowedChordNames: U["UIL 5"].allowedChordNames,
      level: 4,
      selectedRhythmNames: ["quarter", "half", "dotHalf", "whole", "eighthEighth", "dotQuarterEighth"],
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
      selectedRhythmNames: ["quarter", "half", "dotHalf", "whole", "eighthEighth", "dotQuarterEighth"],
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
    // Past UIL: Level 5 allows only an occasional dotted eighth and sixteenth
    // ("other sixteenth note patterns and triplets are forbidden").
    newThing: "Four sixteenths, and 2/4",
    uil: 5,
    page: "choral",
    choral: choral({
      ...pick(U["UIL 5"]),
      level: 5,
      selectedRhythmNames: ["quarter", "half", "dotHalf", "whole", "eighthEighth", "dotQuarterEighth", "fourSixteenths"],
      allowedRhythmNames: [...U["UIL 5"].allowedRhythmNames, "fourSixteenths"],
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
        "eighthQuarterEighth", "eighthDotQuarter", "dotEighthSixteenth",
      ],
      allowedRhythmNames: [
        ...new Set([...U["UIL 5"].allowedRhythmNames, "eighthQuarterEighth", "eighthDotQuarter", "dotEighthSixteenth"]),
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
      selectedRhythmNames: ["quarter", "half", "dotHalf", "whole", "eighthEighth", "dotQuarterEighth"],
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

/** Numbered in order, the two halves of a pair sharing their number. */
export const ladder: LadderStep[] = (() => {
  let n = 0;
  let pair = "";
  return STEPS.map((s) => {
    const key = s.part ? s.id.replace(/-(rhythm|notes)$/, "") : s.id;
    if (key !== pair) { n++; pair = key; }
    return { ...s, number: n };
  });
})();

/** How many steps there are: a pair is one step. */
export const STEP_COUNT = ladder[ladder.length - 1].number;

/** By id, the retired ids (RETIRED_STEPS) leading to the steps that replaced them. */
export const ladderById: Record<string, LadderStep> = (() => {
  const byId: Record<string, LadderStep> = Object.fromEntries(ladder.map((s) => [s.id, s]));
  for (const [old, now] of Object.entries(RETIRED_STEPS)) byId[old] = byId[now];
  return byId;
})();

/** A step's title, naming its half of a pair: "Notes: Do, re, mi". */
export const stepTitle = (s: LadderStep) =>
  `${s.part ? `${s.part === "rhythm" ? "Rhythm" : "Notes"}: ` : ""}${s.title}`;

/** "Step 3 · Notes: Do, re, mi" - what the preset bar calls an active step. */
export const stepLabel = (s: LadderStep) =>
  `Step ${s.number} · ${s.part ? `${s.part === "rhythm" ? "Rhythm" : "Notes"}: ` : ""}${s.title}`;

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
 * A span of scale steps around do, placed on the first do at or above
 * `anchorMin` - so the clef and octave stay the class's. Used for a ladder
 * step, and for a NYSSMA level each time a key is drawn: always from the same
 * anchor, never from the last placement, or the range would creep.
 */
export function rangeForSpan(
  span: [below: number, above: number],
  key: string,
  anchorMin: number
): { min: number; max: number } | null {
  const letter = keySignatures[key]?.rootOffset;
  if (letter === undefined) return null;
  let doIndex = anchorMin;
  while (((doIndex % 7) + 7) % 7 !== letter) doIndex++;
  const [below, above] = span;
  return { min: Math.max(0, doIndex + below), max: doIndex + above };
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
  return rangeForSpan(u.span, u.selectedKey, current.min);
}

/** The query parameter a page reads to open on a step: /sightreading?step=<id>. */
export const STEP_PARAM = "step";

/** Where a step is read, with the step to load. */
export const stepHref = (s: LadderStep) =>
  `${s.page === "unison" ? "/sightreading" : "/choral-sightreading"}?${STEP_PARAM}=${encodeURIComponent(s.id)}`;
