/**
 * Printed dynamics for a unison exercise (NYSSMA Voice levels spec, section 5).
 *
 * The first sung note carries a mark drawn from the set; each phrase - the
 * generator's cadences come every 4 bars - may change it, and a mark that
 * repeats the last one is not printed. Written as ABC decorations (`!mf!`),
 * which abcjs draws under the staff and plays: its sequencer maps p, mp, mf
 * and f to beat velocities 60, 75, 90 and 105 on a downbeat (abcjs 6.4.4,
 * abc_midi_sequencer.js setDynamics; 105 with no marking at all).
 */

export const DYNAMIC_MARKS = ["p", "mp", "mf", "f"] as const;
export type DynamicMark = (typeof DYNAMIC_MARKS)[number];

/** A mark on one note: `at` indexes the part's chordNoteObject, rests included. */
export interface PlacedDynamic {
  at: number;
  mark: DynamicMark;
}

export const isDynamicMark = (v: unknown): v is DynamicMark =>
  typeof v === "string" && (DYNAMIC_MARKS as readonly string[]).includes(v);

/** The generator writes a cadence every four bars (createNewSrOnce, numCadences). */
export const BARS_PER_PHRASE = 4;

/** The first sung note of each phrase. */
export function phraseStarts(
  notes: readonly { noteLength: number; rhythm?: { rest?: boolean } | null }[],
  tsPerMeasure: number,
  barsPerPhrase = BARS_PER_PHRASE
): number[] {
  const phraseLength = tsPerMeasure * barsPerPhrase;
  const starts: number[] = [];
  let offset = 0;
  let lastPhrase = -1;
  notes.forEach((note, index) => {
    const phrase = Math.floor(offset / phraseLength);
    if (phrase > lastPhrase && !note.rhythm?.rest) {
      starts.push(index);
      lastPhrase = phrase;
    }
    offset += note.noteLength;
  });
  return starts;
}

/** A mark for each phrase start, from the set; a repeat of the last mark is left off. */
export function drawDynamics(
  starts: readonly number[],
  set: readonly DynamicMark[],
  random: () => number = Math.random
): PlacedDynamic[] {
  if (set.length === 0) return [];
  const placed: PlacedDynamic[] = [];
  for (const at of starts) {
    const mark = set.length === 1 ? set[0] : set[Math.floor(random() * set.length)];
    if (placed.length === 0 || placed[placed.length - 1].mark !== mark) placed.push({ at, mark });
  }
  return placed;
}

/** The set from options, a preset or a link ("mf,p"), soft to loud. Empty is Off. */
export function dynamicsSetFrom(value: unknown): DynamicMark[] {
  const list: unknown[] = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  return DYNAMIC_MARKS.filter((m) => list.includes(m));
}

/** One mark in or out of the set, kept soft to loud. Taking the last one out is Off. */
export function toggleDynamic(set: readonly DynamicMark[], mark: DynamicMark): DynamicMark[] {
  return set.includes(mark)
    ? set.filter((m) => m !== mark)
    : DYNAMIC_MARKS.filter((m) => m === mark || set.includes(m));
}

/** Dynamics from a link: `[[at, mark], ...]`, in order, inside the part. Null when malformed. */
export function readPlacedDynamics(raw: unknown, noteCount: number): PlacedDynamic[] | null {
  if (!Array.isArray(raw) || raw.length > 64) return null;
  const out: PlacedDynamic[] = [];
  for (const entry of raw) {
    if (!Array.isArray(entry) || entry.length !== 2) return null;
    const [at, mark] = entry;
    if (!Number.isInteger(at) || at < 0 || at >= noteCount || !isDynamicMark(mark)) return null;
    if (out.length && at <= out[out.length - 1].at) return null;
    out.push({ at, mark });
  }
  return out;
}
