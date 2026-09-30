import { writable, type Readable } from "svelte/store";
import { tuner } from "./tuner/store";
import { pitchHistory } from "./tuner/pitch-history";
import { NOTES } from "./tuner/pitch";
import { playArpeggio, playNotes } from "./tools/tone";
import {
  HOLD_GRACE_MS,
  TOLERANCE_CENTS,
  centsOffAnyOctave,
  holdCents,
  holdMsFor,
  noteScore,
  summarize,
  type GradeNote,
  type GradeResult,
  type Help,
  type NoteResult,
} from "./grade";

/**
 * Runs one graded attempt at a Unison exercise (rules in grade.ts): a
 * reference, a count-in, then each note waited on until it is sung and held
 * for its written length. The scale challenge's runner is the model (a 50 ms
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
  result: GradeResult | null;
};

export type GradeHooks = {
  /** Show the singer this note (an index into the notes), or none (-1). */
  moveTo: (noteIndex: number) => void;
  /** Count-in beat `beat` (0-based) of `total`; -1 when it ends. */
  countIn: (beat: number, total: number) => void;
  click: (downbeat: boolean) => void;
  /** The run is over: each note's score, in order, to mark on the score. */
  marked?: (scores: number[]) => void;
};

const TICK_MS = 50;
const IDLE: GradeView = { phase: "idle", index: -1, total: 0, hold: 0, onTarget: false, cents: null, sung: null, target: null, helping: false, result: null };
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
  private help: Help = { heardNote: false, heardKey: false };
  private tonicTriad: number[] = [];

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
  start(o: { notes: GradeNote[]; bpm: number; beatsPerBar: number; countInBeats: number; reference: Reference; tonicTriad: number[] }) {
    this.clear();
    this.runId++;
    this.notes = o.notes;
    this.results = [];
    this.bpm = o.bpm;
    this.tonicTriad = o.tonicTriad;
    this.set({ ...IDLE, phase: "reference", total: o.notes.length });
    this.hooks.moveTo(0);
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
    this.help = { heardNote: false, heardKey: false };
    this.presentedAt = this.lastTickAt = performance.now();
    this.hooks.moveTo(i);
    this.set({ index: i, hold: 0, onTarget: false, cents: null, sung: null, target: this.notes[i].midi, helping: false });
  }

  private tick() {
    const now = performance.now();
    const dt = Math.min(now - this.lastTickAt, 200);
    this.lastTickAt = now;
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
    const onTarget = cents !== null && Math.abs(cents) <= TOLERANCE_CENTS;
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
    const need = holdMsFor(note.beats, this.bpm);
    if (this.holdMs >= need) {
      const median = holdCents(pitchHistory.recent(need + HOLD_GRACE_MS + 500), note.midi, this.holdStartedAt, now);
      const findBeats = Math.max(0, this.holdStartedAt - this.presentedAt) / (60_000 / this.bpm);
      this.record({ midi: note.midi, findBeats, cents: median ?? cents, help: this.help, skipped: false });
      // No chime: the singer is mid-phrase, and the cursor moving on says it.
      this.next();
      return;
    }
    this.set({ hold: Math.min(1, this.holdMs / need), onTarget, cents, sung });
  }

  private record(r: Omit<NoteResult, "score">) {
    this.results.push({ ...r, score: noteScore(r) });
  }

  private next() {
    if (this.index + 1 >= this.notes.length) this.finish();
    else this.present(this.index + 1);
  }

  private finish() {
    this.clear();
    this.hooks.moveTo(-1);
    this.hooks.marked?.(this.results.map((r) => r.score));
    this.set({ phase: "results", index: -1, hold: 0, target: null, sung: null, result: summarize(this.results) });
  }

  /** Stuck: hear the note, the tonic, or the tonic chord. The clock stops while it sounds. */
  helpWith(kind: HelpKind) {
    if (this.timer === null) return;
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
    if (this.timer === null) return;
    const note = this.notes[this.index];
    this.record({ midi: note.midi, findBeats: null, cents: null, help: this.help, skipped: true });
    this.next();
  }

  /** End the run where it is, without a result. */
  stop() {
    this.runId++;
    this.clear();
    this.hooks.countIn(-1, 0);
    this.hooks.moveTo(-1);
    this.set(IDLE);
  }

  /** Back to the start screen from the results. */
  reset() {
    this.stop();
  }
}
