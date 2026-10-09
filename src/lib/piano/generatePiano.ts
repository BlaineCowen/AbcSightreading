/**
 * Piano sight reading: harmony first, then the tune over it, then the
 * accompaniment playing the same chords in a pattern.
 *
 * The tune comes from the Unison page's progression writer
 * (unison-progressions.ts writeProgressionLine) inside the hand's position,
 * over the piano's own progressions (levels.ts), and is redrawn if it shadows
 * the chords' roots in fifths or octaves. The accompaniment reads the
 * progression the tune was written over (left-hand.ts), so on every beat both
 * hands are on one chord. Everything is asked for through `PianoSettings`; a
 * level is only a set of them.
 *
 * A finished exercise is checked (bars full, no parallel fifths or octaves
 * between the tune and the bass) and drawn again on a fault.
 */
import { generateRandomRhythm } from "../rhythm-generation";
import { writeProgressionLine, splitAt, type ProgressionLine } from "../unison-progressions";
import { selectableRhythms, selectableCompoundRhythms } from "../selectable-rhythms";
import { chords as chordTable } from "../../resources/chords";
import { noteArray } from "../../resources/noteArray";
import { beatUnitOf, timeSignatureFor } from "../meter";
import { parallelFaults } from "../parallel-check";
import type { RhythmWithPattern, VoiceNote } from "../types";
import {
  CHORD_NAMES,
  CHROMATIC_CHORDS,
  compoundFigures,
  PIANO_PROGRESSIONS,
  patternsFor,
  pianoLevelById,
  RIGHT_HAND_CHORDS,
  settingsFor,
  type Accompaniment,
  type LeftHandPattern,
  type PianoSettings,
} from "./levels";
import { writeLeftHand, RIGHT_HAND_CHORD_RANGE, type ChordSpan, type PianoNote } from "./left-hand";
import { chordAlter, chordDegrees, degreeOf, leftHandPosition, rightHandPosition } from "./voicing";
import { assemblePianoAbc, barsOf, keyAlter } from "./assemble";

export interface PianoParams {
  /** What to write; a level's settings (settingsFor) or a teacher's own. */
  settings?: PianoSettings;
  /** Shorthand for a level's settings. */
  levelId?: string;
  /** One of the settings' keys or meters, instead of a drawn one. */
  key?: string;
  meter?: string;
  /** One of the settings' patterns, instead of a drawn one. */
  pattern?: LeftHandPattern;
  barsPerLine?: number;
  /** The score's title (the level's name, say). */
  title?: string;
}

export type Hand = "right" | "left";

export interface PianoExercise {
  settings: PianoSettings;
  key: string;
  minor: boolean;
  meter: string;
  measures: number;
  bpm: number;
  progression: string;
  /** Chord names, bar by bar (one or two a bar). */
  harmony: string[][];
  pattern: Accompaniment;
  tuneHand: Hand;
  /** The chords as the accompaniment plays them, one span a chord (none when the hands take turns). */
  spans: ChordSpan[];
  rh: PianoNote[];
  lh: PianoNote[];
  abc: string;
}

/** Draws of a whole exercise before giving up (a rhythm no line fits, or a fault). */
const ATTEMPTS = 12;
/** Rhythms and lines drawn for one tune before the exercise is drawn again. */
const LINE_DRAWS = 12;
/** How often the settings' first pattern is drawn, the rest sharing what is left. */
const FIRST_PATTERN = 0.6;
/** How often an eligible long note at a cadence takes a third or sixth under it. */
const THIRDS_RATE = 0.6;
/** A dynamic for each four-bar phrase, in turn: one scheme drawn an exercise. */
const DYNAMIC_SCHEMES = [["mf", "p"], ["p", "f"], ["f", "p"], ["mf", "f"], ["p", "mf"]];

const pick = <T>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];

type LineNote = { name: string; degree: number; pitchValue: number };

