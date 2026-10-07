/**
 * The preset picker's Levels tab: the built-in presets in collapsible
 * sections. abcStepByStep (the ladder) comes first on both pages, then the
 * page's own levels - UIL on the Choral page, NYSSMA Voice on the Unison page.
 */

import { ladder } from "./ladder";

export type LevelSectionId = "steps" | "tracks" | "uil" | "nyssma";

export interface LevelSection {
  id: LevelSectionId;
  label: string;
  /** A few words beside the label, saying what is inside. */
  note: string;
}

export function levelSections(offered: { uil: boolean; nyssma: boolean; tracks?: number }): LevelSection[] {
  return [
    { id: "steps", label: "abcStepByStep", note: `${ladder.length} steps` },
    // Curriculum tracks (src/lib/curriculum): the ones subscribed to, or where to find them.
    ...(offered.tracks !== undefined
      ? [{ id: "tracks" as const, label: "My tracks", note: offered.tracks ? `${offered.tracks} subscribed` : "Band curriculum" }]
      : []),
    ...(offered.uil ? [{ id: "uil" as const, label: "UIL", note: "Levels 1–5" }] : []),
    ...(offered.nyssma ? [{ id: "nyssma" as const, label: "NYSSMA Voice", note: "Levels I–V" }] : []),
  ];
}

/**
 * The section to open when the picker opens: the one holding the active
 * preset, or none (every section collapsed) when no built-in preset is active.
 */
export function sectionToOpen(
  sections: LevelSection[],
  active: { step: boolean; nyssma: boolean; uil: boolean; track?: boolean },
): LevelSectionId | null {
  const want: LevelSectionId | null = active.step ? "steps" : active.track ? "tracks" : active.nyssma ? "nyssma" : active.uil ? "uil" : null;
  return sections.find((s) => s.id === want)?.id ?? null;
}
