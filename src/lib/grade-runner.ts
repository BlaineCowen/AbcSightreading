import { writable, type Readable } from "svelte/store";
import { tuner } from "./tuner/store";
import { pitchHistory } from "./tuner/pitch-history";
import { NOTES } from "./tuner/pitch";
import type { HistoryPoint } from "./tuner/pitch-history";
import { playArpeggio, playNotes } from "./tools/tone";
import {
  HOLD_GRACE_MS,
  STRICTNESS,
  centsOffAnyOctave,
  gradePerformance,
  holdCents,
  creditMsFor,
  noteMsFor,
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
 * mode. Pitch only: a reference, a count-in, then each note waited on until it
 * is sung and held for its written length. Pitch & rhythm: a reference, then
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
  /** Credit given: when the cursor moves on, in time with the music. */
  private advanceAt = 0;
  /**
   * The next note already being sung while the cursor waits out this one. The
   * detector hears a note a moment after it starts, so a singer in time is
   * always a little ahead of it; this keeps what they sang ahead of the cursor.
   */
  private ahead = { ms: 0, since: 0, off: null as number | null };
  /**
   * The next note being sung while this one is still waited on. A sight-reader
   * who misses a note carries on in time; the cursor used to stay on the missed
   * note while they sang on, and nothing after it matched. Once this note's
   * time is up and the next is clearly being sung, this one counts as missed
   * and the cursor goes with them.
   */
  private passing = { ms: 0, since: 0, off: null as number | null };
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
      playArpeggio(this.tonicTriad, 0.35, a4);
      this.later(1100, () => playNotes(this.tonicTriad, 1.4, a4, 0.45));
      refMs = 2900;
    }

    // Then a count-in at the exercise's tempo.
    const beatMs = 60_000 / Math.max(1, this.bpm);
    if (this.mode === "performance") {
      this.later(refMs, () => this.perform(o.cursor ?? "smooth", o.click ?? "beat"));
      return;
    }
    this.later(refMs, () => {
      this.set({ phase: "countIn" });
      for (let b = 0; b < o.countInBeats; b++) {
        this.later(b * beatMs, () => {
          this.hooks.countIn(b, o.countInBeats);
          this.hooks.click(b % o.beatsPerBar === 0);
        });
      }
      this.later(o.countInBeats * beatMs, () => {
        this.hooks.countIn(-1, o.countInBeats);
        this.sing();
      });
    });
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
    // What was sung of this note while the cursor waited on the last one counts.
    this.holdMs = this.ahead.ms;
    this.holdStartedAt = this.ahead.ms > 0 ? this.ahead.since : 0;
    this.ahead = { ms: 0, since: 0, off: null };
    this.passing = { ms: 0, since: 0, off: null };
    this.offSince = null;
    this.advanceAt = 0;
    this.help = { heardNote: false, heardKey: false };
    this.presentedAt = this.lastTickAt = performance.now();
    // Sung ahead of the cursor, it started being sung before it was shown.
    this.spans[i] = { from: this.holdMs > 0 ? this.holdStartedAt : this.presentedAt, to: this.presentedAt };
    this.hooks.moveTo(i);
    this.set({ index: i, hold: 0, onTarget: false, cents: null, sung: null, target: this.notes[i].midi, helping: false, credited: false });
  }

  private tick() {
    const now = performance.now();
    const dt = Math.min(now - this.lastTickAt, 200);
    this.lastTickAt = now;
    if (this.advanceAt) {
      // Credited: the cursor moves on when the written note is over, so it
      // keeps the music's time rather than jumping ahead of the beat.
      const upcoming = this.notes[this.index + 1];
      if (upcoming) {
        const s = tuner.get();
        const heard = s.pitch !== null ? centsOffAnyOctave(midiOfHz(s.pitch, s.a4), upcoming.midi) : null;
        if (heard !== null && Math.abs(heard) <= this.tolerance) {
          if (this.ahead.ms === 0) this.ahead.since = now;
          this.ahead.ms += dt;
          this.ahead.off = null;
        } else if (this.ahead.ms > 0) {
          this.ahead.off ??= now;
          if (now - this.ahead.off > HOLD_GRACE_MS) this.ahead = { ms: 0, since: 0, off: null };
        }
      }
      if (now >= this.advanceAt) this.next();
      return;
    }
    if (now < this.helpUntil) {
      // Listening to help: the clock stands still and nothing is heard.
      this.presentedAt += dt;
      return;
    }
    if (this.helpUntil) {
      this.helpUntil = 0;
      this.set({ helping: false });
    }
    const note = this.notes[this.index];
    const s = tuner.get();
    const sung = s.pitch !== null ? midiOfHz(s.pitch, s.a4) : null;
    const cents = sung !== null ? centsOffAnyOctave(sung, note.midi) : null;
    const onTarget = cents !== null && Math.abs(cents) <= this.tolerance;
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
    const need = creditMsFor(note.beats, this.bpm);
    // Catching up: the next note, sung while this one never was.
    const following = this.notes[this.index + 1];
    if (following && following.midi % 12 !== note.midi % 12 && sung !== null && !onTarget) {
      const toNext = centsOffAnyOctave(sung, following.midi);
      if (Math.abs(toNext) <= this.tolerance) {
        if (this.passing.ms === 0) this.passing.since = now;
        this.passing.ms += dt;
        this.passing.off = null;
      } else if (this.passing.ms > 0) {
        this.passing.off ??= now;
        if (now - this.passing.off > HOLD_GRACE_MS) this.passing = { ms: 0, since: 0, off: null };
      }
      const timeUp = now - this.presentedAt >= noteMsFor(note.beats, this.bpm);
      if (timeUp && this.passing.ms >= creditMsFor(following.beats, this.bpm)) {
        this.record({ midi: note.midi, findBeats: null, cents: null, help: this.help, skipped: true, missed: true });
        this.ahead = { ...this.passing };
        this.next();
        return;
      }
    }
    if (this.holdMs >= need) {
      const median = holdCents(pitchHistory.recent(need + HOLD_GRACE_MS + 500), note.midi, this.holdStartedAt, now);
      const findBeats = Math.max(0, this.holdStartedAt - this.presentedAt) / (60_000 / this.bpm);
      this.record({ midi: note.midi, findBeats, cents: median ?? cents, help: this.help, skipped: false });
      // No chime: the singer is mid-phrase. The cursor moves on once the note
      // has lasted its written length from when the cursor reached it (the
      // first note from when it was sung, which starts the clock). Counting
      // from when the detector heard each note lagged it behind a singer in
      // time, a little more every note. A late note waits for its credit.
      const from = this.index === 0 ? this.holdStartedAt : this.presentedAt;
      this.advanceAt = Math.max(now, from + noteMsFor(note.beats, this.bpm));
      this.set({ hold: 1, onTarget: true, cents, sung, credited: true });
      return;
    }
    this.set({ hold: Math.min(1, this.holdMs / need), onTarget, cents, sung });
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
    this.hooks.marked?.(this.results.map((r) => r.score));
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
    if (this.timer === null || this.advanceAt) return;
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
    this.set({ helping: true, hold: 0 });
  }

  /** Give up on this note: it scores the least a note can. */
  skip() {
    if (this.timer === null || this.advanceAt) return;
    const note = this.notes[this.index];
    this.record({ midi: note.midi, findBeats: null, cents: null, help: this.help, skipped: true });
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
