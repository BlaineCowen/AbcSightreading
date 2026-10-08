import { BAND, BAND_INSTRUMENTS, type InstrumentDef } from "./curriculum/band";
import { ORCHESTRA, ORCHESTRA_INSTRUMENTS } from "./curriculum/orchestra";
import type { LevelSectionId } from "./preset-sections";

/**
 * Who is reading: the Unison page's instrument pill, beside Preset. An
 * instrument decides the clef, the range, the transposition and the sound;
 * a level (a standard, a course step) decides everything else. So choosing
 * one never needs a menu of its own per standard, and a level picked after
 * it takes the instrument's range (Sight Reading Factory asks for the
 * instrument first, then the level, through a run of menus).
 *
 * The family keeps the preset menu to what that reader can use: a voice sees
 * abcStepByStep, NYSSMA Voice and TMEA; a trumpet sees its own course.
 *
 * Ids are stored (in this browser): never rename one.
 */
export type ReaderFamily = "voice" | "band" | "strings";

export interface Reader {
  id: string;
  name: string;
  family: ReaderFamily;
  clef: "treble" | "treble-8" | "bass" | "alto" | "tenor";
  /** Written range, noteArray indices (C4 = 14). */
  range: { min: number; max: number };
  /** Where a level's span places do: the first tonic at or above it (rangeForSpan). */
  anchor: number;
  /** Written to sounding, for playback (B♭ trumpet −2). */
  transposeSemitones: number;
  /** The sound it plays back on; a voice keeps the page's own (piano, choir...). */
  instrumentProgram?: number;
  /** The instrument's own course (curriculum/tracks.ts id). */
  trackId?: string;
  /** TMEA's part name, for a voice part TMEA sets ranges for. */
  tmeaPart?: "Soprano" | "Alto" | "Tenor" | "Bass";
}

/**
 * Voices. The four parts take TMEA's audition ranges (Levels I-II, the
 * chart's; tmea-presets.ts), the two plain voices the page's own clef
 * defaults (AbcjsSingle updateClef), so choosing one changes nothing a
 * singer had before. A tenor reads the treble clef with the 8.
 */
const VOICES: Reader[] = [
  { id: "voice-treble", name: "Voice, treble clef", family: "voice", clef: "treble", range: { min: 14, max: 21 }, anchor: 14, transposeSemitones: 0 },
  { id: "voice-bass", name: "Voice, bass clef", family: "voice", clef: "bass", range: { min: 7, max: 14 }, anchor: 7, transposeSemitones: 0 },
  { id: "soprano", name: "Soprano", family: "voice", clef: "treble", range: { min: 14, max: 25 }, anchor: 14, transposeSemitones: 0, tmeaPart: "Soprano" },
  { id: "alto", name: "Alto", family: "voice", clef: "treble", range: { min: 12, max: 22 }, anchor: 12, transposeSemitones: 0, tmeaPart: "Alto" },
  { id: "tenor", name: "Tenor", family: "voice", clef: "treble-8", range: { min: 9, max: 18 }, anchor: 9, transposeSemitones: 0, tmeaPart: "Tenor" },
  { id: "bass", name: "Bass", family: "voice", clef: "bass", range: { min: 4, max: 15 }, anchor: 4, transposeSemitones: 0, tmeaPart: "Bass" },
];

const fromCourse = (i: InstrumentDef, family: ReaderFamily, prefix: string): Reader => ({
  id: `${prefix}-${i.id}`,
  name: i.name,
  family,
  clef: i.clef as Reader["clef"],
  range: { ...i.range },
  anchor: i.anchor,
  transposeSemitones: i.transposeSemitones,
  instrumentProgram: i.instrumentProgram,
  trackId: `${prefix}-${i.id}`,
});

/** Every reader, in the pill's order: voices, band in score order, strings. */
export const READERS: Reader[] = [
  ...VOICES,
  ...BAND_INSTRUMENTS.map((i) => fromCourse(i, "band", BAND.prefix)),
  ...ORCHESTRA_INSTRUMENTS.map((i) => fromCourse(i, "strings", ORCHESTRA.prefix)),
];

export const readerById: Record<string, Reader> = Object.fromEntries(READERS.map((r) => [r.id, r]));

export const READER_GROUPS: { family: ReaderFamily; label: string }[] = [
  { family: "voice", label: "Voice" },
  { family: "band", label: "Band" },
  { family: "strings", label: "Strings" },
];

/** The reader whose own course a track is, so applying a course step sets the pill. */
export const readerForTrack = (trackId: string): Reader | undefined => READERS.find((r) => r.trackId === trackId);

/** The voice part a TMEA level is for. */
export const readerForTmeaPart = (part: string): Reader | undefined => READERS.find((r) => r.tmeaPart === part);

/**
 * Which of the preset menu's sections a reader can use. Without a reader
 * (never chosen) every section shows, as before the pill.
 */
export function sectionAllowed(reader: Reader | null, section: LevelSectionId): boolean {
  if (!reader) return true;
  if (section === "tracks") return reader.family !== "voice";
  return reader.family === "voice";
}

/**
 * The tracks a reader's menu lists: a band or string player's own course
 * only (another instrument's would change the instrument under them); a
 * voice, none. Without a reader, all subscribed ones.
 */
export function tracksFor<T extends { id: string }>(reader: Reader | null, tracks: T[]): T[] {
  if (!reader) return tracks;
  return tracks.filter((t) => t.id === reader.trackId);
}

/**
 * The same course step on another instrument's course: band-trumpet-03 on
 * clarinet is band-clarinet-03 (the band shares one sequence, the orchestra
 * another). Null when the reader has no course of that family.
 */
export function stepOnReader(stepId: string, fromTrackId: string, reader: Reader): string | null {
  if (!reader.trackId || !stepId.startsWith(`${fromTrackId}-`)) return null;
  const family = (id: string) => id.split("-")[0];
  if (family(reader.trackId) !== family(fromTrackId)) return null;
  return `${reader.trackId}${stepId.slice(fromTrackId.length)}`;
}

const STORE = "sr-reader";

/** The reader this browser chose, or null. */
export function loadReaderId(): string | null {
  try {
    const id = localStorage.getItem(STORE);
    return id && Object.hasOwn(readerById, id) ? id : null;
  } catch {
    return null;
  }
}

export function saveReaderId(id: string | null) {
  try {
    if (id) localStorage.setItem(STORE, id);
    else localStorage.removeItem(STORE);
  } catch {
    // Private mode or blocked storage: the pill still works for this visit.
  }
}
