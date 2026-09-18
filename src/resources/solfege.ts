import type { VoiceNote } from "../lib/types";
import { keySignatures } from "./key-signatures";

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

/**
 * What goes under the notes.
 *
 * - `movable` - solfège against the KEY: do is the tonic, so the same tune is
 *   the same syllables whatever key it is written in. What this app has always
 *   printed.
 * - `fixed` - solfège against the LETTER: C is always do. What a fixed-do
 *   training uses, and what a reader trained that way needs to see.
 * - `names` - the letter itself, with its accidental: C, F♯, B♭.
 */
export type LyricSystem = "movable" | "fixed" | "names";

/** Letter names by pitch class. `noteArray` starts at C, so index 0 is C. */
const LETTERS = ["C", "D", "E", "F", "G", "A", "B"] as const;

/**
 * The accidental actually in force for a note: its own if it carries one, and
 * the key signature's otherwise.
 *
 * A diatonic note carries no accidental field - the F in G major is printed
 * without one, because the key signature already sharpened it. Movable do never
 * has to care (the degree says everything), but a fixed-do syllable and a note
 * name both name the pitch, so both have to ask the key.
 */
export function alterationOf(
  note: Pick<VoiceNote, "degree" | "accidental">,
  key: string
): "sharp" | "flat" | null {
  if (note.accidental === "sharp" || note.accidental === "double-sharp") return "sharp";
  if (note.accidental === "flat" || note.accidental === "double-flat") return "flat";
  if (note.accidental === "natural") return null;
  const keyInfo = keySignatures[key.trim()];
  if (!keyInfo) return null;
  // sharps/flats are key-relative degrees, which is what `degree` holds.
  if (keyInfo.sharps.includes(note.degree)) return "sharp";
  if (keyInfo.flats.includes(note.degree)) return "flat";
  return null;
}

/** The pitch class of a note: 0 for any C, 6 for any B. */
const pitchClassOf = (pitchValue: number) => ((pitchValue % 7) + 7) % 7;

/**
 * Fixed do: the syllable follows the letter, not the key. C is do in every key,
 * and the chromatic spellings are the same ones movable do uses - C♯ is di,
 * E♭ is me.
 */
export function fixedDoFor(
  pitchValue: number,
  alteration: "sharp" | "flat" | null
): string {
  const index = pitchClassOf(pitchValue);
  if (alteration === "sharp") return RAISED[index] ?? DIATONIC[index];
  if (alteration === "flat") return LOWERED[index] ?? DIATONIC[index];
  return DIATONIC[index];
}

/** The note's name: C, F♯, B♭. Proper signs, not ASCII - these are sung from. */
export function noteNameFor(
  pitchValue: number,
  alteration: "sharp" | "flat" | null
): string {
  const letter = LETTERS[pitchClassOf(pitchValue)];
  return alteration === "sharp" ? `${letter}♯` : alteration === "flat" ? `${letter}♭` : letter;
}

/**
 * The lyric line for one voice in whichever system, ready to join into `w:`.
 *
 * Rests are skipped for the reason `solfegeLineFor` gives: ABC aligns lyrics to
 * note elements, and a rest is not one.
 */
export function lyricLineFor(
  notes: VoiceNote[],
  key: string,
  system: LyricSystem
): string[] {
  if (system === "movable") return solfegeLineFor(notes, key);
  const out: string[] = [];
  for (const note of notes) {
    if (note.rest) continue;
    const alteration = alterationOf(note, key);
    out.push(
      system === "fixed"
        ? fixedDoFor(note.pitchValue, alteration)
        : noteNameFor(note.pitchValue, alteration)
    );
  }
  return out;
}
