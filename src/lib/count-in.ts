import { writable } from "svelte/store";

/**
 * The count-in, as a director says it: "1, 2, Ready, Go" in 4/4, "1, Ready,
 * Go" in 3/4. 2/4 is counted in over two bars so it gets the same four words -
 * one bar of two is too short to get a choir breathing together. Tested in
 * tests/unit/count-in.test.ts.
 *
 * The practice pages play this many bars before the music (abcjs's
 * extraMeasuresAtBeginning, and the drum intro on the Choral page), and set
 * `countInWordNow` on each beat of it for CountInOverlay to show.
 */

const beatsPerBar = (meter: string) => parseInt(meter, 10) || 4;

export const countInMeasures = (meter: string) => (beatsPerBar(meter) === 2 ? 2 : 1);

export const countInBeats = (meter: string) => countInMeasures(meter) * beatsPerBar(meter);

export function countInWords(meter: string): string[] {
  const beats = countInBeats(meter);
  // The last two beats are always "Ready, Go"; the numbers count up to them.
  return [...Array.from({ length: beats - 2 }, (_, i) => String(i + 1)), "Ready", "Go"];
}

/** The word for this moment of the count-in, or null outside it. `beat` is abcjs's, from 0, fractional between beats. */
export function countInWord(meter: string, beat: number): string | null {
  const whole = Math.floor(beat);
  if (whole < 0 || whole >= countInBeats(meter)) return null;
  return countInWords(meter)[whole];
}

/** The word showing now, with its beat so the same word twice still animates. Null hides it. */
export const countInWordNow = writable<{ word: string; beat: number } | null>(null);

/** Sets the overlay from a beat callback. Cheap to call on every subdivision. */
export function showCountIn(meter: string, beat: number) {
  const word = countInWord(meter, beat);
  const whole = Math.floor(beat);
  countInWordNow.update((now) => {
    if (!word) return now ? null : now;
    return now?.beat === whole ? now : { word, beat: whole };
  });
}

export const hideCountIn = () => countInWordNow.set(null);

/** The meter of a parsed abcjs tune, "3/4", or the fallback if it has none. */
export function meterOf(tune: { getMeterFraction?: () => { num: number; den: number } } | null | undefined, fallback: string) {
  const f = tune?.getMeterFraction?.();
  return f && f.num && f.den ? `${f.num}/${f.den}` : fallback;
}
