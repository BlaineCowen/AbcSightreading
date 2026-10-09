/**
 * The preset picker's Levels tab: the built-in presets in collapsible
 * sections. abcStepByStep (the ladder) comes first on both pages, then the
 * page's own levels - UIL on the Choral page, NYSSMA Voice on the Unison page.
 */

import { STEP_COUNT, ladder } from "./ladder";
import { NYSSMA_VOICE, STEP_BY_STEP, TMEA_ALLSTATE, UIL_CHOIR } from "./curriculum/catalogue";

export type LevelSectionId = "steps" | "tracks" | "uil" | "nyssma" | "tmea";

export interface LevelSection {
  id: LevelSectionId;
  label: string;
  /** A few words beside the label, saying what is inside. */
  note: string;
}

/**
 * `subscribed` (src/lib/curriculum/catalogue.ts ids) keeps the built-in sets
 * to the ones the teacher subscribes to; without it every one the page
 * offers shows. `tracks` is how many instrument tracks are subscribed.
 */
export function levelSections(offered: { uil: boolean; nyssma: boolean; tmea?: boolean; tracks?: number; subscribed?: string[] }): LevelSection[] {
  const has = (id: string) => !offered.subscribed || offered.subscribed.includes(id);
  return [
    ...(has(STEP_BY_STEP) ? [{ id: "steps" as const, label: "abcStepByStep", note: `${STEP_COUNT} steps` }] : []),
    ...(offered.tracks ? [{ id: "tracks" as const, label: "Instrument courses", note: `${offered.tracks} subscribed` }] : []),
    // UIL's five levels are the Choral page's own: always there, subscribed or not (Blaine, 9 October 2026).
    ...(offered.uil ? [{ id: "uil" as const, label: "UIL", note: "Levels 1–5" }] : []),
    ...(offered.nyssma && has(NYSSMA_VOICE) ? [{ id: "nyssma" as const, label: "NYSSMA Voice", note: "Levels I–V" }] : []),
    ...(offered.tmea && has(TMEA_ALLSTATE) ? [{ id: "tmea" as const, label: "TMEA All-State", note: "Levels I–IV, S A T B" }] : []),
  ];
}

/**
 * The section to open when the picker opens: the one holding the active
 * preset, or none (every section collapsed) when no built-in preset is active.
 */
export function sectionToOpen(
  sections: LevelSection[],
  active: { step: boolean; nyssma: boolean; uil: boolean; track?: boolean; tmea?: boolean },
): LevelSectionId | null {
  const want: LevelSectionId | null = active.step ? "steps" : active.track ? "tracks" : active.nyssma ? "nyssma" : active.tmea ? "tmea" : active.uil ? "uil" : null;
  return sections.find((s) => s.id === want)?.id ?? null;
}
