import { BAND_TRACKS } from "./band";
import type { Track, TrackFamily, TrackPartKind, TrackStep } from "./types";

/**
 * Every curriculum track (src/lib/curriculum/types.ts), and the families the
 * catalogue shows. Ids are permanent: class progress, assignments and
 * teachers' own versions of steps are stored against them.
 */
export const TRACKS: Track[] = [...BAND_TRACKS];

export const trackById: Record<string, Track> = Object.fromEntries(TRACKS.map((t) => [t.id, t]));

export const FAMILIES: { id: TrackFamily; label: string; live: boolean; blurb: string }[] = [
  { id: "band", label: "Band", live: true, blurb: "Beginner band: every instrument on the same step, in the band's concert keys." },
  { id: "strings", label: "Strings", live: false, blurb: "Violin, viola, cello and bass." },
  { id: "choir", label: "Choir", live: false, blurb: "Soprano, alto, tenor and bass." },
  { id: "piano", label: "Piano", live: false, blurb: "Both hands, later on." },
];

/** A step and its track, by step id. */
export function findStep(stepId: string): { track: Track; step: TrackStep } | null {
  for (const track of TRACKS) {
    const step = track.steps.find((s) => s.id === stepId);
    if (step) return { track, step };
  }
  return null;
}

/** The class-progress / assignment key of one half of a step: "track:band-trumpet-03:notes". */
export const trackPresetKey = (stepId: string, part: TrackPartKind) => `track:${stepId}:${part}`;

/** The label the preset menu shows: "Trumpet 3 · Notes: do, re, mi". */
export function trackStepLabel(track: Track, step: TrackStep, part: TrackPartKind) {
  return `${track.name} ${step.number} · ${part === "rhythm" ? `Rhythm: ${step.title}` : `Notes: ${step.newNotes ?? step.title}`}`;
}

/** The Unison page link that opens a step's half (and applies it). */
export const trackHref = (stepId: string, part: TrackPartKind) => `/sightreading?track=${encodeURIComponent(stepId)}&part=${part}`;
