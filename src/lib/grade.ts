import { scoreFromAbc } from "./musicxml";
import { midiOf } from "./tools/context";
import type { HistoryPoint } from "./tuner/pitch-history";

/**
 * Grade: sing the Unison exercise into the microphone, one note at a time.
 *
 * Built on the scale challenge (tuner/scale-challenge.ts), made for reading
 * rather than drilling a scale: the cursor waits on each note until it is sung
 * (in any octave, so a tenor can read a treble line) and held for as long as it
 * is written; how quickly each note was found is what the score mostly
 * measures, with some room on intonation; and a note can only lose so much, so
 * one note someone was stuck on does not sink the exercise.
 *
 * The numbers here are starting points, meant to be tuned by singing.
 * Tests: tests/unit/grade.test.ts.
 */

/** Within this of the target, in any octave, counts as the note: half a semitone. */
export const TOLERANCE_CENTS = 50;
/**
 * How long a note must be on pitch to earn its credit: a moment, whatever its
 * length. Holding the whole written length felt too long (the detector takes a
 * moment to lock on), and half of it moved the cursor on ahead of the beat.
 * Now the credit comes quickly and the cursor keeps time: see noteMsFor.
 */
export const CREDIT_MS = 250;
/** Never more than this share of a short note, so a quick eighth can still be caught. */
export const CREDIT_SHARE = 0.8;
/** Shortest credit asked for: detection needs about this long to be sure. */
export const MIN_CREDIT_MS = 150;
/** A hold survives a lapse this long (a consonant, a vibrato swing). */
export const HOLD_GRACE_MS = 250;
/** Finding a note within this many beats of it being shown costs nothing. */
export const FREE_FIND_BEATS = 1;
/** Each further beat of hunting costs this many points, */
export const FIND_POINTS_PER_BEAT = 25;
/** up to this many. */
export const FIND_MAX = 50;
/** Held this close to the target, intonation costs nothing; */
export const FREE_CENTS = 20;
/** each cent further costs a point, up to this many. */
export const CENTS_MAX = 25;
/** Hearing the note itself: the most the note can then score. */
export const HELP_NOTE_CAP = 50;
/** Hearing the tonic or the tonic chord: points off, once per note. */
export const HELP_KEY_COST = 10;
/** No note loses more than this, however stuck; a skipped note loses exactly this. */
export const MAX_LOSS = 60;

/**
 * One note to sing. `cursor` is its place among the score's notes and rests;
 * `beats` its length in quarter notes; `startUnits` and `lengthUnits` where it
 * falls from the first downbeat and how long it is, in 32nd notes (the ABC's
 * L:1/32), for grading in time.
 */
export type GradeNote = { midi: number; beats: number; cursor: number; startUnits: number; lengthUnits: number };
/** A rest, for grading in time: singing through one is a rhythm fault. */
export type GradeRest = { cursor: number; startUnits: number; lengthUnits: number };

/**
 * The notes to sing and the rests between them, in order, from the exercise's
 * ABC: tied notes as one held note, and the playback transposition added so it
 * matches what the page plays.
 */
export function gradeSchedule(abc: string, transpose = 0): { notes: GradeNote[]; rests: GradeRest[]; totalUnits: number } {
  const score = scoreFromAbc(abc);
  const part = score.parts[0];
  const notes: GradeNote[] = [];
  const rests: GradeRest[] = [];
  if (!part) return { notes, rests, totalUnits: 0 };
  let cursor = 0;
  let at = 0;
  let tied: GradeNote | null = null;
  for (const measure of part.measures) {
    for (const n of measure.notes) {
      const here = cursor++;
      const start = at;
      at += n.length;
      if (n.rest || !n.pitch) {
        tied = null;
        const last = rests[rests.length - 1];
        // Rests in a row are one silence.
        if (last && last.startUnits + last.lengthUnits === start) last.lengthUnits += n.length;
        else rests.push({ cursor: here, startUnits: start, lengthUnits: n.length });
        continue;
      }
      if (tied && n.tieStop) {
        tied.beats += n.length / 8;
        tied.lengthUnits += n.length;
      } else {
        tied = { midi: midiOf(n.pitch) + transpose, beats: n.length / 8, cursor: here, startUnits: start, lengthUnits: n.length };
        notes.push(tied);
      }
      if (!n.tieStart) tied = null;
    }
  }
  return { notes, rests, totalUnits: at };
}

/**
 * The notes to sing, in order: rests left out (the singer rests; nothing
 * waits in Pitch only).
 */
export function gradeNotes(abc: string, transpose = 0): GradeNote[] {
  return gradeSchedule(abc, transpose).notes;
}

/** How far a sung pitch is from the target's pitch class, in cents, -600..600. */
export function centsOffAnyOctave(sungMidi: number, targetMidi: number): number {
  const c = ((((sungMidi - targetMidi) * 100) % 1200) + 1200) % 1200;
  return c > 600 ? c - 1200 : c;
}

