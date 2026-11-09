import { READERS, readerById, type Reader } from "./readers";
import { MAJOR_KEYS, MINOR_KEYS, isMinorKey } from "./minor-degrees";

/**
 * One assignment for every part (9 November 2026, Blaine: "assign it once
 * then the student picks their voice part and it fixes the range
 * automatically", and the director customises it within each instrument
 * instead of making an assignment per part).
 *
 * A Unison sight-reading assignment that writes new exercises may name the
 * parts students choose from (readers.ts ids: Soprano, Alto, Tenor, Bass,
 * the band and string instruments). The music is the teacher's (key, meter,
 * rhythms, skips, bars); the part brings its clef, transposition and sound,
 * and its range, which the teacher may narrow or move for that part. A band
 * or string part reads the concert key in its own written key. Tests
 * assignment-parts.test.ts.
 */

export type PartRange = { min: number; max: number };
export type AssignParts = { readers: string[]; ranges: Record<string, PartRange> };

/** The quick picks in the assignment form. */
export const PART_SETS: { id: string; label: string; readers: string[] }[] = [
  { id: "satb", label: "SATB", readers: ["soprano", "alto", "tenor", "bass"] },
  { id: "voices", label: "Treble and bass voices", readers: ["voice-treble", "voice-bass"] },
  { id: "band", label: "All band", readers: READERS.filter((r) => r.family === "band").map((r) => r.id) },
  { id: "strings", label: "All strings", readers: READERS.filter((r) => r.family === "strings").map((r) => r.id) },
];

/** Lowest and highest noteArray index a range may use (C2 to C8). */
const LOW = 0;
const HIGH = 42;
const MIN_SPAN = 4;

type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

/** Parts as the form sends them, or none. A range only where it differs from the part's own. */
export function checkParts(v: unknown): Checked<AssignParts | null> {
  if (v === undefined || v === null || v === false) return { ok: true, value: null };
  const p = (typeof v === "object" ? v : {}) as Record<string, unknown>;
  const ids = Array.isArray(p.readers) ? [...new Set(p.readers.filter((id): id is string => typeof id === "string"))] : [];
  if (!ids.length) return { ok: false, error: "Choose the parts students may pick from." };
  if (ids.some((id) => !Object.hasOwn(readerById, id))) return { ok: false, error: "One of those parts is not one we know." };
  const ranges: Record<string, PartRange> = {};
  const given = (p.ranges && typeof p.ranges === "object" ? p.ranges : {}) as Record<string, unknown>;
  for (const id of ids) {
    const r = given[id] as Record<string, unknown> | undefined;
    if (!r) continue;
    const min = Number(r.min);
    const max = Number(r.max);
    if (!Number.isInteger(min) || !Number.isInteger(max) || min < LOW || max > HIGH || max - min < MIN_SPAN) {
      return { ok: false, error: `${readerById[id].name}: the range needs at least ${MIN_SPAN + 1} notes.` };
    }
    const own = readerById[id].range;
    if (min !== own.min || max !== own.max) ranges[id] = { min, max };
  }
  return { ok: true, value: { readers: ids, ranges } };
}

/** The parts an assignment's params carry, or null. */
export function partsOf(params: unknown): AssignParts | null {
  if (!params || typeof params !== "object") return null;
  const c = checkParts((params as Record<string, unknown>).parts);
  return c.ok ? c.value : null;
}

/** The part as this assignment has it: the reader with the teacher's range for it, and do placed inside. */
export function partReader(parts: AssignParts, id: string): Reader | null {
  if (!parts.readers.includes(id) || !Object.hasOwn(readerById, id)) return null;
  const r = readerById[id];
  const range = parts.ranges[id] ?? r.range;
  return { ...r, range: { ...range }, anchor: Math.min(Math.max(r.anchor, range.min), range.max) };
}

const PC: Record<string, number> = { C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5, "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11 };
const SUPPORTED = [...MAJOR_KEYS, ...MINOR_KEYS];
/** The page's own spelling of a key at this pitch class, major or minor, if it has one. */
const spelled = (pc: number, minor: boolean) =>
  SUPPORTED.find((k) => isMinorKey(k) === minor && PC[minor ? k.slice(0, -1) : k] === pc) ?? null;

/**
 * The keys a part reads: the teacher's keys as concert pitch, written in the
 * part's own key when it transposes (a B♭ clarinet reads concert F in G).
 * A voice reads the keys as they are (a tenor's treble-8 is the clef's).
 * A key the page cannot write for that part (concert E on a B♭ instrument
 * is F♯ major) is left out; `missing` names them for the form to say.
 */
export function partKeys(keys: string[], reader: Reader): { keys: string[]; missing: string[] } {
  if (reader.family === "voice" || !reader.transposeSemitones) return { keys, missing: [] };
  const out: string[] = [];
  const missing: string[] = [];
  for (const k of keys) {
    const minor = isMinorKey(k);
    const pc = PC[minor ? k.slice(0, -1) : k];
    const w = pc === undefined ? null : spelled((((pc - reader.transposeSemitones) % 12) + 12) % 12, minor);
    if (w) out.includes(w) || out.push(w);
    else missing.push(k);
  }
  return { keys: out, missing };
}

/** A note's name from its noteArray index, C4 being 14. */
export function noteName(i: number): string {
  return `${"CDEFGAB"[((i % 7) + 7) % 7]}${Math.floor(i / 7) + 2}`;
}
