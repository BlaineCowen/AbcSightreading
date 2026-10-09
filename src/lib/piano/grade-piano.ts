/**
 * Grading a piano exercise played on a MIDI keyboard.
 *
 * A keyboard says exactly which key went down and when, so unlike singing
 * (grade.ts) there is no pitch to estimate: a note is right or it is not, and
 * the question is when. In time (`gradeInTime`): a count-in and a click,
 * the exercise played through, and afterwards each written note matched to
 * a key pressed with the same pitch nearest its time. Full credit within the
 * onset window, falling to nothing at three times it. A key pressed that
 * matches no note is an extra (a wrong note, or one too many) and costs a
 * note. (A Note by note mode, the score waiting on each note, was taken off:
 * a pianist reads at a tempo. Blaine, 9 October 2026.)
 */
import { keyAlter } from "./assemble";
import type { PianoExercise } from "./generatePiano";

export type Hand = "rh" | "lh";

/** One written note, in time units (32nds) from the start of the exercise. */
export interface ExpectedNote {
  hand: Hand;
  /** Its place in that hand's notes (PianoExercise rh/lh), for marking the score. */
  index: number;
  midi: number;
  /** The written pitch (noteArray index, C2 = 0), for placing marks by staff steps. */
  pitch: number;
  start: number;
  length: number;
}

/** A key the player pressed: its MIDI note and when, in ms on the performance.now() clock. */
export interface PlayedNote {
  midi: number;
  t: number;
}

const LETTER_SEMI = [0, 2, 4, 5, 7, 9, 11];

/** A noteArray pitch (C2 = 0, middle C 14) as MIDI (C2 = 36, middle C 60), with the key's and its own alteration. */
export function midiOf(key: string, pitch: number, alter = 0): number {
  return 36 + Math.floor(pitch / 7) * 12 + LETTER_SEMI[((pitch % 7) + 7) % 7] + keyAlter(key, pitch) + alter;
}

/** Every note of an exercise, both hands, in time order. */
export function expectedNotes(ex: Pick<PianoExercise, "key" | "rh" | "lh">): ExpectedNote[] {
  const out: ExpectedNote[] = [];
  for (const [hand, notes] of [["rh", ex.rh], ["lh", ex.lh]] as const) {
    let t = 0;
    notes.forEach((n, index) => {
      if (!n.rest) n.pitches.forEach((p, i) => out.push({ hand, index, midi: midiOf(ex.key, p, n.alters?.[i] ?? 0), pitch: p, start: t, length: n.length }));
      t += n.length;
    });
  }
  return out.sort((a, b) => a.start - b.start || a.midi - b.midi);
}

export type PianoStrictness = "easy" | "standard" | "strict";

/**
 * The onset window, in beats: full credit inside it, nothing at three times
 * it. Tighter than singing's (a quarter, an eighth, a sixteenth of a beat
 * against half, a quarter, an eighth): a key's attack is exact, a voice's is
 * not.
 */
export const PIANO_STRICTNESS: Record<PianoStrictness, { label: string; onsetBeats: number }> = {
  easy: { label: "Easy", onsetBeats: 0.25 },
  standard: { label: "Standard", onsetBeats: 0.125 },
  strict: { label: "Strict", onsetBeats: 0.0625 },
};

export type NoteVerdict = "right" | "early" | "late" | "missed";

export interface NoteResult extends ExpectedNote {
  verdict: NoteVerdict;
  /** 0 to 1. */
  credit: number;
  /** Played minus written, in beats (absent when missed). */
  offBeats?: number;
  /** A key pressed near it that it did not match: what was played instead. */
  playedInstead?: number;
  /** When that key went down, against the written time, in beats. */
  playedAt?: number;
}

export interface PianoResult {
  notes: NoteResult[];
  /** Keys pressed that matched no note. */
  extras: PlayedNote[];
  /** The extras not already shown as a note's `playedInstead`: keys with no written note to answer. */
  strays: PlayedNote[];
  /** 0-100: the share of written notes played, the right pitch. */
  notesScore: number;
  /** 0-100: how close in time the notes played were. */
  timingScore: number;
  /** 0-100: every note's credit, an extra counting as a note scored 0. */
  overall: number;
  byHand: Record<Hand, { notes: number; right: number }>;
}

