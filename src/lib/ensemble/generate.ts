import { generateChoralExercise, type ChoralExercise } from "../generateChoral";
import { voiceBodyAbc, type AbcDisplayOptions } from "../abc-assembly";
import type { TimeSignature, VoiceNote } from "../types";
import { tempoField } from "../meter";
import { uilPresets } from "../uil-presets";
import { melodyFirstFor } from "../two-part-treble";
import { skipLevelFor } from "../uil-skips";
import { isSelectableRhythm, containsRest } from "../selectable-rhythms";
import { rhythms as allRhythms } from "../../resources/rhythms";
import { chords as fullChordSet } from "../../resources/chords";
import { writtenKey } from "../curriculum/band";
import { arrangeEnsemble, CHORAL_BIAS, type Arrangement, type EnsembleMember, type EnsembleStaff } from "./arrange";
import { writtenNote } from "./transpose";

/**
 * An ensemble exercise: the Choral writer writes the parts at concert pitch
 * (arrange.ts says which and where), and each instrument gets its own staff,
 * the part as it reads it - in its octave, clef and written key - played back
 * on its own sound and transposed back to concert (`transpose=` on its voice,
 * `%%MIDI program` after its first V: line in the body, the only place abcjs
 * reads a sound per voice; pieces/write-abc.ts does the same).
 *
 * A level is a UIL level's rhythms, chords, cadences and skips; the key is any
 * major key (a band reads in B♭, E♭ and F, a choir in UIL's), and the meter
 * and length are the teacher's.
 */

export type EnsembleOptions = {
  members: EnsembleMember[];
  /** Concert key, major: C, F, Bb, Eb, Ab, Db, G, D, A, E. */
  key: string;
  timeSig: TimeSignature;
  measures: number;
  /** UIL level 1-5. */
  level: number;
  bpm: number;
  title?: string;
  display?: AbcDisplayOptions;
};

export type EnsembleExercise = {
  abc: string;
  arrangement: Arrangement;
  /** Each staff's notes as it reads them, in the arrangement's staff order. */
  staffNotes: VoiceNote[][];
  /** The parts at concert pitch, top first. */
  concert: VoiceNote[][];
  exercise: ChoralExercise;
};

export const ENSEMBLE_KEYS = ["C", "F", "Bb", "Eb", "Ab", "Db", "G", "D", "A", "E"];

/** What the level hands the Choral writer, as the sweep and the page build it. */
export function levelParams(level: number) {
  const name = `UIL ${level}`;
  const preset = (uilPresets as Record<string, any>)[name];
  if (!preset) throw new Error(`No level ${level}`);
  return { name, preset };
}

export function generateEnsembleExercise(o: EnsembleOptions): EnsembleExercise {
  const arrangement = arrangeEnsemble(o.members);
  const { name, preset } = levelParams(o.level);
  const selectedRhythms = allRhythms.filter(
    (r) => preset.allowedRhythmNames.includes(r.name) && isSelectableRhythm(r) && !(r.pattern === true && containsRest(r)) && !r.rest && r.totalValue <= o.timeSig.tsPerMeasure,
  );
  const exercise = generateChoralExercise({
    key: o.key,
    timeSig: o.timeSig,
    partsObject: arrangement.partsObject,
    measures: o.measures,
    maxSkip: preset.maxSkip,
    bpm: o.bpm,
    selectedRhythms,
    chords: fullChordSet,
    accidentalsByStep: true,
    nctProbability: 0.25,
    chromaticFrequency: 1,
    allowedChordNames: preset.allowedChordNames,
    voiceTexture: "full",
    stepwiseEighths: true,
    melodyFirst: melodyFirstFor(name),
    skipLevel: skipLevelFor(name),
    breathRests: !preset.noRests,
    cadenceTypes: preset.allowedCadenceTypes,
    dottedOnStrongBeats: !!preset.dottedOnStrongBeats,
    partWriterLevel: preset.level,
  } as any);
  const byName = new Map(exercise.voiceNames.map((n, i) => [n, exercise.voiceNotes[i]]));
  const concert = arrangement.parts.map((p) => byName.get(p.name) ?? []);
  // Choral pitch is an octave above concert: read it an octave down.
  const staffNotes = arrangement.staves.map((s) =>
    concert[s.part].map((n) =>
      writtenNote(n, { concertKey: o.key, writtenKey: writtenKey(o.key, s.instrument.transpose), octave: s.octave - CHORAL_BIAS / 7, transpose: s.instrument.transpose }),
    ),
  );
  const abc = ensembleAbc(arrangement.staves, staffNotes, concert[0], o);
  return { abc, arrangement, staffNotes, concert, exercise };
}

/** The full score: a staff an instrument, each in its own key, clef and sound. */
export function ensembleAbc(staves: EnsembleStaff[], staffNotes: VoiceNote[][], topPart: VoiceNote[], o: Pick<EnsembleOptions, "key" | "timeSig" | "bpm" | "title" | "display">): string {
  const display = o.display ?? {};
  const lines = [
    "X:1",
    `T:${o.title ?? "Ensemble Sight Reading"}`,
    "C:abcSightReading",
    `M:${o.timeSig.name}`,
    "L:1/32",
    tempoField(o.timeSig, o.bpm),
    `%%score [${staves.map((s) => s.id).join(" ")}]`,
    ...staves.map((s) => `V:${s.id} clef=${s.instrument.clef} name="${s.name}" snm="${s.short}"${s.instrument.transpose ? ` transpose=${s.instrument.transpose}` : ""}`),
    "K:C",
  ];
  // The chord symbols ride on the top staff, from the top part, wherever that part is drawn.
  const symbols = new Map<number, string>();
  let at = 0;
  for (const n of topPart) {
    if (n.chordSymbol) symbols.set(at, n.chordSymbol);
    at += n.length;
  }
  staves.forEach((s, i) => {
    const key = writtenKey(o.key, s.instrument.transpose);
    const notes = staffNotes[i].map((n) => (n.chordSymbol ? { ...n, chordSymbol: undefined } : n));
    const { music, lyrics } = voiceBodyAbc(notes, key, o.timeSig, display, i === 0 ? symbols : null);
    lines.push(`V:${s.id}`, `%%MIDI program ${s.instrument.program}`, `[K:${key}] ${music}`);
    if (lyrics) lines.push(lyrics);
  });
  return lines.join("\n") + "\n";
}
