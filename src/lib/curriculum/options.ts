import { placeSpan } from "../unison-pools";
import type { Track, TrackPartKind, TrackStep } from "./types";

/**
 * One half of a track step as the Unison page's own options (the shape a
 * saved preset stores, read by AbcjsSingle's stateFromOptions), so applying
 * it is applying a preset: Edited, Revert and Save as new work unchanged.
 * Everything a step does not set (the click, the drill, volumes) is left out,
 * which leaves the page's own setting alone.
 *
 * Band reads note names and counts its rhythms, so the drill shows Counting
 * and the note exercise prints no solfège.
 */
export function trackStepOptions(track: Track, step: TrackStep, kind: TrackPartKind): Record<string, unknown> {
  const part = kind === "notes" && step.notes ? step.notes : step.rhythm;
  // A rhythm drill keeps the notes the step reads, so turning pitches on shows them.
  const pitched = step.notes ?? lastNotes(track, step.number);
  const keys = pitched?.keys ?? [defaultKey(track)];
  const span = pitched?.span ?? ([0, 4] as [number, number]);
  const range = placeSpan(span, keys[0], track.anchor, track.range) ?? { ...track.range };
  return {
    selectedClef: track.clef,
    selectedKeys: [...keys],
    selectedKey: keys[0],
    selectedTimeSignatures: [...part.meters],
    selectedTimeSignature: part.meters[0],
    selectedRange: range,
    rangeSpan: [...span],
    rangeAnchor: track.anchor,
    rangeLimit: { ...track.range },
    selectedScaleDegrees: [...(pitched?.scaleDegrees ?? [1, 2, 3])],
    selectedSharpDegrees: [...(pitched?.sharps ?? [])],
    selectedFlatDegrees: [...(pitched?.flats ?? [])],
    selectedRhythms: [...part.rhythms],
    measures: part.measures,
    maxSkip: pitched?.maxSkip ?? 1,
    bpm: part.bpm,
    eighthPairsOnePitch: false,
    accidentalsFollowStep: true,
    showSolfege: false,
    lyricSystem: "names",
    rhythmOnly: part.rhythmOnly,
    showRhythmSyllables: part.rhythmOnly,
    syllableSystemId: "counting",
    allowTiesAcrossBarline: part.ties,
    progressions: pitched?.progressions ?? true,
    dynamics: [],
    instrumentProgram: track.instrumentProgram,
    transposeSemitones: track.transposeSemitones,
  };
}

/** The notes of the latest step at or before `n` that has them. */
function lastNotes(track: Track, n: number) {
  for (let i = n; i >= 1; i--) {
    const s = track.steps[i - 1];
    if (s?.notes) return s.notes;
  }
  return track.steps.find((s) => s.notes)?.notes;
}

const defaultKey = (track: Track) => track.steps.find((s) => s.notes?.keys)?.notes?.keys?.[0] ?? "C";
