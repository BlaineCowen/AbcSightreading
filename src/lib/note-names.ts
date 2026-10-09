import { keySignatures } from "../resources/key-signatures";

/**
 * Notes by letter name, as an instrumentalist reads them: the instrument
 * courses name every note this way (written pitch, in the written key),
 * where the choir's levels use solfège.
 */

const LETTERS = "CDEFGAB";
const NATURAL_PC = [0, 2, 4, 5, 7, 9, 11];
const SIGN: Record<number, string> = { [-2]: "𝄫", [-1]: "♭", 0: "", 1: "♯", 2: "𝄪" };

/** The key signature's alteration of a degree (0-based): +1 sharp, -1 flat, 0 natural. */
function keyAlter(key: string, degree0: number): number {
  const sig = keySignatures[key];
  if (!sig) return 0;
  if (sig.sharps.includes(degree0)) return 1;
  if (sig.flats.includes(degree0)) return -1;
  return 0;
}

/**
 * A scale degree (1-based, 8 and up wrap) named in a key: 3 in B♭ is "D",
 * raised 4 in B♭ is "E♮", lowered 7 in C is "B♭". An altered note the key
 * already alters shows its natural sign, as the music would.
 */
export function degreeLetter(key: string, degree: number, alter = 0): string {
  const d0 = (((degree - 1) % 7) + 7) % 7;
  const root = keySignatures[key]?.rootOffset ?? 0;
  const letter = LETTERS[(root + d0) % 7];
  const base = keyAlter(key, d0);
  const net = base + alter;
  if (alter !== 0 && net === 0) return `${letter}♮`;
  return `${letter}${SIGN[net] ?? ""}`;
}

/**
 * Notes outside a key, as degree and alteration from its tonic (semitones
 * above it): in major di, me, fi, le, te; in minor the Neapolitan, the
 * Picardy third, the raised fourth, sixth and seventh.
 */
const CHROMATIC_MAJOR: Record<number, [number, number]> = { 1: [1, 1], 3: [3, -1], 6: [4, 1], 8: [6, -1], 10: [7, -1] };
const CHROMATIC_MINOR: Record<number, [number, number]> = { 1: [2, -1], 4: [3, 1], 6: [4, 1], 9: [6, 1], 11: [7, 1] };

/**
 * A pitch (MIDI) named in a key: the key's own spelling for its seven notes,
 * and outside them the usual chromatic spelling (in G, 70 is B♭, not A♯).
 */
export function pitchLetter(key: string, midi: number): string {
  const pc = ((Math.round(midi) % 12) + 12) % 12;
  const root = keySignatures[key]?.rootOffset ?? 0;
  const tonic = (NATURAL_PC[root] + keyAlter(key, 0) + 12) % 12;
  const semis = (pc - tonic + 12) % 12;
  for (let d = 0; d < 7; d++) {
    const li = (root + d) % 7;
    const a = keyAlter(key, d);
    if ((((NATURAL_PC[li] + a) % 12) + 12) % 12 === pc) return `${LETTERS[li]}${SIGN[a]}`;
  }
  const [degree, alter] = (key.endsWith("m") ? CHROMATIC_MINOR : CHROMATIC_MAJOR)[semis] ?? [1, 0];
  return degreeLetter(key, degree, alter);
}

/** The key's name as it is read: "B♭", "F♯". */
export const keyLabel = (key: string) => key.replace("b", "♭").replace("#", "♯");
