import { writable, type Readable } from "svelte/store";
import { tuner } from "./tuner/store";
import { pitchHistory } from "./tuner/pitch-history";
import { NOTES } from "./tuner/pitch";
import type { HistoryPoint } from "./tuner/pitch-history";
import { playNotes } from "./tools/tone";
import {
  ATTEMPT_MS,
  CONFIRM_MS,
  CREDIT_MS,
  HOLD_GRACE_MS,
  SETTLE_MS,
  STRICTNESS,
  centsOffAnyOctave,
  gradePerformance,
  holdCents,
  noteScore,
  summarize,
  type GradeMode,
  type GradeNote,
  type GradeRest,
  type GradeResult,
  type PerfResult,
  type Strictness,
  type Help,
  type NoteResult,
} from "./grade";

/**
 * Runs one graded attempt at a Unison exercise (rules in grade.ts), in either
 * mode. Pitch only: a reference, then each note waited on, untimed, until it
 * is sung and held on pitch a moment; it scores by how it was found (right
 * first time, corrected, after hearing it, or skipped). Pitch & rhythm: a reference, then
 * the page runs the exercise in time (its count-in, cursor and click, no
 * melody) and the recording is graded at the end, pitch and rhythm apart. The scale challenge's runner is the model (a 50 ms
 * poll rather than a subscription or rAF, a run token so stale ticks bail, the
 * hold timed on the clock with a grace for lapses).
 *
 * What it draws on the page - the cursor, the count-in words, the click - it
 * asks the page for through `hooks`, so it knows nothing of the score.
 */
export type GradePhase = "idle" | "reference" | "countIn" | "sing" | "results";
export type Reference = "note" | "triad";
export type HelpKind = "note" | "tonic" | "triad";

export type GradeView = {
  phase: GradePhase;
  /** The note being sung, -1 outside the singing. */
  index: number;
  total: number;
  /** 0..1 of the current note's hold. */
  hold: number;
  onTarget: boolean;
  /** Live cents from the target in any octave, null when nothing is heard. */
  cents: number | null;
  /** What is being sung, as a MIDI number with cents, null when nothing is heard. */
  sung: number | null;
  /** The note asked for, null outside the singing. */
  target: number | null;
  /** A help sound is playing: the clock is stopped. */
  helping: boolean;
  /** The note has its credit; the cursor waits out its written length. */
  credited: boolean;
  result: GradeResult | null;
  /** Pitch & rhythm's result: pitch, rhythm and overall. */
  perf: PerfResult | null;
  mode: GradeMode;
};

/**
 * What the score is drawn from after a run (grade-feedback.ts): the pitch
 * track, and which note each moment of it belongs to - by time in Pitch &
 * rhythm, by the note being waited on in Pitch only.
 */
export type GradeTrace = {
  mode: GradeMode;
  frames: HistoryPoint[];
  /** For each note, the span of time its frames come from (performance.now ms). */
  spans: { from: number; to: number }[];
  /** Pitch & rhythm: each note's sung onset, in performance.now ms, when one was found. */
  onsets: (number | null)[];
  tolerance: number;
  /** Pitch & rhythm: the first downbeat (performance.now ms). */
  t0?: number;
};

export type GradeHooks = {
  /** Show the singer this note (an index into the notes), or none (-1). */
  moveTo: (noteIndex: number) => void;
  /** Count-in beat `beat` (0-based) of `total`; -1 when it ends. */
  countIn: (beat: number, total: number) => void;
  click: (downbeat: boolean) => void;
  /** The run is over: each note's score, in order, to mark on the score. */
  marked?: (scores: number[]) => void;
  /** Pitch & rhythm: start the exercise in time, from its count-in. Returns the first downbeat (performance.now ms). */
  startTimeline?: (o: { cursor: "off" | "smooth" | "beat" | "note"; click: "off" | "beat" | "sub" }) => number;
  stopTimeline?: () => void;
  /** The run is over: what was sung, to draw on the score. */
  traced?: (trace: GradeTrace) => void;
};

const TICK_MS = 50;
const IDLE: GradeView = { phase: "idle", index: -1, total: 0, hold: 0, onTarget: false, cents: null, sung: null, target: null, helping: false, credited: false, result: null, perf: null, mode: "pitch" };
const nameOf = (midi: number) => NOTES[((midi % 12) + 12) % 12];
const octaveOf = (midi: number) => Math.floor(midi / 12) - 1;
const midiOfHz = (hz: number, a4: number) => 69 + 12 * Math.log2(hz / a4);

export class GradeRunner {
  private view = writable<GradeView>(IDLE);
  readonly subscribe: Readable<GradeView>["subscribe"] = this.view.subscribe;

