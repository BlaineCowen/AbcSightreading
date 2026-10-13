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
  /** Simple: the UIL level's choir textures. Chorale: Bach's (see CHORALE). Simple when left out. */
  style?: EnsembleStyle;
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

export type EnsembleStyle = "simple" | "chorale";

/**
 * Bach chorale style (Blaine, 13 October 2026: "band instruments can do more
 * complicated stuff, more in the style of our Bach chorales"). A quarter-note
 * pulse, halves and whole notes at the cadences, and every part decorated on
 * its own - passing and neighbour tones in eighths, suspensions into the
 * cadence, an escape tone now and then - by the decoration pass the Choral
 * writer already tunes against the 371 chorales (non-chord-tone-gen.ts,
 * scripts/bach/README.md). Each part is written by the general four-part
 * writer, not a choir level's textures (an alto holding do), with the
 * diatonic chords in every inversion and the V7's, secondary dominants from
 * Level 3, leaps to a sixth, and a fermata at every phrase's end.
 *
 * The level sets how busy it is: how often a chord tone is decorated.
 */
const CHORALE = {
  /**
   * The eighth pair is on the list only so the decorations may use eighths
   * (nct-patterns: a figure no shorter than the shortest rhythm offered) and
   * barely drawn for the shared rhythm: the eighths are each part's own.
   */
  rhythms: ["quarter", "half", "dotHalf", "whole", "eighthEighth"],
  /** A quarter is the pulse: four times as likely as anything else to be drawn. */
  rhythmBias: { quarter: 4, eighthEighth: 0.02 },
  diatonic: ["1", "1-6", "1-64", "2", "2-6", "3", "4", "4-6", "4-64", "5", "5-6", "5-64", "5-7", "5-7-65", "5-7-43", "5-7-42", "6", "7", "1-7"],
  chromatic: ["5/5", "5/5-6", "5/6", "5/6-6", "5/2", "5/2-6"],
  maxSkip: 5,
  /**
   * How likely a chord tone is to be decorated, by level. Measured against
   * 120 of Bach's chorales (13 October 2026; the same counts both ways): he
   * writes 36% of his notes as eighths, the parts' rhythms differ on 55% of
   * beats, 21% of moves leap. Every eligible note decorated (Level 5) gives
   * 20%, 30% and 28% here, and drawing more eighths into the shared rhythm
   * does not move it: the decoration pass's own limits (a passing tone needs
   * a third to fill, two parts never decorate the same instant) are the
   * ceiling. Level 1 about 12% eighths.
   */
  decoration: { 1: 0.6, 2: 0.7, 3: 0.8, 4: 0.9, 5: 1 } as Record<number, number>,
};

/** What the Choral writer is handed for a style and level. */
function writerParams(style: EnsembleStyle, level: number, timeSig: TimeSignature) {
  if (style === "chorale") {
    return {
      selectedRhythms: allRhythms.filter((r) => CHORALE.rhythms.includes(r.name) && r.totalValue <= timeSig.tsPerMeasure),
      rhythmBias: CHORALE.rhythmBias,
      allowedChordNames: level >= 3 ? [...CHORALE.diatonic, ...CHORALE.chromatic] : CHORALE.diatonic,
      maxSkip: CHORALE.maxSkip,
      nctProbability: CHORALE.decoration[level] ?? 0.8,
      chromaticFrequency: level >= 3 ? 1 : 0,
    };
  }
  const { name, preset } = levelParams(level);
  return {
    selectedRhythms: allRhythms.filter(
      (r) => preset.allowedRhythmNames.includes(r.name) && isSelectableRhythm(r) && !(r.pattern === true && containsRest(r)) && !r.rest && r.totalValue <= timeSig.tsPerMeasure,
    ),
    allowedChordNames: preset.allowedChordNames,
    maxSkip: preset.maxSkip,
    nctProbability: 0.25,
    chromaticFrequency: 1,
    melodyFirst: melodyFirstFor(name),
    skipLevel: skipLevelFor(name),
    breathRests: !preset.noRests,
    cadenceTypes: preset.allowedCadenceTypes,
    dottedOnStrongBeats: !!preset.dottedOnStrongBeats,
    partWriterLevel: preset.level,
  };
}

/** Draws after the first, when one cannot be written. */
const ENSEMBLE_RETRIES = 2;

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
  const style = o.style ?? "simple";
  const writer = writerParams(style, o.level, o.timeSig);
  // A draw that cannot fit a chord (an unusual mix of registers, 16 bars) is drawn again: with two more draws about 1 in 2,600 still fails (scripts/check-ensemble.ts, 13 October 2026).
  let exercise: ChoralExercise | undefined;
  for (let attempt = 0; ; attempt++) {
    try {
      exercise = drawChorale();
      break;
    } catch (e) {
      if (attempt >= ENSEMBLE_RETRIES) throw e;
    }
  }
  function drawChorale() {
    return generateChoralExercise({
      key: o.key,
      timeSig: o.timeSig,
      partsObject: arrangement.partsObject,
      measures: o.measures,
      bpm: o.bpm,
      chords: fullChordSet,
      accidentalsByStep: true,
      voiceTexture: "full",
      stepwiseEighths: true,
      ...writer,
    } as any);
  }
  const byName = new Map(exercise!.voiceNames.map((n, i) => [n, exercise!.voiceNotes[i]]));
  const concert = arrangement.parts.map((p) => byName.get(p.name) ?? []);
  // Choral pitch is an octave above concert: read it an octave down.
  const staffNotes = arrangement.staves.map((s) =>
    concert[s.part].map((n) =>
      writtenNote(n, { concertKey: o.key, writtenKey: writtenKey(o.key, s.instrument.transpose), octave: s.octave - CHORAL_BIAS / 7, transpose: s.instrument.transpose }),
    ),
  );
  if (style === "chorale") markFermatas(concert, staffNotes);
  const abc = ensembleAbc(arrangement.staves, staffNotes, concert[0], o);
  return { abc, arrangement, staffNotes, concert, exercise: exercise! };
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

/**
 * A fermata over every part at each phrase's end: on the note in each staff
 * that ends where a cadence does (a decoration may have split the cadence's
 * note, so it is found by its end, not by its flag), and over the last note.
 */
function markFermatas(concert: VoiceNote[][], staffNotes: VoiceNote[][]) {
  const ends = new Set<number>();
  for (const part of concert) {
    let at = 0;
    for (const n of part) {
      at += n.length;
      if (n.isCadenceEnd) ends.add(at);
    }
    ends.add(at);
  }
  for (const notes of staffNotes) {
    let at = 0;
    for (let i = 0; i < notes.length; i++) {
      at += notes[i].length;
      if (ends.has(at) && !notes[i].rest) notes[i] = { ...notes[i], fermata: true };
    }
  }
}
