/**
 * The meters an exercise can be written in, and what a beat is in each - the
 * one source of truth for meter. Units are 32nds (L:1/32), as everywhere else.
 *
 * Grown out of the metronome's table (tuner/meters.ts), which already counted
 * 6/8, 9/8 and 12/8 in dotted-quarter beats: one model, not two. A meter is
 * counted in beats, not by its top number - 6/8 is two beats of three eighths,
 * 12/8 four - and 3/4 and 6/8 are both 24 units a bar, so nothing may tell
 * meters apart by bar length. Ask this module.
 */
import { METERS, type BeatNote } from "./tuner/meters";

export type MeterKind = "simple" | "compound";

export interface ExerciseMeter {
  name: string;
  /** One beat, in 32nds: 8 (quarter) in simple meter, 12 (dotted quarter) in compound. */
  beatUnits: number;
  beatsPerMeasure: number;
  /** Eighths to a beat: 2 in simple meter, 3 in compound. */
  subdivision: 2 | 3;
  tsPerMeasure: number;
  kind: MeterKind;
}

/** What the generators are handed: the shape of `TimeSignature` in types.ts. */
export interface ExerciseTimeSignature {
  name: string;
  tsPerMeasure: number;
  beatUnits: number;
}

/**
 * A meter by name, or a time signature object. Objects from before the beat
 * was stored as `beatUnits` carried `beamGroupSize`; both are still read when
 * the name is not one this model knows.
 */
export type MeterRef =
  | string
  | { name: string; tsPerMeasure?: number; beatUnits?: number; beamGroupSize?: number };

const BEAT_UNITS: Record<BeatNote, number> = { half: 16, quarter: 8, dottedQuarter: 12, eighth: 4 };

function fromMetronomeMeter(name: string): ExerciseMeter | undefined {
  const m = METERS.find((x) => x.id === name);
  if (!m) return undefined;
  const beatUnits = BEAT_UNITS[m.beatNote];
  const compound = m.kind === "compound";
  return {
    name: m.id,
    beatUnits,
    beatsPerMeasure: m.beats,
    subdivision: compound ? 3 : 2,
    tsPerMeasure: m.beats * beatUnits,
    kind: compound ? "compound" : "simple",
  };
}

/** The meters an exercise is offered in, in picker order: simple, then compound. */
export const EXERCISE_METER_NAMES = ["2/4", "3/4", "4/4", "6/8", "9/8", "12/8"] as const;

export const EXERCISE_METERS: ExerciseMeter[] = EXERCISE_METER_NAMES.map((name) => {
  const m = fromMetronomeMeter(name);
  if (!m) throw new Error(`The metronome has no ${name}.`);
  return m;
});

export const SIMPLE_METER_NAMES: string[] = EXERCISE_METERS.filter((m) => m.kind === "simple").map((m) => m.name);
export const COMPOUND_METER_NAMES: string[] = EXERCISE_METERS.filter((m) => m.kind === "compound").map((m) => m.name);

export function meterByName(name: string): ExerciseMeter | undefined {
  return EXERCISE_METERS.find((m) => m.name === name);
}

/**
 * Any meter, as the model reads it. Exercise meters come from the table; the
 * metronome's others (5/4, 7/8...) from its table; anything else from the
 * object's own fields, then the meter's numbers, then 4/4. Never throws: a
 * count-in or a click must still work on a score from somewhere else.
 */
export function resolveMeter(ref: MeterRef): ExerciseMeter {
  const name = typeof ref === "string" ? ref : ref.name;
  const known = meterByName(name) ?? fromMetronomeMeter(name);
  if (known) return known;
  const obj = typeof ref === "string" ? undefined : ref;
  const [top, bottom] = name.split("/").map((n) => parseInt(n, 10));
  const unitOfBottom = bottom > 0 ? 32 / bottom : 8;
  const beatUnits = obj?.beatUnits ?? obj?.beamGroupSize ?? unitOfBottom;
  const tsPerMeasure = obj?.tsPerMeasure ?? (top > 0 ? top * unitOfBottom : 4 * beatUnits);
  const compound = beatUnits === 12;
  return {
    name,
    beatUnits,
    beatsPerMeasure: Math.max(1, Math.round(tsPerMeasure / beatUnits)),
    subdivision: compound ? 3 : 2,
    tsPerMeasure,
    kind: compound ? "compound" : "simple",
  };
}

export const beatsOf = (ref: MeterRef): number => resolveMeter(ref).beatsPerMeasure;
export const beatUnitOf = (ref: MeterRef): number => resolveMeter(ref).beatUnits;
export const isCompound = (ref: MeterRef): boolean => resolveMeter(ref).kind === "compound";
export const meterKindOf = (ref: MeterRef): MeterKind => resolveMeter(ref).kind;

export function timeSignatureFor(name: string): ExerciseTimeSignature {
  const m = meterByName(name);
  if (!m) throw new Error(`"${name}" is not a meter exercises are written in.`);
  return { name: m.name, tsPerMeasure: m.tsPerMeasure, beatUnits: m.beatUnits };
}

/** A picker's table, in the order the names are given. */
export function timeSignaturesFor(names: readonly string[]): Record<string, ExerciseTimeSignature> {
  return Object.fromEntries(names.map((n) => [n, timeSignatureFor(n)]));
}

/**
 * The ABC tempo field. Compound meter counts dotted quarters, Q:3/8=60, which
 * is how abcjs and every other reader takes "60" to mean the beat. The bpm is
 * written as given - callers round where they need to.
 */
export function tempoField(ref: MeterRef, bpm: number): string {
  return `Q:${isCompound(ref) ? "3/8" : "1/4"}=${bpm}`;
}

/** The note the tempo counts: ♩. in compound meter, ♩ in simple. */
export const beatSymbolOf = (ref: MeterRef): "♩." | "♩" => (isCompound(ref) ? "♩." : "♩");