/** A note's written length at this tempo (quarter notes a minute), in ms. */
export const noteMsFor = (beats: number, bpm: number) => (beats * 60_000) / Math.max(1, bpm);

/** How long a note must be on pitch to earn its credit. The cursor still waits out its written length. */
export const creditMsFor = (beats: number, bpm: number) =>
  Math.max(MIN_CREDIT_MS, Math.min(CREDIT_MS, noteMsFor(beats, bpm) * CREDIT_SHARE));

const SYLLABLES = ["do", "di", "re", "ri", "mi", "fa", "fi", "so", "si", "la", "li", "ti"];
/** Movable do for a pitch, given do's pitch class (the exercise's key). */
export const solfegeOf = (midi: number, doPc: number) => SYLLABLES[(((Math.round(midi) - doPc) % 12) + 12) % 12];

const STEP_NAMES = ["", "a half step", "a step", "a third", "a third", "a fourth", "a tritone"];

/**
 * What the card says while a note is waited on: the note sung, and which way
 * and how far to the one asked for, in solfège. "A little high" said nothing
 * about a singer who was a third away.
 */
export function guidance(o: { sung: number | null; target: number; doPc: number; onTarget: boolean }): string {
  const want = solfegeOf(o.target, o.doPc);
  if (o.onTarget) return "That's it, hold it";
  if (o.sung === null) return `Sing ${want}`;
  const cents = centsOffAnyOctave(o.sung, o.target);
  if (Math.abs(cents) < 100) return cents > 0 ? `Close: a little high for ${want}` : `Close: a little low for ${want}`;
  const semis = Math.round(-cents / 100);
  const way = semis > 0 ? "up" : "down";
  return `You're singing ${solfegeOf(o.sung, o.doPc)}. Go ${way} ${STEP_NAMES[Math.abs(semis)]} to ${want}`;
}

export type Help = { heardNote: boolean; heardKey: boolean };

export type NoteResult = {
  midi: number;
  /** Beats from the note being shown to the hold starting; null when skipped. */
  findBeats: number | null;
  /** Median signed cents over the hold, in any octave; null when skipped or unheard. */
  cents: number | null;
  help: Help;
  skipped: boolean;
  /** Passed by: the singer went on to the next note without singing this one. */
  missed?: boolean;
  score: number;
};

/** One note's score, 100 down to 100 - MAX_LOSS. `freeCents` from the strictness. */
export function noteScore(o: { findBeats: number | null; cents: number | null; help: Help; skipped?: boolean }, freeCents = FREE_CENTS): number {
  if (o.skipped || o.findBeats === null) return 100 - MAX_LOSS;
  const find = Math.min(FIND_MAX, Math.max(0, o.findBeats - FREE_FIND_BEATS) * FIND_POINTS_PER_BEAT);
  const tune = Math.min(CENTS_MAX, Math.max(0, Math.abs(o.cents ?? 0) - freeCents));
  let score = 100 - find - tune - (o.help.heardKey ? HELP_KEY_COST : 0);
  if (o.help.heardNote) score = Math.min(score, HELP_NOTE_CAP);
  return Math.round(Math.max(100 - MAX_LOSS, score));
}

/** Median cents over a completed hold, from the pitch history, in any octave. */
export function holdCents(points: HistoryPoint[], targetMidi: number, from: number, to: number): number | null {
  const errs: number[] = [];
  for (const p of points) {
    if (p.t < from || p.t > to || p.midi === null) continue;
    errs.push(centsOffAnyOctave(p.midi + p.cents / 100, targetMidi));
  }
  if (!errs.length) return null;
  errs.sort((a, b) => a - b);
  const m = errs.length >> 1;
  return Math.round(errs.length % 2 ? errs[m] : (errs[m - 1] + errs[m]) / 2);
}

export type GradeResult = { notes: NoteResult[]; score: number; letter: string };

export const letterFor = (score: number) =>
  score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 60 ? "D" : "F";

/** The exercise's score: the average of its notes. */
export function summarize(notes: NoteResult[]): GradeResult {
  const score = notes.length ? Math.round(notes.reduce((a, n) => a + n.score, 0) / notes.length) : 0;
  return { notes, score, letter: letterFor(score) };
}

// ── Two ways to grade ─────────────────────────────────────────────────────────

/**
 * Pitch only: the cursor waits on each note until it is sung (the rules
 * above). Pitch & rhythm ("performance"): the exercise runs in time with a
 * click, nothing waits, and the recording is graded afterwards for pitch and
 * for rhythm separately (gradePerformance).
 */
export type GradeMode = "pitch" | "performance";
export type Strictness = "easy" | "standard" | "strict";

