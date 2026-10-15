import { isInstrumentProgram } from "../instruments";
import type { PieceScore } from "./model";

/**
 * Rules for a teacher's own pieces, shared by the page and the server.
 *
 * Uploading is Pro (a student account never uploads); assigning a piece to a
 * class is Educator, as every assignment is.
 */

/** The upload as sent: always compressed (the page zips a plain .musicxml first). */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
export const MAX_PIECES = 200;
export const MAX_TITLE = 120;

export const ACCEPTED = ".mxl,.musicxml,.xml";

export function isPieceFileName(name: string): boolean {
  return /\.(mxl|musicxml|xml)$/i.test(name);
}

/** What a teacher may change about a part. */
export type PartSetting = {
  name: string;
  program: number;
  /** 0 to 100. */
  volume: number;
  muted: boolean;
  hidden: boolean;
};

export type PartSettings = Record<string, PartSetting>;

export const DEFAULT_VOLUME = 80;

export function defaultPartSettings(score: PieceScore): PartSettings {
  return Object.fromEntries(
    score.parts.map((p) => [p.id, { name: p.name, program: p.program, volume: DEFAULT_VOLUME, muted: false, hidden: false }]),
  );
}

/** Each part's settings, the stored ones over the file's (a part the store lacks takes the file's). */
export function partSettingsFor(score: PieceScore, stored: unknown): PartSettings {
  const base = defaultPartSettings(score);
  const s = stored && typeof stored === "object" ? (stored as Record<string, unknown>) : {};
  for (const id of Object.keys(base)) {
    const checked = checkPartSetting(s[id]);
    if (checked) base[id] = checked;
  }
  return base;
}

/**
 * Settings for the whole piece: the key it is played and shown in (semitones
 * from the file's), and whether students in a class library are offered
 * practice mixes (one part loud, the rest soft). Kept in the piece's `parts`
 * JSON under PIECE_KEY, beside the parts, so they needed no new column; every
 * reader of `parts` that lists parts skips it (`storedPartIds`, summaryOf).
 */
export const PIECE_KEY = "$piece";
export const MAX_TRANSPOSE = 6;
/**
 * `transpose` is the key the music is drawn in; `sound` the key it is heard
 * in (both semitones from the file's), null to sound as it is drawn (Blaine,
 * 15 October 2026: transpose the written music and the audio separately).
 * Settings saved before `sound` existed read as null.
 */
export type PieceSettings = { transpose: number; sound: number | null; practiceMixes: boolean };
export const DEFAULT_PIECE_SETTINGS: PieceSettings = { transpose: 0, sound: null, practiceMixes: false };

const isShift = (v: unknown) => Number.isInteger(v) && Math.abs(v as number) <= MAX_TRANSPOSE;

export function checkPieceSettings(v: unknown): PieceSettings | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (!isShift(o.transpose)) return null;
  if (o.sound !== undefined && o.sound !== null && !isShift(o.sound)) return null;
  if (typeof o.practiceMixes !== "boolean") return null;
  return { transpose: o.transpose as number, sound: (o.sound as number | null | undefined) ?? null, practiceMixes: o.practiceMixes };
}

/** Semitones from the file's key the music is heard in. */
export function soundShift(s: Pick<PieceSettings, "transpose" | "sound">): number {
  return s.sound ?? s.transpose;
}

/** The piece's settings from its stored `parts`, the defaults where there are none. */
export function pieceSettingsOf(stored: unknown): PieceSettings {
  const s = stored && typeof stored === "object" ? (stored as Record<string, unknown>)[PIECE_KEY] : null;
  return checkPieceSettings(s) ?? { ...DEFAULT_PIECE_SETTINGS };
}

/** The part ids in a stored `parts`, without the piece's own settings. */
export function storedPartIds(stored: unknown): string[] {
  return stored && typeof stored === "object" ? Object.keys(stored).filter((k) => k !== PIECE_KEY) : [];
}

/** The stored `parts` without the piece's own settings: the parts alone. */
export function storedParts(stored: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (stored && typeof stored === "object") for (const k of storedPartIds(stored)) out[k] = (stored as Record<string, unknown>)[k];
  return out;
}

/**
 * One part loud, the rest soft (a practice mix): each part's level, 0 to 1,
 * over the teacher's own volumes. `null` plays the teacher's mix.
 */
export const MIX_SOFT = 0.3;
export function mixLevel(partId: string, loud: string | null): number {
  return loud === null || partId === loud ? 1 : MIX_SOFT;
}

export function checkPartSetting(v: unknown): PartSetting | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.name !== "string" || o.name.trim().length === 0 || o.name.length > 60) return null;
  if (!isInstrumentProgram(o.program)) return null;
  if (typeof o.volume !== "number" || !Number.isFinite(o.volume) || o.volume < 0 || o.volume > 100) return null;
  if (typeof o.muted !== "boolean" || typeof o.hidden !== "boolean") return null;
  return { name: o.name.trim(), program: Number(o.program), volume: Math.round(o.volume), muted: o.muted, hidden: o.hidden };
}

export type PieceUpdate = { title?: string; parts?: PartSettings; settings?: PieceSettings };

export function checkPieceUpdate(body: unknown, partIds: string[]): { ok: true; value: PieceUpdate } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Nothing to change." };
  const b = body as Record<string, unknown>;
  const value: PieceUpdate = {};
  if (b.title !== undefined) {
    if (typeof b.title !== "string" || !b.title.trim()) return { ok: false, error: "A piece needs a title." };
    if (b.title.length > MAX_TITLE) return { ok: false, error: `Keep the title under ${MAX_TITLE} characters.` };
    value.title = b.title.trim();
  }
  if (b.parts !== undefined) {
    if (!b.parts || typeof b.parts !== "object") return { ok: false, error: "Those part settings are not readable." };
    const parts: PartSettings = {};
    for (const id of partIds) {
      const checked = checkPartSetting((b.parts as Record<string, unknown>)[id]);
      if (!checked) return { ok: false, error: "Those part settings are not readable." };
      parts[id] = checked;
    }
    value.parts = parts;
  }
  if (b.settings !== undefined) {
    const settings = checkPieceSettings(b.settings);
    if (!settings) return { ok: false, error: "Those settings are not readable." };
    value.settings = settings;
  }
  if (value.title === undefined && value.parts === undefined && value.settings === undefined) return { ok: false, error: "Nothing to change." };
  return { ok: true, value };
}

/** What a list of pieces shows: no score, just enough to choose one. */
export type PieceSummary = {
  id: string;
  title: string;
  composer: string;
  sourceName: string;
  bars: number;
  parts: string[];
  warnings: string[];
  createdAt: number;
};