/**
 * Match each written note to a key of the same pitch, nearest in time,
 * within three onset windows; each key matches one note at most. Pairs are
 * taken nearest first, so a key half way between two of the same note goes to
 * the one it is nearer, and an early key cannot take a later note's match.
 */
export function gradeInTime(
  expected: ExpectedNote[],
  played: PlayedNote[],
  o: { t0: number; bpm: number; beatUnits: number; strictness: PianoStrictness },
): PianoResult {
  const beatMs = 60_000 / Math.max(1, o.bpm);
  const unitMs = beatMs / o.beatUnits;
  const win = PIANO_STRICTNESS[o.strictness].onsetBeats * beatMs;
  const at = (n: ExpectedNote) => o.t0 + n.start * unitMs;
  const pairs: { e: number; p: number; dt: number }[] = [];
  expected.forEach((n, e) =>
    played.forEach((k, p) => {
      if (k.midi !== n.midi) return;
      const dt = k.t - at(n);
      if (Math.abs(dt) <= 3 * win) pairs.push({ e, p, dt });
    }),
  );
  pairs.sort((a, b) => Math.abs(a.dt) - Math.abs(b.dt));
  const byNote = new Map<number, number>();
  const usedKey = new Set<number>();
  for (const pr of pairs) {
    if (byNote.has(pr.e) || usedKey.has(pr.p)) continue;
    byNote.set(pr.e, pr.dt);
    usedKey.add(pr.p);
  }
  const extras = played.filter((_, p) => !usedKey.has(p));
  const instead = new Set<PlayedNote>();
  const notes: NoteResult[] = expected.map((n, e) => {
    const dt = byNote.get(e);
    if (dt === undefined) {
      // What was played instead: an unmatched key nearest its time, within the window
      // (not one another note of this chord already claimed).
      const near = extras
        .filter((k) => !instead.has(k) && Math.abs(k.t - at(n)) <= 3 * win)
        .sort((a, b) => Math.abs(a.t - at(n)) - Math.abs(b.t - at(n)) || Math.abs(a.midi - n.midi) - Math.abs(b.midi - n.midi))[0];
      if (near) instead.add(near);
      return { ...n, verdict: "missed", credit: 0, ...(near ? { playedInstead: near.midi, playedAt: (near.t - at(n)) / beatMs } : {}) };
    }
    const off = Math.abs(dt);
    const credit = off <= win ? 1 : Math.max(0, 1 - (off - win) / (2 * win));
    const verdict: NoteVerdict = off <= win ? "right" : dt < 0 ? "early" : "late";
    return { ...n, verdict, credit, offBeats: dt / beatMs };
  });
  const matched = notes.filter((n) => n.verdict !== "missed");
  const sum = notes.reduce((s, n) => s + n.credit, 0);
  const byHand: PianoResult["byHand"] = { rh: { notes: 0, right: 0 }, lh: { notes: 0, right: 0 } };
  for (const n of notes) {
    byHand[n.hand].notes++;
    if (n.verdict !== "missed") byHand[n.hand].right++;
  }
  return {
    notes,
    extras,
    strays: extras.filter((k) => !instead.has(k)),
    notesScore: expected.length ? Math.round((100 * matched.length) / expected.length) : 0,
    timingScore: matched.length ? Math.round((100 * matched.reduce((s, n) => s + n.credit, 0)) / matched.length) : 0,
    overall: expected.length ? Math.round((100 * sum) / (expected.length + extras.length)) : 0,
    byHand,
  };
}

/** How far off, as a musician says it: the nearest everyday fraction of a beat ("¼ beat late"). */
export function beatsWords(offBeats: number): string {
  const FRACTIONS: [number, string][] = [[1 / 16, "1/16"], [1 / 8, "⅛"], [1 / 6, "⅙"], [1 / 4, "¼"], [1 / 3, "⅓"], [1 / 2, "½"], [2 / 3, "⅔"], [3 / 4, "¾"], [1, "1"]];
  const a = Math.abs(offBeats);
  const [, f] = FRACTIONS.reduce((best, c) => (Math.abs(c[0] - a) < Math.abs(best[0] - a) ? c : best));
  return a > 1.25 ? `${a.toFixed(1)} beats ${offBeats < 0 ? "early" : "late"}` : `${f} beat ${offBeats < 0 ? "early" : "late"}`;
}

const NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
/** A MIDI note by name, middle C as C4. */
export const midiName = (m: number) => `${NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;
