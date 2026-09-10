import type { Note, VoiceNote } from "./types";

/**
 * A leap wants a step after it.
 *
 * The unspoken rule of singable line writing: once a voice jumps, the next note
 * should come back under control - the same note, or a step. Two leaps in a row
 * leave the singer with no reference for the second one, which is what makes a
 * part feel unsingable even when every individual interval is legal.
 *
 * `pitchValue` is a DIATONIC index, not semitones: a difference of 1 is a 2nd,
 * 2 is a 3rd, 3 is a 4th. A 3rd is a skip and needs no recovery - it outlines
 * the chord and the ear follows it. A 4th or wider is a leap.
 */
export const LEAP_INTERVAL = 3;

/** Diatonic distance between two pitches. */
export const diatonicGap = (a: number, b: number) => Math.abs(a - b);

/** Was `to` arrived at by a leap from `from`? */
export function isLeap(from: number, to: number): boolean {
  return diatonicGap(from, to) >= LEAP_INTERVAL;
}

/**
 * The cost of what a candidate does about a leap that just happened.
 *
 * Zero unless the previous note was reached by a leap; then zero for a step or
 * a repeat, and `weight` for anything wider.
 *
 * A weight, not a filter - the distinction that this generator keeps having to
 * relearn. Removing the non-recovering candidates can leave a step with nothing
 * legal to place, and that is what becomes a failed exercise; re-ordering
 * candidates that are all already legal cannot fail. Where a step exists the
 * weight is large enough to take it every time, and where none does the line
 * still gets written.
 */
export function leapRecoveryCost(
  candidatePitch: number,
  previous: Note | VoiceNote | undefined,
  beforePrevious: Note | VoiceNote | undefined,
  weight: number
): number {
  if (!previous || !beforePrevious) return 0;
  if ((previous as VoiceNote).rest || (beforePrevious as VoiceNote).rest) return 0;
  if (!isLeap(beforePrevious.pitchValue, previous.pitchValue)) return 0;
  return diatonicGap(candidatePitch, previous.pitchValue) <= 1 ? 0 : weight;
}

/**
 * Priced to win where it applies - but be clear about how little that is.
 *
 * Measured, this term barely moves the end-to-end number, and the reason is
 * worth keeping: the selector already takes the *nearest* legal note, so a step
 * was already the cheapest option whenever one existed. Instrumented over 4438
 * moments where a voice owed a step, it took one every single time one was
 * available - and one was available only 76% of the time. When a voice leaps
 * twice it is because every nearer chord tone had already been filtered out by
 * harmony, doubling, spacing or parallels, and no preference conjures a note
 * that is not there.
 *
 * What it does earn is the cases where the tessitura and extreme-range terms
 * would otherwise outbid a step. That is a small, real job. The term that
 * actually moves the number is LEAP_SURCHARGE below.
 */
export const UPPER_VOICE_RECOVERY = 6;

/**
 * The bass is different, and deliberately weaker.
 *
 * Root motion by fourths and fifths is how harmony moves - I-V-I in root
 * position is a leap followed by a leap, and it is correct. Priced like the
 * upper voices the bass would have to abandon root position to obey, turning
 * every progression into inversions.
 *
 * Set this low on that reasoning, and measured it changes nothing: bass recovery
 * sits at 46-52% with it and without it, inside the run-to-run spread. Kept as
 * the tie-breaker it was meant to be, not as something that earns its keep.
 */
export const BASS_RECOVERY = 1.5;

/**
 * Flat surcharge on taking a leap at all, over and above the distance already
 * priced into the smoothness term.
 *
 * This is the term that works. Recovery after the fact cannot be fixed by
 * preference (see UPPER_VOICE_RECOVERY), but making the *first* leap rarer can,
 * and it serves the same end: a line with fewer leaps has fewer unrecovered
 * ones. UIL 5, 16 bars, 80 exercises:
 *
 *   alto    leaps 18.6% -> 14.1% of intervals, recovery 60% -> 66%
 *   tenor   leaps 13.9% -> 11.6%,              recovery 65% -> 72%
 *   soprano leaps 15.7% -> 15.1%,              recovery 70% -> 71%
 *
 * The soprano moves least because it stands down at cadences, where it is the
 * voice that has to leap to put the tonic on top.
 *
 * Costs nothing measurable: 0% failures at every level at 8, 16 and 24 bars,
 * voice spacing unchanged, cadences unchanged.
 */
export const LEAP_SURCHARGE = 6;

/**
 * Whether a melodic interval is one a singer can actually pitch.
 *
 * `maxSkip` alone is the wrong instrument for this. It is a single number, so
 * UIL 5 sets it to 6 diatonic steps to allow the octave leaps a bass line
 * wants - and a 6 admits the *seventh* on the way past. A seventh is the one
 * leap common practice rules out in every voice: unlike the octave it has no
 * consonant frame to pitch against, and it is what a singer hits and misses.
 *
 * Measured before this existed: 104 melodic sevenths in 7235 intervals, 47 of
 * them in the bass.
 *
 * So: everything up to a sixth, the octave, and nothing else. Anything wider
 * than an octave was already meant to be impossible - it reached the page only
 * through the deadlock escape in processRhythms, which was not applying maxSkip.
 */
export function isSingableInterval(a: number, b: number): boolean {
  const gap = Math.abs(a - b);
  if (gap === 6) return false; // a seventh
  return gap <= 7; // up to and including the octave
}
