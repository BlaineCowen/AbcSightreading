import type { VoiceNote } from "./types";
import { isSingableInterval } from "./leap-recovery";

/**
 * The checks a splice has to pass at its edges.
 *
 * Two passes now rewrite a finished exercise by moving notes around inside it -
 * `unison-spans`, which puts two parts on one line for a stretch, and
 * `rhyming-phrases`, which makes the consequent phrase open like the antecedent.
 * Both join material that the search never wrote against what follows it, so
 * every guarantee the search makes has to be re-checked where the two meet.
 *
 * That lesson arrived one guarantee at a time, each found by measuring after the
 * fact rather than by reasoning it out: melodic leaps, then parallel perfect
 * intervals, then the resolution owed to an accidental. They live here so a
 * third pass cannot rediscover them a fourth time, and so fixing one fixes both.
 */

/** The last note actually sung before a seam, looking through rests. */
export function lastSounding(notes: VoiceNote[]): VoiceNote | undefined {
  for (let i = notes.length - 1; i >= 0; i--) if (!notes[i].rest) return notes[i];
  return undefined;
}

/** The first note actually sung after a seam, looking through rests. */
export function firstSounding(notes: VoiceNote[]): VoiceNote | undefined {
  for (const n of notes) if (!n.rest) return n;
  return undefined;
}

/**
 * Whether one voice can be joined at a seam without an unsingable jump.
 *
 * A seventh is refused whatever `maxSkip` permits. Where a rest separates the
 * two notes the interval is not sung as a leap - the phrase has ended, the
 * singer breathes, and the next entry is found rather than slurred into - so a
 * rested seam is held to being singable and to a fifth instead of to `maxSkip`,
 * which governs how far a line may move while it is being sung.
 */
export function seamLeapOk(
  before: VoiceNote[],
  after: VoiceNote[],
  maxSkip: number
): boolean {
  const a = lastSounding(before);
  const b = firstSounding(after);
  if (!a || !b) return true;
  if (!isSingableInterval(a.pitchValue, b.pitchValue)) return false;
  const rested =
    after.slice(0, after.indexOf(b)).some((n) => n.rest) ||
    before.slice(before.indexOf(a) + 1).some((n) => n.rest);
  const allowed = rested ? Math.max(maxSkip, 4) : maxSkip;
  return Math.abs(b.pitchValue - a.pitchValue) <= allowed;
}

/**
 * Whether an accidental sitting on a seam still gets the resolution it is owed.
 *
 * A chromatic note is written together with the note that resolves it, so a
 * splice that replaces what came next silently strands it. A raised note rises
 * and a lowered note falls; `wasRaised` is what tells the two apart in flat
 * keys, where every chromatic note is spelled as a natural. A repeat of the same
 * pitch is fine - the note is held and the resolution comes after it.
 */
export function seamResolutionOk(
  before: VoiceNote[],
  after: VoiceNote[]
): boolean {
  const a = lastSounding(before);
  const b = firstSounding(after);
  if (!a || !b || !a.accidental) return true;
  const delta = b.pitchValue - a.pitchValue;
  if (delta === 0) return true;
  const raised =
    a.accidental === "sharp" ||
    a.accidental === "double-sharp" ||
    (a.accidental === "natural" && a.wasRaised === true);
  return raised ? delta === 1 : delta === -1;
}

/**
 * Whether any pair of voices crosses a seam in parallel perfect intervals.
 *
 * The same rule the search applies in `findValidVoiceNote`: both voices moving,
 * in the same direction, into the same perfect interval - a fifth (4 mod 7), an
 * octave (0 mod 7), or a unison.
 *
 * Not used by the unison splice, where two parts moving together on one pitch is
 * the entire point rather than a fault.
 */
export function parallelsAcross(
  prevs: (VoiceNote | undefined)[],
  nexts: (VoiceNote | undefined)[]
): boolean {
  for (let a = 0; a < prevs.length; a++) {
    for (let b = a + 1; b < prevs.length; b++) {
      const a0 = prevs[a], a1 = nexts[a], b0 = prevs[b], b1 = nexts[b];
      if (!a0 || !a1 || !b0 || !b1) continue;
      // A held voice is not in parallel motion with anything. Strictly redundant
      // - Math.sign of no movement is 0, so the direction test below always
      // differs - but the search's own filter is written this way.
      if (a0.pitchValue === a1.pitchValue) continue;
      if (b0.pitchValue === b1.pitchValue) continue;
      const dirA = Math.sign(a1.pitchValue - a0.pitchValue);
      const dirB = Math.sign(b1.pitchValue - b0.pitchValue);
      if (dirA !== dirB) continue;
      const before = Math.abs(a0.pitchValue - b0.pitchValue);
      const after = Math.abs(a1.pitchValue - b1.pitchValue);
      if (before % 7 === 4 && after % 7 === 4) return true;
      if (before % 7 === 0 && after % 7 === 0) return true;
    }
  }
  return false;
}