/**
 * How lenient the grading is, chosen before starting. `cents`: how far off a
 * pitch may be and still be the note (any octave). `onsetBeats`: how early or
 * late a note may start for full rhythm credit, in beats. `freeCents`:
 * intonation inside this costs nothing. Starting points, to be tuned by singing.
 */
export const STRICTNESS: Record<Strictness, { label: string; cents: number; onsetBeats: number; freeCents: number }> = {
  easy: { label: "Easy", cents: 50, onsetBeats: 0.5, freeCents: 25 },
  standard: { label: "Standard", cents: 35, onsetBeats: 0.25, freeCents: 20 },
  strict: { label: "Strict", cents: 25, onsetBeats: 0.125, freeCents: 12 },
};

/**
 * How long after a sound the pitch detector reports it, in ms: subtracted from
 * every frame's time before it is compared with the music. Measured end to end
 * with the fake microphone (a WAV sung exactly in time).
 */
export const DETECT_LATENCY_MS = 110;
/** A note sung for less than this share of its length was cut short; */
export const CUT_SHORT_SHARE = 0.6;
/** which costs this many rhythm points. */
export const CUT_SHORT_COST = 25;
/** Voiced this long inside a rest is singing through it. */
export const REST_SUNG_MS = 150;

export type PerfNote = {
  midi: number;
  cursor: number;
  startUnits: number;
  lengthUnits: number;
  /** What was sung over the note, moved to the written note's octave; null when nothing was. */
  sung: number | null;
  /** Median cents from the target over the note, null when unsung. */
  cents: number | null;
  pitchOk: boolean;
  /** 0-100. */
  pitch: number;
  /** When the singer came in against the written onset, in beats (+ late); null when no onset was found. */
  onsetBeats: number | null;
  cutShort: boolean;
  missed: boolean;
  /** 0-100. */
  rhythm: number;
};
export type PerfRest = GradeRest & { sung: boolean };
export type PerfResult = { pitch: number; rhythm: number; overall: number; letter: string; notes: PerfNote[]; rests: PerfRest[] };

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const sungOf = (p: HistoryPoint) => (p.midi === null ? null : p.midi + p.cents / 100);

/**
 * Grade a run sung in time. `t0` is the first downbeat (performance.now ms),
 * `frames` the pitch history over the run; the bpm counts the meter's beat,
 * `beatUnits` 32nds (8 a quarter, 12 a dotted quarter).
 */
