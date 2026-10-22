import { writable } from "svelte/store";
import type { Analysis, Take } from "./analyse";
import type { TakeRecorder } from "./recorder";
import type { EnsembleKind } from "./tuning";

/**
 * The Ensemble tab's take, kept for the page's life (never saved, never
 * sent), so switching to another abcTuner tab and back keeps it, and a
 * recording goes on while another tab shows. Small on purpose: AbcTuner
 * reads `ensembleRecording` for its tab's dot without loading the tab.
 */
export const ensembleRecording = writable(false);

export const ensembleSession: {
  recorder: TakeRecorder | null;
  take: Take | null;
  /** The file's name, or null for a recording. */
  name: string | null;
  analysis: Analysis | null;
  /** The model the analysis used. */
  kind: EnsembleKind | null;
} = { recorder: null, take: null, name: null, analysis: null, kind: null };
