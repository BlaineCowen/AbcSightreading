/**
 * TMEA All-State Voice sight-reading levels I-IV: the "Path to All-State"
 * audition rounds (Texas Music Educators Association, "Sightreading Levels",
 * updated 21 July 2025; https://www.tmea.org/wp-content/uploads/Region_Admin/
 * Sightreading/Vocal_Sightreading_Levels_2025.pdf). Unison presets, like the
 * NYSSMA levels (nyssma-presets.ts), and a set a teacher subscribes to
 * (curriculum/catalogue.ts).
 *
 *   I    HS District round, or honor choir: 2/4, 4/4; intervals to a 4th
 *   II   HS Region round: + 3/4; intervals to a 5th
 *   III  HS Pre-Area round: + 6/8; any interval to an octave; + dotted
 *        eighths, sixteenths, simple syncopation, tied notes
 *   IV   HS Area round (selection to All-State): + fi and si (raised 4th
 *        and 5th)
 *
 * Unlike NYSSMA, the chart sets the keys and the range per voice part, so a
 * level is four presets: Soprano, Alto, Tenor, Bass. The first measure is all
 * quarter notes (all eighths in 6/8), and the length follows the meter.
 * Tied notes are left off: Blaine has never seen them used in an audition.
 * Matches what Sight Reading Factory's Texas All-State levels write (checked
 * 8 October 2026, levels 1, 3 and 4, soprano).
 */
import { ALL_LAND_ON, policyFor, type SkipSettings } from "./skip-settings";
import { capsFor } from "./short-note-skips";
import { meterKindOf, timeSignatureFor } from "./meter";
import { selectableCompoundRhythms, selectableRhythms } from "./selectable-rhythms";

export type TmeaPart = "Soprano" | "Alto" | "Tenor" | "Bass";

export interface TmeaLevel {
  /** Stable: stored as the active level and in class progress. Never rename. */
  id: string;
  label: string;
  short: string;
  summary: string;
  level: 1 | 2 | 3 | 4;
  part: TmeaPart;
  keys: string[];
  /** Every meter the round may use; simple and 6/8 together from Level III. */
  meters: string[];
  /** Bars by meter (the chart's lengths). */
  measuresByMeter: Record<string, number>;
  /** The written range, noteArray indices (14 is middle C). */
  range: { min: number; max: number };
  clef: "treble" | "treble-8" | "bass";
  /** Simple-meter figures, and 6/8's. */
  rhythms: string[];
  compoundRhythms: string[];
  /** Largest interval, in diatonic steps (3 a 4th, 4 a 5th, 7 an octave). */
  maxSkip: number;
  /** Raised degrees (1-based): Level IV's fi and si. */
  sharpDegrees: number[];
  bpm: number;
}

// noteArray indices: C2 0, C3 7, C4 14, C5 21, C6 28.
const N = { G2: 4, C3: 7, D3: 8, E3: 9, G3: 11, A3: 12, C4: 14, D4: 15, E4: 16, G4: 18, D5: 22, E5: 23, G5: 25 };

const KEYS: Record<1 | 2 | 3 | 4, Record<TmeaPart, string[]>> = {
  1: { Soprano: ["F", "G"], Alto: ["C", "D"], Tenor: ["F", "G"], Bass: ["C", "D"] },
  2: { Soprano: ["E", "F", "G"], Alto: ["C", "D", "Eb"], Tenor: ["E", "F", "G"], Bass: ["C", "D", "Eb"] },
  3: { Soprano: ["Eb", "E", "F", "G"], Alto: ["Bb", "C", "D", "Eb"], Tenor: ["Eb", "E", "F", "G"], Bass: ["Bb", "C", "D", "Eb"] },
  4: { Soprano: ["Eb", "E", "F", "G"], Alto: ["Bb", "C", "D", "Eb"], Tenor: ["Eb", "E", "F", "G"], Bass: ["Bb", "C", "D", "Eb"] },
};
// Levels I-II: Alto A3-D5, Tenor E3-G4, Bass G2-D4; III-IV: Alto to Eb5, Tenor from D3, Bass to Eb4
// (E in the index: the key's flat spells it). Soprano C4-G5 throughout.
const RANGES: Record<"low" | "high", Record<TmeaPart, { min: number; max: number }>> = {
  low: { Soprano: { min: N.C4, max: N.G5 }, Alto: { min: N.A3, max: N.D5 }, Tenor: { min: N.E3, max: N.G4 }, Bass: { min: N.G2, max: N.D4 } },
  high: { Soprano: { min: N.C4, max: N.G5 }, Alto: { min: N.A3, max: N.E5 }, Tenor: { min: N.D3, max: N.G4 }, Bass: { min: N.G2, max: N.E4 } },
};
const CLEF: Record<TmeaPart, TmeaLevel["clef"]> = { Soprano: "treble", Alto: "treble", Tenor: "treble-8", Bass: "bass" };