export const keyName = (key: string) => (key.endsWith("m") ? `${key.slice(0, -1)} minor` : `${key} major`).replace("b ", "♭ ").replace("#", "♯");
/** The key in words, for the score's title: abcjs draws a ♭ with space round it ("A ♭ major"). */
const keyWords = (key: string) => (key.endsWith("m") ? `${key.slice(0, -1)} minor` : `${key} major`).replace(/^([A-G])b /, "$1 flat ").replace(/^([A-G])# /, "$1 sharp ");

/** The notes of a key from `low` to `high`, as the progression writer reads them. */
function noteList(key: string, low: number, high: number): LineNote[] {
  const out: LineNote[] = [];
  for (let pv = low; pv <= high; pv++) out.push({ name: noteArray[pv], degree: degreeOf(key, pv), pitchValue: pv });
  return out;
}

/** The figures the tune draws on in a meter: the chosen ones, or 6/8's to match them. */
function rhythmsFor(settings: PianoSettings, meter: string, barUnits: number) {
  if (meter === "6/8") {
    const names = compoundFigures(settings.rhythms);
    return selectableCompoundRhythms.filter((r) => names.includes(r.name));
  }
  return selectableRhythms.filter((r) => settings.rhythms.includes(r.name) && r.totalValue <= barUnits);
}

/** The chords the tune may be written over, by key: the choices in major or minor, and the chromatic ones in major. */
function chordsFor(settings: PianoSettings, minor: boolean) {
  const names = new Set<string>(["1"]);
  for (const c of settings.chords) {
    const n = CHORD_NAMES[c][minor ? "minor" : "major"];
    if (n) names.add(n);
  }
  if (settings.chromatic && !minor) for (const n of CHROMATIC_CHORDS) names.add(n);
  return chordTable.filter((c) => names.has(c.name));
}

/** A rhythm and a tune over it in [low, high], over a given progression or a drawn one. */
function tune(
  settings: PianoSettings,
  key: string,
  meter: string,
  low: number,
  high: number,
  accept: (rhythm: RhythmWithPattern[], line: ProgressionLine) => boolean = () => true,
): { rhythm: RhythmWithPattern[]; line: ProgressionLine } | null {
  const ts = timeSignatureFor(meter);
  const minor = key.endsWith("m");
  const rhythms = rhythmsFor(settings, meter, ts.tsPerMeasure);
  if (!rhythms.length) return null;
  const chords = chordsFor(settings, minor);
  // With chromatic chords chosen, a progression that uses one is drawn as often as the plain ones together.
  const chromatic = PIANO_PROGRESSIONS.filter((p) => p.bars.flat().some((n) => CHROMATIC_CHORDS.includes(n)));
  for (let a = 0; a < LINE_DRAWS; a++) {
    let rhythm: RhythmWithPattern[];
    try {
      rhythm = generateRandomRhythm(ts as any, settings.measures, rhythms, Array(Math.ceil(settings.measures / 4)).fill({ type: "V-I" }), true, false);
    } catch {
      continue;
    }
    const wantChromatic = settings.chromatic && !minor && Math.random() < 0.5;
    const line = writeProgressionLine({
      noteList: noteList(key, low, high),
      scaleDegrees: [0, 1, 2, 3, 4, 5, 6],
      chords,
      rhythm,
      barUnits: ts.tsPerMeasure,
      beatUnits: beatUnitOf(meter),
      measures: settings.measures,
      minor,
      policy: { kind: "max", maxSkip: settings.maxSkip },
      // A short note moves by step, as a beginner reads it (and as a scale run is).
      shortCaps: { eighth: 1, sixteenth: 1 },
      progressions: wantChromatic ? chromatic : PIANO_PROGRESSIONS,
    });
    if (line && accept(rhythm, line)) return { rhythm, line };
  }
  return null;
}

/** The alteration a tune's note takes from the chord under it (G sharp over E in A minor). */
function lineAlter(line: ProgressionLine, i: number): number {
  const chord = line.chordProgression[i]?.chord;
  const d = ((line.notes[i].degree % 7) + 7) % 7;
  if (!chord) return 0;
  return chord.sharpScaleDegree === d ? 1 : chord.flatScaleDegree === d ? -1 : 0;
}

/**
 * One note per rhythm slot. A passing note a step under a raised one is
 * raised too, as the melodic minor raises the sixth before the leading tone
 * (F sharp, G sharp, A in A minor; G sharp, F sharp, E over V of vi in C):
 * left alone the step is an augmented second. A chord note there keeps its
 * pitch, and the tune is drawn again (augmentedSecond).
 */
function asNotes(rhythm: RhythmWithPattern[], line: ProgressionLine): PianoNote[] {
  const notes: PianoNote[] = rhythm.map((r, i) => {
    if (r.rest) return { pitches: [], length: r.totalValue, rest: true };
    const alter = lineAlter(line, i);
    return alter ? { pitches: [line.notes[i].pitchValue], length: r.totalValue, alters: [alter] } : { pitches: [line.notes[i].pitchValue], length: r.totalValue };
  });
  const sounded = notes.map((n, i) => ({ n, i })).filter(({ n }) => !n.rest);
  for (let k = 1; k < sounded.length; k++) {
    for (const [lower, upper] of [[sounded[k - 1], sounded[k]], [sounded[k], sounded[k - 1]]]) {
      if (upper.n.pitches[0] - lower.n.pitches[0] !== 1 || (upper.n.alters?.[0] ?? 0) !== 1 || (lower.n.alters?.[0] ?? 0) !== 0) continue;
      const chord = line.chordProgression[lower.i]?.chord;
      const d = ((line.notes[lower.i].degree % 7) + 7) % 7;
      if (chord && !chord.triadNotes.includes(d)) lower.n.alters = [1];
    }
  }
  return notes;
}

const LETTER_SEMITONE = [0, 2, 4, 5, 7, 9, 11];
/** A pitch as it sounds, in semitones: its letter, the key signature and its own alteration. */
const semitones = (key: string, pitch: number, alter = 0) => Math.floor(pitch / 7) * 12 + LETTER_SEMITONE[((pitch % 7) + 7) % 7] + keyAlter(key, pitch) + alter;

/**
 * A step that is three semitones (G sharp to F over V of vi, F to G sharp in
 * A minor): the augmented second, which a tune does not sing or play by step.
 */
function augmentedSecond(key: string, line: PianoNote[]): boolean {
  const sounded = line.filter((n) => !n.rest && n.pitches.length);
  for (let i = 1; i < sounded.length; i++) {
    const a = sounded[i - 1], b = sounded[i];
    if (Math.abs(a.pitches[0] - b.pitches[0]) !== 1) continue;
    if (Math.abs(semitones(key, a.pitches[0], a.alters?.[0]) - semitones(key, b.pitches[0], b.alters?.[0])) === 3) return true;
  }
  return false;
}

/** The progression as chord spans: a split bar's two chords at splitAt. */
function spansOf(harmony: string[][], barUnits: number, beatUnits: number): ChordSpan[] {
  const first = splitAt(barUnits, beatUnits);
  return harmony.flatMap((bar) =>
    bar.length === 1
      ? [{ name: bar[0], length: barUnits, barStart: true }]
      : [
          { name: bar[0], length: first, barStart: true },
          { name: bar[1], length: barUnits - first, barStart: false },
        ],
  );
}

const restBar = (barUnits: number): PianoNote[] => [{ pitches: [], length: barUnits, rest: true }];

/**
 * On a long note on a strong beat in a phrase's last two bars, a chord tone a
 * third or sixth under the tune, kept above the left hand. The tune stays the
 * top note.
 */
function addDoubleNotes(rh: PianoNote[], harmony: string[][], key: string, barUnits: number, beatUnits: number, floor: number) {
  const first = splitAt(barUnits, beatUnits);
  let t = 0;
  for (const n of rh) {
    const bar = Math.floor(t / barUnits);
    const pos = t - bar * barUnits;
    const strong = pos === 0 || (barUnits === 32 && pos === 16);
    const cadence = bar % 4 >= 2;
    if (!n.rest && n.pitches.length === 1 && n.length >= beatUnits && strong && cadence && Math.random() < THIRDS_RATE) {
      const chord = harmony[bar].length > 1 && pos >= first ? harmony[bar][1] : harmony[bar][0];
      const tones = chordDegrees(chord);
      const top = n.pitches[0];
      const under = [top - 2, top - 5].filter((p) => p > floor && tones.includes(degreeOf(key, p)));
      if (under.length) {
        const low = pick(under);
        const alter = chordAlter(chord, degreeOf(key, low));
        n.pitches = [low, top];
        n.alters = [alter, n.alters?.[0] ?? 0];
      }
    }
    t += n.length;
  }
}

/** A dynamic on the first note each four-bar phrase begins with, in whichever hand has the tune there. */
function addDynamics(rh: PianoNote[], lh: PianoNote[], barUnits: number) {
  const scheme = pick(DYNAMIC_SCHEMES);
  const phrases = new Map<number, PianoNote>();
  for (const hand of [rh, lh]) {
    let t = 0;
    for (const n of hand) {
      const phrase = Math.floor(t / (4 * barUnits));
      if (!n.rest && !phrases.has(phrase)) phrases.set(phrase, n);
      t += n.length;
    }
  }
  for (const [phrase, n] of phrases) n.dynamic = scheme[phrase % scheme.length];
}

const ALTER_NAME: Record<number, string> = { [-1]: "flat", 0: "natural", 1: "sharp", 2: "double-sharp", [-2]: "double-flat" };

function asVoice(notes: PianoNote[], which: "top" | "bottom", key: string): VoiceNote[] {
  return notes.map((n) => {
    if (n.rest || !n.pitches.length) return { pitchValue: 0, length: n.length, rest: true, name: "", degree: 0 };
    const i = n.pitches.indexOf(which === "top" ? Math.max(...n.pitches) : Math.min(...n.pitches));
    const p = n.pitches[i];
    return { pitchValue: p, length: n.length, rest: false, name: "", degree: 0, accidental: ALTER_NAME[keyAlter(key, p) + (n.alters?.[i] ?? 0)] };
  }) as unknown as VoiceNote[];
}

/** Rests side by side in a bar become one: two quarter rests read as a half. */
export function mergeRests(notes: PianoNote[], barUnits: number): PianoNote[] {
  return barsOf(notes, barUnits).flatMap((bar) => {
    const out: PianoNote[] = [];
    for (const n of bar) {
      const last = out[out.length - 1];
      const merged = last?.rest && n.rest ? last.length + n.length : 0;
      // Only to a length one rest can show: a half, a dotted half, a whole.
      if (last && merged && [16, 24, 32].includes(merged)) last.length = merged;
      else out.push({ ...n });
    }
    return out;
  });
}

/** Each chord's lowest (or highest) note in a hand, held for the chord: what the ear follows of an accompaniment figure. */
function spanLine(notes: PianoNote[], spans: ChordSpan[], which: "top" | "bottom", key: string): VoiceNote[] {
  const evs: { start: number; n: PianoNote }[] = [];
  let t = 0;
  for (const n of notes) {
    evs.push({ start: t, n });
    t += n.length;
  }
  let at = 0;
  return asVoice(
    spans.map((span) => {
      const inSpan = evs.filter((e) => e.start >= at && e.start < at + span.length && !e.n.rest && e.n.pitches.length);
      at += span.length;
      if (!inSpan.length) return { pitches: [], length: span.length, rest: true };
      const pairs = inSpan.flatMap((e) => e.n.pitches.map((p, i) => ({ p, alter: e.n.alters?.[i] ?? 0 })));
      const best = pairs.reduce((a, b) => ((which === "top" ? b.p > a.p : b.p < a.p) ? b : a));
      return { pitches: [best.p], alters: [best.alter], length: span.length };
    }),
    which,
    key,
  );
}

/**
 * The two lines parallels are judged between: the tune and the bass the ear
 * follows. Under a pattern that is each chord's lowest note (an Alberti or
 * broken figure's other notes are the chord, not a line); with the tune in
 * the left hand, the tune against the right hand's top note; when the hands
 * take turns, the two tunes as written.
 */
function outerLines(ex: PianoExercise): VoiceNote[][] {
  if (!ex.spans.length) return [asVoice(ex.rh, "top", ex.key), asVoice(ex.lh, "bottom", ex.key)];
  if (ex.tuneHand === "left") return [spanLine(ex.rh, ex.spans, "top", ex.key), asVoice(ex.lh, "bottom", ex.key)];
  return [asVoice(ex.rh, "top", ex.key), spanLine(ex.lh, ex.spans, "bottom", ex.key)];
}

const total = (notes: PianoNote[]) => notes.reduce((s, n) => s + n.length, 0);

/** What is wrong with a finished exercise, or null. */
export function pianoFault(ex: PianoExercise, barUnits: number): string | null {
  const want = ex.measures * barUnits;
  if (total(ex.rh) !== want || total(ex.lh) !== want) return "a hand does not fill its bars";
  for (const hand of [ex.rh, ex.lh]) if (barsOf(hand, barUnits).some((b) => total(b) !== barUnits)) return "a bar is not full";
  if (parallelFaults(outerLines(ex), ex.key) > 0) return "parallel fifths or octaves between the tune and the bass";
  return null;
}

function writeOnce(settings: PianoSettings, key: string, meter: string, pattern: Accompaniment, tuneHand: Hand, title: string, barsPerLine?: number): PianoExercise | null {
  const ts = timeSignatureFor(meter);
  const barUnits = ts.tsPerMeasure;
  const beatUnits = beatUnitOf(meter);
  const { measures } = settings;
  const right = rightHandPosition(key, settings.reach);
  // The tune in the left hand reads in its own position, thumb up from the tonic in the bass.
  const leftTune = leftHandPosition(key);
  /**
   * The tune is checked against the accompaniment it will have as soon as it
   * is written: the progression writer knows the chords but not where the
   * bass is, so a tune stepping from chord note to chord note can move in
   * fifths with the bass (in F, C over F to F over B flat). Against the real
   * figure, not just the roots: block chords and Alberti put inversions in
   * the bass.
   */
  const fits = (r: RhythmWithPattern[], l: ProgressionLine) => {
    const line = asNotes(r, l);
    if (augmentedSecond(key, line)) return false;
    if (!settings.together) return true;
    const sp = spansOf(l.harmony, barUnits, beatUnits);
    if (tuneHand === "left") {
      const chords = writeLeftHand(key, sp, pattern as LeftHandPattern, beatUnits, RIGHT_HAND_CHORD_RANGE);
      return parallelFaults([spanLine(chords, sp, "top", key), asVoice(line, "bottom", key)], key) === 0;
    }
    const acc = writeLeftHand(key, sp, pattern as LeftHandPattern, beatUnits);
    return parallelFaults([asVoice(line, "top", key), spanLine(acc, sp, "bottom", key)], key) === 0;
  };
  const main =
    tuneHand === "left"
      ? tune(settings, key, meter, leftTune.low, leftTune.low + settings.reach, fits)
      : tune(settings, key, meter, right.low, right.high, fits);
  if (!main) return null;
  let rh = mergeRests(asNotes(main.rhythm, main.line), barUnits);
  let lh: PianoNote[];
  let spans: ChordSpan[] = [];
  if (!settings.together) {
    // Hands take turns, two bars each: one tune passed between them, the left
    // hand's bars the same notes in its own position, so a phrase the right
    // hand begins the left hand answers.
    const shift = right.low - leftTune.low;
    const rBars = barsOf(rh, barUnits);
    const rhOut: PianoNote[] = [];
    const lhOut: PianoNote[] = [];
    for (let b = 0; b < measures; b++) {
      const rightTurn = Math.floor(b / 2) % 2 === 0;
      rhOut.push(...(rightTurn ? rBars[b] : restBar(barUnits)));
      lhOut.push(...(rightTurn ? restBar(barUnits) : rBars[b].map((n) => ({ ...n, pitches: n.pitches.map((p) => p - shift) }))));
    }
    rh = rhOut;
    lh = lhOut;
  } else if (tuneHand === "left") {
    // The right hand plays the chords above middle C, the left hand the tune.
    spans = spansOf(main.line.harmony, barUnits, beatUnits);
    lh = rh;
    rh = writeLeftHand(key, spans, pattern as LeftHandPattern, beatUnits, RIGHT_HAND_CHORD_RANGE);
  } else {
    spans = spansOf(main.line.harmony, barUnits, beatUnits);
    lh = writeLeftHand(key, spans, pattern as LeftHandPattern, beatUnits);
    if (settings.doubleNotes) addDoubleNotes(rh, main.line.harmony, key, barUnits, beatUnits, Math.max(...lh.flatMap((n) => n.pitches)));
  }
  if (settings.dynamics) addDynamics(tuneHand === "left" ? lh : rh, tuneHand === "left" ? rh : lh, barUnits);
  const ex: PianoExercise = {
    settings,
    key,
    minor: key.endsWith("m"),
    meter,
    measures,
    bpm: settings.bpm,
    progression: main.line.progression.label,
    harmony: main.line.harmony,
    pattern,
    tuneHand,
    spans,
    rh,
    lh,
    abc: "",
  };
  ex.abc = assemblePianoAbc({ key, meter, barUnits, bpm: settings.bpm, title, rh, lh, barsPerLine });
  return ex;
}

/** Draw an accompaniment pattern for a meter: the settings' first most of the time. */
export function drawPattern(settings: PianoSettings, meter: string): LeftHandPattern {
  const ps = patternsFor(settings, meter);
  if (ps.length === 1 || Math.random() < FIRST_PATTERN) return ps[0];
  return pick(ps.slice(1));
}

export function generatePianoExercise(params: PianoParams): PianoExercise {
  const settings = params.settings ?? settingsFor(params.levelId ?? "piano-01");
  if (!settings.keys.length) throw new Error("Choose at least one key.");
  if (!settings.meters.length) throw new Error("Choose at least one meter.");
  const key = params.key && settings.keys.includes(params.key) ? params.key : pick(settings.keys);
  const meter = params.meter && settings.meters.includes(params.meter) ? params.meter : pick(settings.meters);
  const barUnits = timeSignatureFor(meter).tsPerMeasure;
  const level = params.levelId ? pianoLevelById[params.levelId] : null;
  const title = params.title ?? (level ? `${level.label} · ${keyWords(key)}` : keyWords(key));
  let lastFault = "no tune fits the chords, rhythms and reach chosen";
  for (let a = 0; a < ATTEMPTS; a++) {
    const tuneHand: Hand = !settings.together ? "right" : settings.tuneHand === "either" ? (Math.random() < 0.5 ? "left" : "right") : settings.tuneHand;
    // With the tune in the left hand the right hand holds the chords, or plays them on each beat.
    const offered = tuneHand === "left" ? RIGHT_HAND_CHORDS : patternsFor(settings, meter);
    const pattern: Accompaniment = !settings.together
      ? "tune"
      : params.pattern && offered.includes(params.pattern)
        ? params.pattern
        : tuneHand === "left"
          ? pick(RIGHT_HAND_CHORDS)
          : drawPattern(settings, meter);
    const ex = writeOnce(settings, key, meter, pattern, tuneHand, title, params.barsPerLine);
    if (!ex) continue;
    const fault = pianoFault(ex, barUnits);
    if (!fault) return ex;
    lastFault = fault;
  }
  throw new Error(`Could not write an exercise in ${keyName(key)}, ${meter}: ${lastFault}.`);
}
