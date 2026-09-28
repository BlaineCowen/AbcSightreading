/**
 * Practice time and assignments: the rules, tested in
 * tests/unit/practice.test.ts. The page measures (src/lib/practice-tracker.ts),
 * the server credits (src/pages/api/practice.ts), and the numbers teachers see
 * come from here.
 *
 * Only whether and for how long a student practised is kept - minutes,
 * exercise counts and dates. No recordings, no device, no address: the
 * students may be under 13.
 */
import { parsePresetKey } from "./class-validate";
import { ladderById, type LadderPage } from "./ladder";
import { UNISON_PRESET_STORE } from "./preset-storage";

type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

/** Stillness longer than this pauses the count, unless something is sounding. */
export const IDLE_MS = 5 * 60_000;
/** How often the page reports, and the most one report can be credited. */
export const BEAT_SECONDS = 30;
/** The practice log is deleted after this - a school year and a margin. */
export const RETENTION_DAYS = 395;

/**
 * Whether this second counts: the page is in front of the student, and they
 * touched it, or something is sounding (playback, the metronome, the tuner
 * listening), within IDLE_MS.
 */
export function isActive(p: { visible: boolean; lastActivityAt: Date; busy: boolean; now: Date }): boolean {
  if (!p.visible) return false;
  return p.busy || p.now.getTime() - p.lastActivityAt.getTime() <= IDLE_MS;
}

/**
 * Seconds to credit for one report: what the page claims, at most one
 * report's worth, and never more than the clock has moved since this
 * student's last credit - so tabs overlap instead of adding up.
 */
export function creditSeconds(p: { claimed: number; lastCreditedAt: Date | null; now: Date }): number {
  const claimed = Number.isFinite(p.claimed) ? Math.min(Math.max(p.claimed, 0), BEAT_SECONDS) : 0;
  const elapsed = p.lastCreditedAt ? Math.max(0, (p.now.getTime() - p.lastCreditedAt.getTime()) / 1000) : Infinity;
  // Rounded, not floored: reports land a few milliseconds early, and flooring
  // would lose a second of every thirty.
  return Math.round(Math.min(claimed, elapsed));
}

const utcDay = (d: Date) => d.toISOString().slice(0, 10);

/**
 * The day a report belongs to: the student's own calendar date ("2026-09-28")
 * when it is within a day of the server's, else the server's. A Texas evening
 * is already tomorrow in UTC, and a teacher means the local day.
 */
export function practiceDay(local: unknown, now = new Date()): string {
  if (typeof local === "string" && /^\d{4}-\d{2}-\d{2}$/.test(local)) {
    const t = Date.parse(`${local}T12:00:00Z`);
    if (Number.isFinite(t) && Math.abs(t - now.getTime()) <= 36 * 3_600_000) return local;
  }
  return utcDay(now);
}

export const MAX_MINUTES = 120;
const MAX_NOTE = 300;

export type AssignmentRequest = { presetKey: string; minutes: number; dueAt: Date | null; note: string };

export function checkAssignmentRequest(body: unknown, now = new Date()): Checked<AssignmentRequest> {
  if (typeof body !== "object" || body === null) return { ok: false, error: "Expected an assignment." };
  const b = body as Record<string, unknown>;
  if (!parsePresetKey(b.presetKey)) return { ok: false, error: "Choose what to practise." };
  const minutes = Number(b.minutes);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_MINUTES) {
    return { ok: false, error: `Minutes: a whole number from 1 to ${MAX_MINUTES}.` };
  }
  let dueAt: Date | null = null;
  if (b.dueAt !== undefined && b.dueAt !== null && b.dueAt !== "") {
    if (typeof b.dueAt !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(b.dueAt)) return { ok: false, error: "That due date is not a date." };
    // The end of the day it names, wherever the class is.
    dueAt = new Date(`${b.dueAt}T23:59:59Z`);
    if (!Number.isFinite(dueAt.getTime())) return { ok: false, error: "That due date is not a date." };
    if (dueAt.getTime() < now.getTime() - 86_400_000) return { ok: false, error: "That due date has passed." };
  }
  const note = typeof b.note === "string" ? b.note.trim() : "";
  if (note.length > MAX_NOTE) return { ok: false, error: `Notes are at most ${MAX_NOTE} characters.` };
  return { ok: true, value: { presetKey: b.presetKey as string, minutes, dueAt, note } };
}

/** The practice page an assignment opens on. A saved preset needs its store. */
export function assignmentPage(presetKey: string, savedStore?: string): LadderPage {
  const key = parsePresetKey(presetKey);
  if (key?.kind === "step") return ladderById[key.id].page;
  if (key?.kind === "saved") return savedStore === UNISON_PRESET_STORE ? "unison" : "choral";
  return "choral";
}

export const pagePath = (page: LadderPage) => (page === "unison" ? "/sightreading" : "/choral-sightreading");

/** The query parameter a practice page reads to open an assignment. */
export const ASSIGNMENT_PARAM = "assignment";

export type Progress = { status: "not-started" | "in-progress" | "done"; percent: number };

export function assignmentProgress(seconds: number, minutes: number): Progress {
  const percent = Math.min(100, Math.floor((seconds / (minutes * 60)) * 100));
  return { status: percent >= 100 ? "done" : seconds > 0 ? "in-progress" : "not-started", percent };
}