export function gradePerformance(
  schedule: { notes: GradeNote[]; rests: GradeRest[] },
  frames: HistoryPoint[],
  o: { t0: number; bpm: number; beatUnits: number; strictness: Strictness; latencyMs?: number },
): PerfResult {
  const tol = STRICTNESS[o.strictness];
  const beatMs = 60_000 / Math.max(1, o.bpm);
  const unitMs = beatMs / o.beatUnits;
  const lat = o.latencyMs ?? DETECT_LATENCY_MS;
  const pts = frames.map((p) => ({ t: p.t - lat, sung: sungOf(p), db: p.dbfs })).sort((a, b) => a.t - b.t);
  const within = (a: number, b: number) => pts.filter((p) => p.t >= a && p.t < b);
  const spacing = pts.length > 1 ? (pts[pts.length - 1].t - pts[0].t) / (pts.length - 1) : 20;

  // Where a sound starts: from silence, a new pitch, or a fresh attack (a repeated note).
  const onsets: number[] = [];
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i], q = pts[i - 1];
    if (p.sung === null) continue;
    const fromSilence = q.sung === null || p.t - q.t > 3 * spacing;
    const newPitch = q.sung !== null && Math.abs(p.sung - q.sung) > 0.7 && (pts[i + 1]?.sung == null || Math.abs(pts[i + 1].sung! - p.sung) < 0.5);
    const lookback = pts.slice(Math.max(0, i - 4), i).map((x) => x.db);
    const attack = lookback.length > 0 && p.db - Math.min(...lookback) >= 6;
    if (fromSilence || newPitch || attack) {
      if (!onsets.length || p.t - onsets[onsets.length - 1] > 60) onsets.push(p.t);
    }
  }

  const notes = schedule.notes.map((n, i): PerfNote => {
    const on = o.t0 + n.startUnits * unitMs;
    const dur = n.lengthUnits * unitMs;
    const off = on + dur;
    const all = within(on, off);
    const middle = within(on + Math.min(120, 0.25 * dur), off - 0.15 * dur);
    const voiced = middle.filter((p) => p.sung !== null);
    const share = middle.length ? voiced.length / middle.length : 0;
    const base: PerfNote = {
      midi: n.midi, cursor: n.cursor, startUnits: n.startUnits, lengthUnits: n.lengthUnits,
      sung: null, cents: null, pitchOk: false, pitch: 0, onsetBeats: null, cutShort: false, missed: true, rhythm: 0,
    };
    // Heard at all: a few frames are enough to judge its pitch (a short
    // note, or a held one let go early, which is judged cut short below).
    if (voiced.length < 3 || share < 0.1) return base;
    const offs = voiced.map((p) => centsOffAnyOctave(p.sung!, n.midi));
    const inTune = offs.filter((c) => Math.abs(c) <= tol.cents);
    const pitchOk = inTune.length >= offs.length / 2;
    const cents = Math.round(median(pitchOk ? inTune : offs)!);
    const pitch = pitchOk ? Math.round(100 - Math.min(CENTS_MAX, Math.max(0, Math.abs(cents) - tol.freeCents))) : 0;

    // Coming in: the onset nearest the written one, no further than halfway
    // into this note or back into the last.
    const prev = schedule.notes[i - 1];
    const prevDur = prev && prev.startUnits + prev.lengthUnits === n.startUnits ? prev.lengthUnits * unitMs : dur;
    const lo = on - Math.min(0.5 * prevDur, 3 * tol.onsetBeats * beatMs);
    const hi = on + Math.min(0.5 * dur, 3 * tol.onsetBeats * beatMs);
    let onset: number | null = null;
    for (const t of onsets) if (t >= lo && t <= hi && (onset === null || Math.abs(t - on) < Math.abs(onset - on))) onset = t;
    let rhythm: number;
    let onsetBeats: number | null = null;
    if (onset !== null) {
      onsetBeats = (onset - on) / beatMs;
      const err = Math.abs(onsetBeats);
      rhythm = err <= tol.onsetBeats ? 100 : Math.max(0, 100 * (1 - (err - tol.onsetBeats) / (2 * tol.onsetBeats)));
    } else {
      // Sounding, but no clear entry: the pitch carried on from just before
      // (a repeated note sung legato, or the last note sung on this pitch) is
      // fine, since it is the right pitch at the right time; otherwise half credit.
      const around = within(on - 150, on + 100);
      const carried = around.length > 0 && around.every((p) => p.sung !== null && Math.abs(centsOffAnyOctave(p.sung, n.midi)) <= tol.cents);
      rhythm = carried ? 100 : 50;
    }
    const sounded = all.length ? all.filter((p) => p.sung !== null).length / all.length : 0;
    const cutShort = sounded < CUT_SHORT_SHARE;
    if (cutShort) rhythm = Math.max(0, rhythm - CUT_SHORT_COST);
    const sungMid = median(voiced.map((p) => n.midi + centsOffAnyOctave(p.sung!, n.midi) / 100))!;
    return { ...base, sung: sungMid, cents, pitchOk, pitch, onsetBeats, cutShort, missed: false, rhythm: Math.round(rhythm) };
  });

  const rests = schedule.rests.map((r): PerfRest => {
    const on = o.t0 + r.startUnits * unitMs;
    const off = on + r.lengthUnits * unitMs;
    const inside = within(on + 80, off - 80);
    const voicedMs = inside.filter((p) => p.sung !== null).length * spacing;
    return { ...r, sung: voicedMs > REST_SUNG_MS };
  });
  return summarizePerformance(notes, rests);
}

/** The totals: pitch and rhythm each the average of their notes (a rest sung through counts as a 0 for rhythm), overall their mean. */
export function summarizePerformance(notes: PerfNote[], rests: PerfRest[]): PerfResult {
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);
  const pitch = avg(notes.map((n) => n.pitch));
  const rhythm = avg([...notes.map((n) => n.rhythm), ...rests.filter((r) => r.sung).map(() => 0)]);
  const overall = Math.round((pitch + rhythm) / 2);
  return { pitch, rhythm, overall, letter: letterFor(overall), notes, rests };
}

/** Scale steps from do for each semitone: chromatic notes fall halfway between. */
const STEP_OF_SEMITONE = [0, 0.5, 1, 1.5, 2, 3, 3.5, 4, 4.5, 5, 5.5, 6];

/**
 * Staff steps from `written` up to `sung` (each a MIDI number, fractions
 * allowed) in a key whose do has pitch class `doPc`: what the trace on the
 * score is drawn by, a step being half a staff space. Between two scale notes
 * it moves smoothly, so a flat note sits just below its line.
 */
export function stepsBetween(sung: number, written: number, doPc: number): number {
  const steps = (m: number) => {
    const rel = m - doPc;
    const oct = Math.floor(rel / 12);
    const within = rel - oct * 12;
    const lo = Math.floor(within);
    const frac = within - lo;
    const a = STEP_OF_SEMITONE[lo];
    const b = lo + 1 < 12 ? STEP_OF_SEMITONE[lo + 1] : 7;
    return oct * 7 + a + (b - a) * frac;
  };
  return steps(sung) - steps(written);
}
