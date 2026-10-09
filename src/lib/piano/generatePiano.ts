/**
 * Piano sight reading: harmony first, then the right hand's tune over it,
 * then the left hand playing the same chords in the level's pattern.
 *
 * The tune comes from the Unison page's progression writer
 * (unison-progressions.ts writeProgressionLine) inside the right hand's
 * position, over the piano's own progressions (levels.ts). The left hand
 * reads the progression the tune was written over (left-hand.ts), so on every
 * beat both hands are on one chord and the bass has its root. At levels 1-2
 * the hands take turns, two bars each, each hand a five-finger tune.
 *
 * A finished exercise is checked (bars full, the tune inside its position, no
 * parallel fifths or octaves between the tune and the bass) and drawn again
 * on a fault.
 */
import { generateRandomRhythm } from "../rhythm-generation";
import { writeProgressionLine, splitAt, type ProgressionLine } from "../unison-progressions";
import { selectableRhythms } from "../selectable-rhythms";
import { chords as chordTable } from "../../resources/chords";
import { noteArray } from "../../resources/noteArray";
import { beatUnitOf, timeSignatureFor } from "../meter";
import { parallelFaults } from "../parallel-check";
import type { RhythmWithPattern, VoiceNote } from "../types";
import { PIANO_PROGRESSIONS, patternsFor, pianoLevelById, PIANO_LEVELS, RIGHT_HAND_CHORDS, type LeftHandPattern, type PianoLevel } from "./levels";
import { writeLeftHand, RIGHT_HAND_CHORD_RANGE, type ChordSpan, type PianoNote } from "./left-hand";
import { bassRoot, chordDegrees, degreeOf, leftHandPosition, rightHandPosition } from "./voicing";
import { assemblePianoAbc, barsOf } from "./assemble";

export interface PianoParams {
  levelId: string;
  key?: string;
  meter?: string;
  measures?: number;
  /** A left-hand pattern of the level's, instead of a drawn one. */
  pattern?: LeftHandPattern;
  /** Which hand has the tune, where the level lets it move (`leftHandTune`): right by default. */
  tuneHand?: TuneHand | "either";
  bpm?: number;
  barsPerLine?: number;
}

export type TuneHand = "right" | "left";

export interface PianoExercise {
  level: PianoLevel;
  key: string;
  meter: string;
  measures: number;
  bpm: number;
  progression: string;
  /** Chord names, bar by bar (one or two a bar). */
  harmony: string[][];
  pattern: LeftHandPattern;
  tuneHand: TuneHand;
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
/** How often a level's first left-hand pattern is drawn, the rest sharing what is left. */
const FIRST_PATTERN = 0.6;
/** How often an eligible long note at a cadence takes a third or sixth under it (level 8). */
const THIRDS_RATE = 0.6;

const pick = <T>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];

type LineNote = { name: string; degree: number; pitchValue: number };

/** The notes of a key from `low` to `high`, as the progression writer reads them. */
function noteList(key: string, low: number, high: number): LineNote[] {
  const out: LineNote[] = [];
  for (let pv = low; pv <= high; pv++) out.push({ name: noteArray[pv], degree: degreeOf(key, pv), pitchValue: pv });
  return out;
}

function rhythmsFor(level: PianoLevel, barUnits: number) {
  return selectableRhythms.filter(
    (r) => level.rhythms.includes(r.name) && r.totalValue <= barUnits && (r as any).meterKind !== "compound",
  );
}

