import { BAND_TRACKS } from "./band";
import { ORCHESTRA_TRACKS } from "./orchestra";
import type { Track, TrackFamily, TrackPartKind, TrackStep } from "./types";

/**
 * Every curriculum track (src/lib/curriculum/types.ts), and the families the
 * catalogue shows. Ids are permanent: class progress, assignments and
 * teachers' own versions of steps are stored against them.
 */
export const TRACKS: Track[] = [...BAND_TRACKS, ...ORCHESTRA_TRACKS];

export const trackById: Record<string, Track> = Object.fromEntries(TRACKS.map((t) => [t.id, t]));

export const FAMILIES: { id: TrackFamily; label: string; live: boolean; blurb: string }[] = [
  { id: "choir", label: "Choir and voice", live: true, blurb: "abcStepByStep, UIL and NYSSMA Voice." },
  { id: "band", label: "Band", live: true, blurb: "Beginner band: every instrument on the same step, in the band's concert keys." },
  { id: "strings", label: "Orchestra", live: true, blurb: "Violin, viola, cello and bass." },
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

/** The class-progress / assignment key of one half of a step: "track:band-trumpet-03:notes" (class-validate.ts). */
export const trackPresetKey = (stepId: string, part: TrackPartKind) => `track:${stepId}:${part}`;

/** The step and half a track key names. */
export function stepOfKey(key: string): { track: Track; step: TrackStep; part: TrackPartKind } | null {
  const m = /^track:([a-z0-9-]+):(rhythm|notes)$/.exec(key);
  const found = m ? findStep(m[1]) : null;
  if (!found || (m![2] === "notes" && !found.step.notes)) return null;
  return { ...found, part: m![2] as TrackPartKind };
}

/** The label the preset menu shows: "Trumpet 3 · Notes: do, re, mi". */
export function trackStepLabel(track: Track, step: TrackStep, part: TrackPartKind) {
  return `${track.name} ${step.number} · ${part === "rhythm" ? `Rhythm: ${step.title}` : `Notes: ${step.newNotes ?? step.title}`}`;
}

/** The Unison page link that opens a step's half (and applies it). */
export const trackHref = (stepId: string, part: TrackPartKind) => `/sightreading?track=${encodeURIComponent(stepId)}&part=${part}`;

/** Card colours, spelled out so Tailwind sees each class. */
export const TRACK_COLOR_CLASS: Record<Track["color"], string> = {
  sky: "bg-sr-sky text-sr-sky-ink",
  mint: "bg-sr-mint text-sr-mint-ink",
  peach: "bg-sr-peach text-sr-peach-ink",
  butter: "bg-sr-butter text-sr-butter-ink",
};
export const TRACK_DOT_CLASS: Record<Track["color"], string> = {
  sky: "bg-sr-sky", mint: "bg-sr-mint", peach: "bg-sr-peach", butter: "bg-sr-butter",
};

/** noteArray index -> "C4" (index 14 is middle C). */
export const noteName = (i: number) => `${"CDEFGAB"[((i % 7) + 7) % 7]}${2 + Math.floor(i / 7)}`;

/** The keys a track reads, in order of first use, written ("C, F, G, D"). */
export function trackKeys(track: Track): string[] {
  const seen: string[] = [];
  for (const s of track.steps) for (const k of s.notes?.keys ?? []) if (!seen.includes(k)) seen.push(k);
  return seen.map((k) => k.replace("b", "♭"));
}

/** The highest and lowest written notes any step reaches. */
export function trackReach(track: Track) {
  return `${noteName(track.range.min)} to ${noteName(track.range.max)}`;
}

/** How a track's written notes sound, for the catalogue. */
export function soundsLabel(track: Track): string {
  const t = track.transposeSemitones;
  if (t === 0) return "As written";
  if (t === -12) return "An octave below written";
  const names: Record<number, string> = { [-2]: "A step below written (B♭)", [-7]: "A fifth below written (in F)", [-9]: "A sixth below written (E♭)", [-14]: "An octave and a step below written (B♭)", [-21]: "An octave and a sixth below written (E♭)" };
  return names[t] ?? `${Math.abs(t)} semitones ${t < 0 ? "below" : "above"} written`;
}

/** Which drawing a track's card carries (InstrumentIcon). */
export const iconFor = (track: Track) => track.id.replace(/^(band|orch)-/, "");
