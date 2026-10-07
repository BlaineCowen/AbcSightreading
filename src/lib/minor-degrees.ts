import { minorSyllable, type MinorSolfege } from "../resources/solfege";

/**
 * The Unison page's minor keys and their scale-degree selector. Degrees are
 * 1-based and counted from the minor tonic; a sharp or flat is against the
 * key signature (the generator's convention), so ♯7 in A minor is G♯ and in
 * C minor B♮: the raised leading tone either way.
 *
 * The main row is the natural minor scale. Above it the raised notes, ♯6 and
 * ♯7 first among them (melodic and harmonic minor), with ♯1, ♯3 (the Picardy
 * third) and ♯4; below it ♭2 (the Neapolitan) and ♭5.
 */

export const MAJOR_KEYS = ["Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E"];
/** The relative minors of the major row, as on the Choral page. */
export const MINOR_KEYS = ["Fm", "Cm", "Gm", "Dm", "Am", "Em", "Bm", "F#m", "C#m"];

export const isMinorKey = (key: string) => key.trim().endsWith("m");

export const MINOR_DEGREES = [1, 2, 3, 4, 5, 6, 7];
export const MINOR_SHARPS = [1, 3, 4, 6, 7];
export const MINOR_FLATS = [2, 5];
export const DEFAULT_MINOR_DEGREES = [1, 3, 5];

/** A degree's syllable under the chosen minor solfège (1-based degree). */
export const minorLabel = (degree: number, alter: "sharp" | "flat" | null, system: MinorSolfege) =>
  minorSyllable(degree - 1, alter, system);

/** The scale the raised notes make: natural, harmonic (raised 7) or melodic (raised 6 and 7). */
export function minorScaleName(sharps: Iterable<number>, system: MinorSolfege): string {
  const s = new Set(sharps);
  const six = minorLabel(6, "sharp", system);
  const seven = minorLabel(7, "sharp", system);
  if (s.has(6) && s.has(7)) return `Melodic minor (${six}, ${seven})`;
  if (s.has(7)) return `Harmonic minor (${seven})`;
  if (s.has(6)) return `Raised sixth (${six})`;
  return "Natural minor";
}

/** Degrees from a link or a saved preset: whole numbers in `allowed`, or null if none. */
export function degreesFrom(v: unknown, allowed: number[]): number[] | null {
  const list = Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : [];
  const out = [...new Set(list.map((d) => parseInt(String(d), 10)).filter((d) => allowed.includes(d)))];
  return out.length ? out : null;
}