/** A rhythm and a tune over it in [low, high], over a given progression or a drawn one. */
function tune(
  level: PianoLevel,
  key: string,
  meter: string,
  measures: number,
  low: number,
  high: number,
  progressionId?: string,
  /** A test the line must pass, or another rhythm and line are drawn. */
  accept: (rhythm: RhythmWithPattern[], line: ProgressionLine) => boolean = () => true,
): { rhythm: RhythmWithPattern[]; line: ProgressionLine } | null {
  const ts = timeSignatureFor(meter);
  const rhythms = rhythmsFor(level, ts.tsPerMeasure);
  const chords = chordTable.filter((c) => level.chords.includes(c.name));
  for (let a = 0; a < LINE_DRAWS; a++) {
    let rhythm: RhythmWithPattern[];
    try {
      rhythm = generateRandomRhythm(ts as any, measures, rhythms, Array(Math.ceil(measures / 4)).fill({ type: "V-I" }), true, false);
    } catch {
      continue;
    }
    const line = writeProgressionLine({
      noteList: noteList(key, low, high),
      scaleDegrees: [0, 1, 2, 3, 4, 5, 6],
      chords,
      rhythm,
      barUnits: ts.tsPerMeasure,
      beatUnits: beatUnitOf(meter),
      measures,
      minor: false,
      policy: { kind: "max", maxSkip: level.maxSkip },
      // An eighth moves by step, as a beginner reads it.
      shortCaps: { eighth: 1, sixteenth: 1 },
      progressions: PIANO_PROGRESSIONS,
      progressionId,
    });
    if (line && accept(rhythm, line)) return { rhythm, line };
  }
  return null;
}

/**
 * Does a tune move in fifths or octaves with the chords' roots? Checked as
 * soon as the line is written, before any left hand is built: the progression
 * writer knows the chords but not where the bass is, so a tune stepping from
 * chord note to chord note can shadow the roots (in F, C over F to F over B
 * flat), and it was drawing a whole exercise again, twelve times, and
 * sometimes failing.
 */
function shadowsRoots(key: string, rhythm: RhythmWithPattern[], line: ProgressionLine, barUnits: number, beatUnits: number): boolean {
  const spans = spansOf(line.harmony, barUnits, beatUnits);
  const roots: PianoNote[] = spans.map((s) => ({ pitches: [bassRoot(key, chordDegrees(s.name)[0])], length: s.length }));
  return parallelFaults([asVoice(asNotes(rhythm, line), "top"), asVoice(roots, "bottom")], key) > 0;
}

/** One note per rhythm slot. */
function asNotes(rhythm: RhythmWithPattern[], line: ProgressionLine): PianoNote[] {
  return rhythm.map((r, i) => (r.rest ? { pitches: [], length: r.totalValue, rest: true } : { pitches: [line.notes[i].pitchValue], length: r.totalValue }));
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
 * Level 8: on a long note on a strong beat in a phrase's last two bars, a
 * chord tone a third or sixth under the tune, kept above the left hand. The
 * tune stays the top note.
 */
function addThirds(rh: PianoNote[], harmony: string[][], key: string, barUnits: number, beatUnits: number, floor: number) {
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
      if (under.length) n.pitches = [pick(under), top];
    }
    t += n.length;
  }
}

