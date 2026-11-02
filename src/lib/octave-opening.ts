import type { VoiceNote } from "./types";
import { noteArray } from "../resources/noteArray";

/**
 * Four parts open on the tune in octaves, then split (Blaine, 23 October
 * 2026). "Our Hero" opens that way: soprano and alto on the tune, tenor and
 * bass on it an octave down, for the pickup and the first two beats. Written
 * one chord at a time the parts never met like that: tenor and bass shared a
 * note 1% of the time against his 11%.
 *
 * The part writer does it (part-writer `octaveOpening`): over the opening
 * every part takes the tune's note, in unison or an octave below, and the
 * parts leave it by the writer's own rules, so each joins its line as any
 * other note would. Copying the tune in afterwards was tried first and almost
 * never fitted at UIL 1: the parts' own lines were a fourth or more from where
 * the tune left them, and the level skips a third at most.
 *
 * The calibrated ranges cannot hold it: at UIL 1 the tenor's lowest note is
 * A3, so the tune on do in F (F4) needs F3 an octave down. Blaine agreed to the
 * tenors going lower for the opening only (`TENOR_REACH`); every other note
 * keeps the ranges as set. The notes are marked `doubled`, which decoration,
 * the dotted figure in one part and the restatement's varied note leave alone,
 * and which parallel-check does not count.
 */

/** How far below their lowest note the tenors may go for the opening, in diatonic steps. */
export const TENOR_REACH = 2;

/** How likely SATB at a UIL level is to open in octaves: the lower levels as "Our Hero" does, the upper ones now and then. */
export function octaveOpeningProbabilityFor(level: number | null | undefined): number {
  if (!level) return 0;
  return level <= 3 ? 0.5 : 0.25;
}

/**
 * How long the opening is, in 32nds: the first bar, or its first half (Our
 * Hero's split, on beat 3). 0 for no opening.
 */
export function octaveOpeningSpan(tsPerMeasure: number, probability: number, random: () => number = Math.random): number {
  if (probability <= 0 || random() >= probability) return 0;
  return tsPerMeasure === 32 && random() < 0.5 ? 16 : tsPerMeasure;
}

/** The note `steps` diatonic steps from `n` (an octave is 7), spelled with its accidental. */
export function octaveFrom(n: VoiceNote, steps: number): VoiceNote | null {
  const pitchValue = n.pitchValue + steps;
  const base = noteArray[pitchValue];
  if (!base) return null;
  const prefix = /^[\^_=]*/.exec(n.name)?.[0] ?? "";
  return { ...n, pitchValue, name: prefix + base };
}