  private runId = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private timeouts: ReturnType<typeof setTimeout>[] = [];
  private notes: GradeNote[] = [];
  private results: NoteResult[] = [];
  private bpm = 60;
  private index = 0;
  private presentedAt = 0;
  private holdMs = 0;
  private holdStartedAt = 0;
  private offSince: number | null = null;
  private lastTickAt = 0;
  private helpUntil = 0;
  /** Credited: when the next note comes up. */
  private creditedAt = 0;
  /** The pitch being held now, and since when: a held pitch is an attempt. */
  private steady: { midi: number; since: number } | null = null;
  /** The first attempt at this note: its pitch, and whether it was the note. */
  private firstTry: { midi: number; right: boolean } | null = null;
  private help: Help = { heardNote: false, heardKey: false };
  private tonicTriad: number[] = [];
  private mode: GradeMode = "pitch";
  private strictness: Strictness = "standard";
  private rests: GradeRest[] = [];
  private beatUnits = 8;
  private startedAt = 0;
  /** Pitch only: when each note was waited on, for drawing what was sung. */
  private spans: { from: number; to: number }[] = [];
  private get tolerance() {
    return STRICTNESS[this.strictness].cents;
  }

  constructor(private hooks: GradeHooks) {}

  private set(patch: Partial<GradeView>) {
    this.view.update((v) => ({ ...v, ...patch }));
  }
  private later(ms: number, fn: () => void) {
    const run = this.runId;
    this.timeouts.push(setTimeout(() => this.runId === run && fn(), ms));
  }
  private clear() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.timeouts.forEach(clearTimeout);
    this.timeouts = [];
    tuner.setPlaying(null);
  }

  /**
   * Start. `tonicTriad` is the key's tonic chord near the first note (minor
   * for a minor exercise); `countInBeats` a bar (two in 2/4).
   */
  start(o: {
    notes: GradeNote[];
    rests?: GradeRest[];
    bpm: number;
    beatsPerBar: number;
    /** 32nds a beat: 8 for a quarter, 12 for a dotted quarter. */
    beatUnits?: number;
    countInBeats: number;
    reference: Reference;
    tonicTriad: number[];
    mode?: GradeMode;
    strictness?: Strictness;
    cursor?: "off" | "smooth" | "beat" | "note";
    click?: "off" | "beat" | "sub";
  }) {
    this.clear();
    this.runId++;
    this.notes = o.notes;
    this.rests = o.rests ?? [];
    this.results = [];
    this.spans = [];
    this.bpm = o.bpm;
    this.beatUnits = o.beatUnits ?? 8;
    this.tonicTriad = o.tonicTriad;
    this.mode = o.mode ?? "pitch";
    this.strictness = o.strictness ?? "standard";
    this.startedAt = performance.now();
    this.set({ ...IDLE, phase: "reference", total: o.notes.length, mode: this.mode });
    this.hooks.moveTo(this.mode === "pitch" ? 0 : -1);
    const a4 = tuner.get().a4;

    // The reference: the first note, or the tonic chord broken then held.
    let refMs: number;
    if (o.reference === "note") {
      const first = this.notes[0].midi;
      tuner.setPlaying({ name: nameOf(first), octave: octaveOf(first) });
      this.later(1400, () => tuner.setPlaying(null));
      refMs = 1900;
    } else {
      // The key, as a choir director gives it: do mi so mi do, so below, do,
      // a note a beat at the exercise's tempo (held between 0.35 and 0.75 s);
      // then a beat's rest, and the starting note.
      const beat = Math.min(0.75, Math.max(0.35, 60 / Math.max(1, o.bpm)));
      const [doNote, mi, so] = this.tonicTriad;
      const pattern = [doNote, mi, so, mi, doNote, so - 12, doNote];
      pattern.forEach((m, k) => this.later(k * beat * 1000, () => playNotes([m], Math.max(0.4, beat * 0.95), a4, 0.45)));
      const firstAt = (pattern.length + 1) * beat;
      const first = this.notes[0].midi;
      this.later(firstAt * 1000, () => playNotes([first], Math.max(0.6, 2 * beat), a4, 0.45));
      refMs = (firstAt + 2 * beat) * 1000 + 300;
    }

    // Then a count-in at the exercise's tempo.
    const beatMs = 60_000 / Math.max(1, this.bpm);
    if (this.mode === "performance") {
      this.later(refMs, () => this.perform(o.cursor ?? "smooth", o.click ?? "beat"));
      return;
    }
    // Pitch only is untimed: no count-in, the first note straight away.
    void beatMs;
    this.later(refMs, () => this.sing());
  }

  /**
   * Pitch & rhythm: the page runs the exercise in time from its count-in;
   * nothing waits. The note shown in the strip follows the clock, and at the
   * end the recording is graded.
   */
  private perform(cursor: "off" | "smooth" | "beat" | "note", click: "off" | "beat" | "sub") {
    const t0 = this.hooks.startTimeline?.({ cursor, click });
    if (t0 === undefined) return this.stop();
    const unitMs = 60_000 / Math.max(1, this.bpm) / this.beatUnits;
    const last = this.notes[this.notes.length - 1];
    const endUnits = Math.max(last ? last.startUnits + last.lengthUnits : 0, ...this.rests.map((r) => r.startUnits + r.lengthUnits));
    const end = t0 + endUnits * unitMs + 60_000 / Math.max(1, this.bpm);
    this.set({ phase: "countIn" });
    const run = this.runId;
    this.timer = setInterval(() => {
      if (this.runId !== run) return;
      const now = performance.now();
      if (now < t0) return;
      let i = -1;
      while (i + 1 < this.notes.length && t0 + this.notes[i + 1].startUnits * unitMs <= now) i++;
      const v = { phase: "sing" as const, index: Math.max(0, i), target: this.notes[Math.max(0, i)]?.midi ?? null };
      const s = tuner.get();
      const sung = s.pitch !== null ? midiOfHz(s.pitch, s.a4) : null;
      const cents = sung !== null && v.target !== null ? centsOffAnyOctave(sung, v.target) : null;
      this.set({ ...v, sung, cents, onTarget: cents !== null && Math.abs(cents) <= this.tolerance });
      if (now >= end) this.finishPerformance(t0);
    }, TICK_MS);
  }

  private finishPerformance(t0: number) {
    const frames = pitchHistory.recent(performance.now() - t0 + 2000);
    const perf = gradePerformance({ notes: this.notes, rests: this.rests }, frames, {
      t0, bpm: this.bpm, beatUnits: this.beatUnits, strictness: this.strictness,
    });
    this.clear();
    this.hooks.stopTimeline?.();
    this.hooks.moveTo(-1);
    // The result first: the drawing reads it.
    this.set({ phase: "results", index: -1, hold: 0, target: null, sung: null, perf, result: null });
    const unitMs = 60_000 / Math.max(1, this.bpm) / this.beatUnits;
    const beatMs = 60_000 / Math.max(1, this.bpm);
    this.hooks.marked?.(perf.notes.map((n) => n.pitch));
    this.hooks.traced?.({
      mode: "performance",
      t0,
      frames,
      spans: this.notes.map((n) => ({ from: t0 + n.startUnits * unitMs, to: t0 + (n.startUnits + n.lengthUnits) * unitMs })),
      onsets: perf.notes.map((n) => (n.onsetBeats === null ? null : t0 + n.startUnits * unitMs + n.onsetBeats * beatMs)),
      tolerance: this.tolerance,
    });
  }

  private sing() {
    this.set({ phase: "sing" });
    this.present(0);
    const run = this.runId;
    this.timer = setInterval(() => this.runId === run && this.tick(), TICK_MS);
  }

  private present(i: number) {
    this.index = i;
    this.holdMs = 0;
    this.holdStartedAt = 0;
    this.offSince = null;
    this.creditedAt = 0;
    this.steady = null;
    this.firstTry = null;
    this.help = { heardNote: false, heardKey: false };
    this.presentedAt = this.lastTickAt = performance.now();
    this.spans[i] = { from: this.presentedAt + SETTLE_MS, to: this.presentedAt + SETTLE_MS };
    this.hooks.moveTo(i);
    this.set({ index: i, hold: 0, onTarget: false, cents: null, sung: null, target: this.notes[i].midi, helping: false, credited: false });
  }

  private tick() {
    const now = performance.now();
    const dt = Math.min(now - this.lastTickAt, 200);
    this.lastTickAt = now;
    if (this.creditedAt) {
      // Credited: a moment of green, then the next note.
      if (now - this.creditedAt >= CONFIRM_MS) this.next();
      return;
    }
    if (now < this.helpUntil) {
      // Listening to help: nothing is heard, and it is not an attempt.
      this.steady = null;
      return;
    }
    if (this.helpUntil) {
      this.helpUntil = 0;
      this.set({ helping: false });
    }
    const note = this.notes[this.index];
    const s = tuner.get();
    // The first moment after a note is shown is the last note dying away.
    const sung = s.pitch !== null && now - this.presentedAt >= SETTLE_MS ? midiOfHz(s.pitch, s.a4) : null;
    const cents = sung !== null ? centsOffAnyOctave(sung, note.midi) : null;
    const onTarget = cents !== null && Math.abs(cents) <= this.tolerance;

    // An attempt: any pitch held for a moment. The first decides "right first time".
    if (sung === null) this.steady = null;
    else if (!this.steady || Math.abs(sung - this.steady.midi) > 0.5) this.steady = { midi: sung, since: now };
    else if (!this.firstTry && now - this.steady.since >= ATTEMPT_MS) {
      const off = centsOffAnyOctave(this.steady.midi, note.midi);
      this.firstTry = { midi: note.midi + off / 100, right: Math.abs(off) <= this.tolerance };
    }

    if (onTarget) {
      if (this.holdMs === 0) this.holdStartedAt = now;
      this.holdMs += dt;
      this.offSince = null;
    } else if (this.holdMs > 0) {
      this.offSince ??= now;
      if (now - this.offSince > HOLD_GRACE_MS) {
        this.holdMs = 0;
        this.offSince = null;
      }
    }
    if (this.holdMs >= CREDIT_MS) {
      const median = holdCents(pitchHistory.recent(CREDIT_MS + HOLD_GRACE_MS + 500), note.midi, this.holdStartedAt, now);
      const outcome = this.help.heardNote ? "helped" : this.firstTry && !this.firstTry.right ? "corrected" : "first";
      this.record({
        midi: note.midi,
        outcome,
        cents: median ?? cents,
        firstTry: this.firstTry && !this.firstTry.right ? this.firstTry.midi : null,
        findSec: Math.max(0, this.holdStartedAt - this.presentedAt) / 1000,
        help: this.help,
      });
      this.creditedAt = now;
      this.set({ hold: 1, onTarget: true, cents, sung, credited: true });
      return;
    }
    this.set({ hold: Math.min(1, this.holdMs / CREDIT_MS), onTarget, cents, sung });
  }

  private record(r: Omit<NoteResult, "score">) {
    this.results.push({ ...r, score: noteScore(r, STRICTNESS[this.strictness].freeCents) });
  }

  private next() {
    if (this.spans[this.index]) this.spans[this.index].to = performance.now();
    if (this.index + 1 >= this.notes.length) this.finish();
    else this.present(this.index + 1);
  }

  private finish() {
    this.clear();
    this.hooks.moveTo(-1);
    // Coloured by how each was found: green right first time, amber corrected or helped, red skipped.
    this.hooks.marked?.(this.results.map((r) => (r.outcome === "first" ? 100 : r.outcome === "skipped" ? 0 : 75)));
    this.hooks.traced?.({
      mode: "pitch",
      frames: pitchHistory.recent(performance.now() - this.startedAt + 1000),
      spans: this.spans,
      onsets: this.notes.map(() => null),
      tolerance: this.tolerance,
    });
    this.set({ phase: "results", index: -1, hold: 0, target: null, sung: null, result: summarize(this.results) });
  }

  /** Stuck: hear the note, the tonic, or the tonic chord. The clock stops while it sounds. */
  helpWith(kind: HelpKind) {
    // Nothing to help with once the note has its credit.
    if (this.timer === null || this.creditedAt) return;
    const a4 = tuner.get().a4;
    const now = performance.now();
    if (kind === "note") {
      const m = this.notes[this.index].midi;
      tuner.setPlaying({ name: nameOf(m), octave: octaveOf(m) });
      this.later(1100, () => tuner.setPlaying(null));
      this.helpUntil = now + 1400;
      this.help = { ...this.help, heardNote: true };
    } else if (kind === "tonic") {
      const t = this.tonicTriad[0];
      tuner.setPlaying({ name: nameOf(t), octave: octaveOf(t) });
      this.later(1100, () => tuner.setPlaying(null));
      this.helpUntil = now + 1400;
      this.help = { ...this.help, heardKey: true };
    } else {
      playNotes(this.tonicTriad, 1.4, a4, 0.45);
      this.helpUntil = now + 1700;
      this.help = { ...this.help, heardKey: true };
    }
    this.holdMs = 0;
    this.steady = null;
    this.set({ helping: true, hold: 0 });
  }

  /** Give up on this note: it scores nothing, and the next note comes up. */
  skip() {
    if (this.timer === null || this.creditedAt) return;
    const note = this.notes[this.index];
    this.record({ midi: note.midi, outcome: "skipped", cents: null, firstTry: this.firstTry && !this.firstTry.right ? this.firstTry.midi : null, findSec: null, help: this.help });
    this.next();
  }

  /** End the run where it is, without a result. */
  stop() {
    this.runId++;
    this.clear();
    if (this.mode === "performance") this.hooks.stopTimeline?.();
    this.hooks.countIn(-1, 0);
    this.hooks.moveTo(-1);
    this.set(IDLE);
  }

  /** Back to the start screen from the results. */
  reset() {
    this.stop();
  }
}