// Whole, half, quarter, eighth notes, dotted quarters, dotted halves, quarter and eighth rests.
const RHYTHMS_I = ["whole", "half", "quarter", "eighthEighth", "dotQuarterEighth", "dotHalf", "quarterRest", "eighthRestEighth"];
// + dotted eighths, sixteenths, simple syncopation.
const RHYTHMS_III = [...RHYTHMS_I, "dotEighthSixteenth", "fourSixteenths", "eighthSixteenthSixteenth", "sixteenthSixteenthEighth", "eighthQuarterEighth"];
const COMPOUND_III = [
  "dotQuarter", "dotHalfCompound", "threeEighths", "quarterEighth", "eighthQuarter", "quarterEighthRest",
  "sixSixteenths", "twoSixteenthsTwoEighths", "eighthTwoSixteenthsEighth", "twoEighthsTwoSixteenths", "quarterTwoSixteenths",
];

const ROUND: Record<1 | 2 | 3 | 4, string> = {
  1: "HS District round",
  2: "HS Region round",
  3: "HS Pre-Area round",
  4: "HS Area round",
};
const ROMAN = ["I", "II", "III", "IV"];

function level(n: 1 | 2 | 3 | 4, part: TmeaPart): TmeaLevel {
  const upper = n >= 3;
  const meters = n === 1 ? ["4/4", "2/4"] : n === 2 ? ["4/4", "3/4", "2/4"] : ["4/4", "3/4", "2/4", "6/8"];
  // The chart: about 8-12 bars of 2/4 and 8 of 4/4 at I-II (3/4, unstated at II, like 2/4);
  // about 16 of 2/4, 12 of 3/4, 8 of 4/4 and 6/8 at III-IV.
  const measuresByMeter: Record<string, number> = upper
    ? { "2/4": 16, "3/4": 12, "4/4": 8, "6/8": 8 }
    : { "2/4": 12, "3/4": 12, "4/4": 8 };
  const keys = KEYS[n][part];
  return {
    id: `tmea-voice-${n}-${part.toLowerCase()}`,
    label: `TMEA All-State Level ${ROMAN[n - 1]} · ${part}`,
    short: `Level ${ROMAN[n - 1]} · ${part}`,
    summary: `${ROUND[n]} · ${keys.join(", ")} · ${meters.join(", ")} · ${n === 1 ? "to a 4th" : n === 2 ? "to a 5th" : "to an octave"}${n === 4 ? " · fi, si" : ""}`,
    level: n,
    part,
    keys,
    meters,
    measuresByMeter,
    range: { ...RANGES[upper ? "high" : "low"][part] },
    clef: CLEF[part],
    rhythms: upper ? RHYTHMS_III : RHYTHMS_I,
    compoundRhythms: upper ? COMPOUND_III : [],
    maxSkip: n === 1 ? 3 : n === 2 ? 4 : 7,
    sharpDegrees: n === 4 ? [4, 5] : [],
    bpm: 72,
  };
}

const PARTS: TmeaPart[] = ["Soprano", "Alto", "Tenor", "Bass"];
export const tmeaVoiceLevels: TmeaLevel[] = ([1, 2, 3, 4] as const).flatMap((n) => PARTS.map((p) => level(n, p)));
export const tmeaById: Record<string, TmeaLevel> = Object.fromEntries(tmeaVoiceLevels.map((l) => [l.id, l]));

/** Max skip, not a list of skips: the chart gives a largest interval. */
export const tmeaSkips = (): SkipSettings => ({ exactOn: false, patterns: [], extraSkips: [], landOn: [...ALL_LAND_ON] });

/** The level's length in a meter. */
export const tmeaMeasures = (l: TmeaLevel, meter: string): number => l.measuresByMeter[meter] ?? 8;

/**
 * What the Unison page sends createNewSr for this level, in one key and
 * meter - for the scripts and tests, so they generate what the page does.
 */
export function tmeaGenerationParams(l: TmeaLevel, opts: { key: string; meter: string }): Record<string, unknown> {
  const compound = meterKindOf(opts.meter) === "compound";
  const names = compound ? l.compoundRhythms : l.rhythms;
  const pool = compound ? selectableCompoundRhythms : selectableRhythms;
  return {
    bpm: l.bpm, tempo: l.bpm, clef: l.clef, selectedClef: l.clef,
    timeSig: timeSignatureFor(opts.meter), selectedTimeSignature: opts.meter,
    measures: tmeaMeasures(l, opts.meter),
    maxSkip: policyFor(l.maxSkip, tmeaSkips()),
    range: { ...l.range },
    rhythms: pool.filter((r) => names.includes(r.name)),
    selectedRhythms: names,
    scaleDegrees: [1, 2, 3, 4, 5, 6, 7], selectedSharpDegrees: l.sharpDegrees, selectedFlatDegrees: [],
    key: opts.key, showSolfege: true, lyricSystem: "movable", rhythmOnly: false,
    showRhythmSyllables: true, syllableSystemId: "kodaly",
    allowTiesAcrossBarline: false,
    firstBarBeats: true,
    // The chart's largest interval is the one sung, across a rest too.
    restHoldsLine: true,
    ...capsFor({ onePitch: false }),
    accidentalsFollowStep: true,
    dynamics: [],
    partsObject: { numofParts: 1, parts: { Unison: { order: 0, smallName: "U" } } },
  };
}
