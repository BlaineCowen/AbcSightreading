import { itemForKey, type OwnPreset } from "./class-course";
import { CUSTOM_KEYS, isCustomKey, pagePath } from "./practice";

/**
 * Creating a sight-reading assignment (AssignmentWizard.svelte) sometimes
 * needs the practice page: to set up a custom exercise there, or to write
 * the one exercise every student gets. The wizard keeps what it has so far
 * in this tab (sessionStorage), sends the teacher to the page with
 * `?assigning=1`, and the page's AssigningBar adds the settings or the
 * exercise and comes back to /account, where the wizard picks up at the
 * last step. Tests: assignment-draft.test.ts.
 */

export const ASSIGNING_PARAM = "assigning";
const KEY = "sr-assign-draft";

export type AssignDraft = {
  /** A preset key (step:, uil:, saved: ...) or custom:unison / custom:choral. */
  presetKey: string;
  /** One exercise for everyone, rather than new ones each time. */
  fixed: boolean;
  classIds: string[];
  minutes: number;
  dueAt: string;
  note: string;
  /** A custom one's title, what students see. */
  title: string;
  /** Filled in on the page. */
  custom?: { name: string; params: Record<string, unknown> };
  exercise?: string;
  /** Back from the page with what it needed. */
  ready?: boolean;
};

export function saveDraft(d: AssignDraft) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(d));
  } catch {}
}

export function readDraft(): AssignDraft | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    const d = raw ? (JSON.parse(raw) as AssignDraft) : null;
    return d && typeof d.presetKey === "string" && Array.isArray(d.classIds) ? d : null;
  } catch {
    return null;
  }
}

export function clearDraft() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {}
}

/** Whether the wizard has to send the teacher to the page before it can send. */
export const needsPage = (d: Pick<AssignDraft, "presetKey" | "fixed">) => d.fixed || isCustomKey(d.presetKey);

/** Whether a draft has everything the page was to add. */
export const draftComplete = (d: AssignDraft) =>
  (!d.fixed || !!d.exercise) && (!isCustomKey(d.presetKey) || !!d.custom);

/** Where the teacher sets it up: the preset's own link (its settings applied), or the page as they left it for a custom one. */
export function designHref(presetKey: string, own: OwnPreset[]): string | null {
  const base = isCustomKey(presetKey) ? pagePath(CUSTOM_KEYS[presetKey]) : itemForKey(presetKey, own)?.href;
  if (!base) return null;
  return `${base}${base.includes("?") ? "&" : "?"}${ASSIGNING_PARAM}=1`;
}

/** Where the page sends the teacher back to: the wizard, at the last step. */
export const RESUME_HREF = "/account?assign=resume#students";

/** Opened from the wizard: the address says so. Read at start, before the page rewrites its address. */
export const assigningFromUrl = () =>
  typeof window !== "undefined" && new URLSearchParams(window.location.search).get(ASSIGNING_PARAM) === "1";

/**
 * What the page adds before going back: its settings for a custom one, the
 * exercise on screen for a fixed one. Null when a fixed one has no exercise yet.
 */
export function finishOnPage(d: AssignDraft, page: { params: Record<string, unknown>; exercise: string | null }): AssignDraft | null {
  if (d.fixed && !page.exercise) return null;
  const out: AssignDraft = { ...d, ready: true };
  if (d.fixed) out.exercise = page.exercise!;
  if (isCustomKey(d.presetKey)) out.custom = { name: d.title.trim() || "Sight reading", params: page.params };
  return out;
}
