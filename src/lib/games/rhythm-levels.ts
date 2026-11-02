import { ladder } from "../ladder";
import { selectableRhythms } from "../selectable-rhythms";
import { beatsOf, timeSignaturesFor } from "../meter";

/**
 * The rhythm game's levels: abcStepByStep's rhythm steps (ladder.ts), each
 * bringing in one figure, so the game follows the curriculum. A round is one
 * meter drawn from the step's, a few bars of its rhythms, at the game's tempo.
 */

export type RhythmLevel = { id: string; name: string; meters: string[]; rhythms: string[] };

export const RHYTHM_LEVELS: RhythmLevel[] = ladder
  .filter((s: any) => s.unison?.rhythmOnly)
  .map((s: any) => ({
    id: s.id,
    name: s.title ?? s.name ?? s.id,
    meters: s.unison.meters ?? [s.unison.selectedTimeSignature],
    rhythms: s.unison.selectedRhythms,
  }));

export const rhythmLevel = (id: string | null | undefined) => RHYTHM_LEVELS.find((l) => l.id === id) ?? RHYTHM_LEVELS[0];

/** The tempo a round starts at, and the choices. */
export const GAME_TEMPOS = [60, 72, 84, 96, 108, 120];
export const GAME_BARS = [2, 4];

/** What /api/generate takes for a round of this level: rhythm only, as the Unison page asks for it. */
export function roundParams(level: RhythmLevel, o: { bars: number; bpm: number; meter?: string }) {
  const meter = o.meter && level.meters.includes(o.meter) ? o.meter : level.meters[Math.floor(Math.random() * level.meters.length)];
  return {
    meter,
    beatsPerBar: beatsOf(meter),
    params: {
      bpm: o.bpm,
      tempo: o.bpm,
      clef: "treble",
      selectedClef: "treble",
      timeSig: timeSignaturesFor([meter])[meter],
      selectedTimeSignature: meter,
      measures: o.bars,
      maxSkip: 4,
      range: { min: 20, max: 30 },
      rhythms: selectableRhythms.filter((r) => level.rhythms.includes(r.name)),
      selectedRhythms: level.rhythms,
      scaleDegrees: [1],
      selectedSharpDegrees: [],
      selectedFlatDegrees: [],
      key: "C",
      rhythmOnly: true,
      showRhythmSyllables: false,
      syllableSystemId: "kodaly",
      allowTiesAcrossBarline: false,
      partsObject: { numofParts: 1, parts: { Unison: { order: 0, smallName: "U" } } },
    },
  };
}
