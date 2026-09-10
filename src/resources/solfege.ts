import type { VoiceNote } from "../lib/types";

/**
 * Movable-do solfège syllables.
 *
 * The only solfège in the repo before this was inline and unexported inside
 * generateUnison's `createConcatString` - with two arrays next to it that are
 * dead and disagree with the maps they sit beside. This is a clean one for
 * choral; unison is left alone deliberately, since its lyric alignment is
 * pinned by tests and it reads accidentals off the note *name* rather than the
 * accidental field.
 */

/** Diatonic syllables, tonic first. */
// "so" rather than "sol", matching the spelling already shipped in
// generateUnison - one app should not use two.
const DIATONIC = ["do", "re", "mi", "fa", "so", "la", "ti"] as const;

/** Raised: do->di, re->ri, fa->fi, so->si, la->li. Mi and ti do not raise. */
const RAISED: Record<number, string> = { 0: "di", 1: "ri", 3: "fi", 4: "si", 5: "li" };

/** Lowered: re->ra, mi->me, fa->fe, so->se, la->le, ti->te. Do does not lower. */
const LOWERED: Record<number, string> = {
  1: "ra",
  2: "me",
  3: "fe",
  4: "se",
  5: "le",
  6: "te",
};

export type SolfegeMode = "major" | "minor";

/**
 * In minor the tonic is **la**, not do.
 *
 * `degree` arrives 0-6 relative to the tonic *letter* (getDiatonicDegree in
 * prep-params.ts rotates the letter row by the key's rootOffset), so degree 0 is
 * the tonic in both modes - do-based by construction. La-based minor is
 * therefore a rotation of five: degree 0 lands on la, degree 2 on do.
 *
 * The minor leading tone then falls out on its own: a raised degree 6 rotates to
 * index 4 (so), and raised so is si - which is what a la-based system calls
 * it.
 */
const MINOR_ROTATION = 5;

/** Whether the key string names a minor key, matching the UI's convention. */
export function modeOf(key: string): SolfegeMode {
  return key.trim().endsWith("m") ? "minor" : "major";
}

/**
 * The syllable for one note.
 *
 * Chromatic alteration is read from `accidental` together with `wasRaised`, not
 * from the note name. A natural on its own cannot say whether it raised or
 * lowered the written pitch - in F major a B natural is a raised 4th, in G
 * major an F natural is a lowered 7th - and that distinction is exactly the
 * minor leading tone. `wasRaised` is the field that settles it.
 */
export function solfegeFor(
  degree: number,
  accidental: VoiceNote["accidental"],
  wasRaised: boolean | undefined,
  mode: SolfegeMode
): string {
  if (!Number.isInteger(degree) || degree < 0 || degree > 6) return "";

  const index =
    mode === "minor" ? (degree + MINOR_ROTATION) % 7 : degree;

  const raised =
    accidental === "sharp" ||
    accidental === "double-sharp" ||
    (accidental === "natural" && wasRaised === true);
  const lowered =
    accidental === "flat" ||
    accidental === "double-flat" ||
    (accidental === "natural" && wasRaised === false);

  if (raised) return RAISED[index] ?? DIATONIC[index];
  if (lowered) return LOWERED[index] ?? DIATONIC[index];
  return DIATONIC[index];
}

/**
 * The syllables for one voice, ready to join into a `w:` line.
 *
 * Rests are skipped rather than given a placeholder: ABC aligns lyrics to note
 * elements and a rest consumes no slot, so emitting anything here would shift
 * every later syllable one note to the left. Skipping also keeps the lookup away
 * from rests, which carry an inconsistent degree sentinel - 0 in one place and
 * -1 in another, and `solfege[0]` would quietly print "do".
 */
export function solfegeLineFor(notes: VoiceNote[], key: string): string[] {
  const mode = modeOf(key);
  const syllables: string[] = [];
  for (const note of notes) {
    if (note.rest) continue;
    syllables.push(solfegeFor(note.degree, note.accidental, note.wasRaised, mode));
  }
  return syllables;
}
