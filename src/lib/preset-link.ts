import { listPresets } from "./preset-sync";
import { CHORAL_PRESET_STORE, UNISON_PRESET_STORE, type SavedPreset } from "./preset-storage";

/**
 * Opening a saved preset on the other practice page.
 *
 * Each page keeps its own saved presets (a choral preset has a voicing, a
 * unison one a clef), but the picker lists both, and choosing one of the other
 * page's goes there with `?preset=<id>`; that page applies it on arrival.
 */
export const PRESET_PARAM = "preset";
export type PresetPage = "choral" | "unison";

export const storeFor = (page: PresetPage) => (page === "choral" ? CHORAL_PRESET_STORE : UNISON_PRESET_STORE);
export const pathFor = (page: PresetPage) => (page === "choral" ? "/choral-sightreading" : "/sightreading");
export const presetHref = (page: PresetPage, id: string) => `${pathFor(page)}?${PRESET_PARAM}=${encodeURIComponent(id)}`;

/** The preset the address asks for, read at start-up, before the page rewrites its address. */
export function linkedPresetId(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(PRESET_PARAM);
}

/** Find it in this page's list (the account's when signed in) and apply it. */
export async function openLinkedPreset<P>(page: PresetPage, id: string, apply: (p: SavedPreset<P>) => void): Promise<boolean> {
  try {
    const { presets } = await listPresets<P>(storeFor(page));
    const found = presets.find((p) => p.id === id);
    if (found) apply(found);
    // Out of the address, so a reload keeps the reader's edits rather than
    // applying the preset over them again.
    const url = new URL(window.location.href);
    if (url.searchParams.has(PRESET_PARAM)) {
      url.searchParams.delete(PRESET_PARAM);
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    }
    return !!found;
  } catch {
    return false;
  }
}