function asVoice(notes: PianoNote[], which: "top" | "bottom"): VoiceNote[] {
  return notes.map((n) => ({
    pitchValue: n.rest || !n.pitches.length ? 0 : which === "top" ? Math.max(...n.pitches) : Math.min(...n.pitches),
    length: n.length,
    rest: !!n.rest || !n.pitches.length,
    name: "",
    degree: 0,
  })) as unknown as VoiceNote[];
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
function spanLine(notes: PianoNote[], spans: ChordSpan[], which: "top" | "bottom"): VoiceNote[] {
  const evs: { start: number; pitches: number[] }[] = [];
  let t = 0;
  for (const n of notes) {
    evs.push({ start: t, pitches: n.rest ? [] : n.pitches });
    t += n.length;
  }
  let at = 0;
  return asVoice(
    spans.map((span) => {
      const inSpan = evs.filter((e) => e.start >= at && e.start < at + span.length).flatMap((e) => e.pitches);
      at += span.length;
      if (!inSpan.length) return { pitches: [], length: span.length, rest: true };
      return { pitches: [which === "top" ? Math.max(...inSpan) : Math.min(...inSpan)], length: span.length };
    }),
    which,
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
  if (!ex.spans.length) return [asVoice(ex.rh, "top"), asVoice(ex.lh, "bottom")];
  if (ex.tuneHand === "left") return [spanLine(ex.rh, ex.spans, "top"), asVoice(ex.lh, "bottom")];
  return [asVoice(ex.rh, "top"), spanLine(ex.lh, ex.spans, "bottom")];
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

function writeOnce(level: PianoLevel, key: string, meter: string, measures: number, pattern: LeftHandPattern, tuneHand: TuneHand, bpm: number, barsPerLine?: number): PianoExercise | null {
  const ts = timeSignatureFor(meter);
  const barUnits = ts.tsPerMeasure;
  const beatUnits = beatUnitOf(meter);
  const right = rightHandPosition(key, level.reach);
  // The tune in the left hand reads in its own position, thumb up from the tonic in the bass.
  const leftTune = leftHandPosition(key);
  const main =
    tuneHand === "left"
      ? tune(level, key, meter, measures, leftTune.low, leftTune.low + level.reach)
      : tune(level, key, meter, measures, right.low, right.high, undefined, (r, l) =>
          !level.together || !shadowsRoots(key, r, l, barUnits, beatUnits));
  if (!main) return null;
  let rh = mergeRests(asNotes(main.rhythm, main.line), barUnits);
  let lh: PianoNote[];
  let spans: ChordSpan[] = [];
  if (!level.together) {
    // Hands take turns, two bars each: one tune passed between them, the left
    // hand's bars the same notes in its own five-finger position, so a phrase
    // the right hand begins the left hand answers.
    const left = leftHandPosition(key);
    const shift = right.low - left.low;
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
    rh = writeLeftHand(key, spans, pattern, beatUnits, RIGHT_HAND_CHORD_RANGE);
  } else {
    spans = spansOf(main.line.harmony, barUnits, beatUnits);
    lh = writeLeftHand(key, spans, pattern, beatUnits);
    if (level.rightHandThirds) addThirds(rh, main.line.harmony, key, barUnits, beatUnits, Math.max(...lh.flatMap((n) => n.pitches)));
  }
  const ex: PianoExercise = {
    level,
    key,
    meter,
    measures,
    bpm,
    progression: main.line.progression.label,
    harmony: main.line.harmony,
    pattern,
    tuneHand,
    spans,
    rh,
    lh,
    abc: "",
  };
  ex.abc = assemblePianoAbc({ key, meter, barUnits, bpm, title: `${level.label} · ${key} major`, rh, lh, barsPerLine });
  return ex;
}

/** Draw a left-hand pattern for a level and meter: the level's first most of the time. */
export function drawPattern(level: PianoLevel, meter: string): LeftHandPattern {
  const ps = patternsFor(level, meter);
  if (!level.together) return "tune";
  if (ps.length === 1 || Math.random() < FIRST_PATTERN) return ps[0];
  return pick(ps.slice(1));
}

export function generatePianoExercise(params: PianoParams): PianoExercise {
  const level = pianoLevelById[params.levelId] ?? PIANO_LEVELS[0];
  const key = params.key && level.keys.includes(params.key) ? params.key : pick(level.keys);
  const meter = params.meter && level.meters.includes(params.meter) ? params.meter : level.meters[0];
  const measures = params.measures ?? level.measures;
  const bpm = params.bpm ?? level.bpm;
  const barUnits = timeSignatureFor(meter).tsPerMeasure;
  let lastFault = "no line fits";
  for (let a = 0; a < ATTEMPTS; a++) {
    const asked = params.tuneHand ?? "right";
    const tuneHand: TuneHand = !level.leftHandTune ? "right" : asked === "either" ? (Math.random() < 0.5 ? "left" : "right") : asked;
    // With the tune in the left hand the right hand holds the chords, or plays them on each beat.
    const offered = tuneHand === "left" ? RIGHT_HAND_CHORDS : patternsFor(level, meter);
    const pattern =
      params.pattern && offered.includes(params.pattern) ? params.pattern : tuneHand === "left" ? pick(RIGHT_HAND_CHORDS) : drawPattern(level, meter);
    const ex = writeOnce(level, key, meter, measures, level.together ? pattern : "tune", tuneHand, bpm, params.barsPerLine);
    if (!ex) continue;
    const fault = pianoFault(ex, barUnits);
    if (!fault) return ex;
    lastFault = fault;
  }
  throw new Error(`Could not write a ${level.label} exercise in ${key} ${meter}: ${lastFault}`);
}
