/**
 * What the generators are handed, as the pages build it - shared by the sweep
 * and the ladder check so both test the configurations a user can reach.
 */
import { ClefType } from "../src/lib/types";
import { isSelectableRhythm, containsRest } from "../src/lib/selectable-rhythms";

export const TIME_SIGS: Record<string, any> = {
  "4/4": { name: "4/4", tsPerMeasure: 32, beamGroupSize: 8 },
  "3/4": { name: "3/4", tsPerMeasure: 24, beamGroupSize: 8 },
  "2/4": { name: "2/4", tsPerMeasure: 16, beamGroupSize: 8 },
};

/** The component's voicing table, verbatim - this is what a user can pick. */
export const VOICINGS: Record<string, any> = {
  "4 Part Mixed": { numofParts: 4, parts: {
    Soprano: { order: 3, smallName: "S", clef: ClefType.Treble, range: [21,35], currentRange: [25,32] },
    Alto: { order: 2, smallName: "A", clef: ClefType.Treble, range: [14,32], currentRange: [21,28] },
    Tenor: { order: 1, smallName: "T", clef: ClefType.TrebleOctaveUp, range: [11,27], currentRange: [14,23] },
    Bass: { order: 0, smallName: "B", clef: ClefType.Bass, range: [2,24], currentRange: [9,18] } } },
  "3 Part Mixed": { numofParts: 3, parts: {
    Soprano: { order: 2, smallName: "S", clef: ClefType.Treble, range: [21,35], currentRange: [25,32] },
    Alto: { order: 1, smallName: "A", clef: ClefType.Treble, range: [14,32], currentRange: [21,28] },
    Baritone: { order: 0, smallName: "B", clef: ClefType.Bass, range: [2,26], currentRange: [9,18] } } },
  "3 Part Treble": { numofParts: 3, parts: {
    Soprano1: { order: 2, smallName: "S1", clef: ClefType.Treble, range: [21,35], currentRange: [25,32] },
    Soprano2: { order: 1, smallName: "S2", clef: ClefType.Treble, range: [18,32], currentRange: [22,29] },
    Alto: { order: 0, smallName: "A", clef: ClefType.Treble, range: [14,30], currentRange: [21,27] } } },
  "3 Part Tenor/Bass": { numofParts: 3, parts: {
    Tenor: { order: 2, smallName: "T", clef: ClefType.TrebleOctaveUp, range: [11,27], currentRange: [14,23] },
    Baritone: { order: 1, smallName: "B1", clef: ClefType.Bass, range: [2,26], currentRange: [6,16] },
    Bass: { order: 0, smallName: "B2", clef: ClefType.Bass, range: [2,24], currentRange: [2,11] } } },
  "2 Part Treble": { numofParts: 2, parts: {
    Soprano: { order: 1, smallName: "S", clef: ClefType.Treble, range: [21,35], currentRange: [25,32] },
    Alto: { order: 0, smallName: "A", clef: ClefType.Treble, range: [14,32], currentRange: [21,28] } } },
  "2 Part Tenor/Bass": { numofParts: 2, parts: {
    Tenor: { order: 1, smallName: "T", clef: ClefType.TrebleOctaveUp, range: [11,27], currentRange: [14,23] },
    Bass: { order: 0, smallName: "B", clef: ClefType.Bass, range: [2,24], currentRange: [9,18] } } },
};

export const choralSelectable = (r: any) =>
  isSelectableRhythm(r) && !(r.pattern === true && containsRest(r));

/** What the level actually hands the generator, as applyUILPreset builds it. */
export function presetVoicing(voicingName: string, preset: any) {
  const base = VOICINGS[voicingName];
  if (!base) return null;
  const parts: Record<string, any> = {};
  for (const [name, def] of Object.entries<any>(base.parts)) {
    const r = preset.voiceRanges?.[name];
    parts[name] = { ...def, currentRange: r ? [...r] : [...def.currentRange] };
  }
  return { numofParts: base.numofParts, parts };
}

