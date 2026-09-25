import { writable, type Readable } from "svelte/store";
import { pitchHistory } from "./pitch-history";
import { metronome } from "./metronome";
import { tuner } from "./store";
import { NOTES, noteToFreq } from "./pitch";
import type { NoteName } from "./types";
import {
  GAP_MS,
  GUIDE_TONE_MS,
  HOLD_GRACE_MS,
  HOLD_MS,
  TOLERANCE_CENTS,
  buildTargets,
  centsFromTarget,
  gradeHold,
  skippedResult,
  summarize,
} from "./scale-challenge";
import type { Difficulty, Direction, Grade, NoteResult } from "./scale-challenge";

export type Phase = "setup" | "guide" | "listen" | "cleared" | "results";

const TICK_MS = 50;

const nameOf = (midi: number): NoteName => NOTES[((midi % 12) + 12) % 12];
const octaveOf = (midi: number) => Math.floor(midi / 12) - 1;

export interface ChallengeState {
  /** Index of the note being sung, -1 before the run starts. */
  index: number;
  /** 0..1 of the one-second hold completed. */
  hold: number;
  /** Live signed cents from the target, null when nothing is detected. */
  cents: number | null;
  /** True while on target (inside the difficulty's tolerance). */
  onTarget: boolean;
}

export interface RunnerView {
  phase: Phase;
  state: ChallengeState;
  result: Grade | null;
}

const IDLE: ChallengeState = { index: -1, hold: 0, cents: null, onTarget: false };

/**
 * Runs one self-paced attempt: present a note, wait for it to be held for a
 * second, brief pause, next. Nothing advances on a timer, so each note is
 * graded the moment it clears — a slow run can outlive the pitch history
 * buffer, and slicing it all at the end would silently lose the early notes.
 *
 * The framework-free form of the tuner project's useScaleChallenge hook: the
 * hook's refs are plain fields, its React state is one writable, and its
 * unmount cleanup is destroy().
 */
export class ScaleChallengeRunner {
  private view = writable<RunnerView>({ phase: "setup", state: IDLE, result: null });
  /** `{ phase, state, result }`, for `$runner` in markup. */
  readonly subscribe: Readable<RunnerView>["subscribe"] = this.view.subscribe;

  // Every run gets a token; stale ticks and timeouts check it and bail, so a
  // restart can never be clobbered by the previous attempt.
  private runId = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private phase: Phase = "setup";
  private targets: number[] = [];
  private results: NoteResult[] = [];
  private runStartedAt = 0;
  private guideUntil = 0;
  private presentedAt = 0;
  private holdMs = 0;
  private holdStartedAt = 0;
  private offSince: number | null = null;
  private lastTickAt = 0;
  private clearedUntil = 0;
  private index = 0;
  // finish() reads the difficulty of the run in progress, set by start().
  private difficulty: Difficulty = "normal";

  private setState(state: ChallengeState) {
    this.view.update((v) => ({ ...v, state }));
  }

  private setResult(result: Grade | null) {
    this.view.update((v) => ({ ...v, result }));
  }

  private setPhaseOnce(p: Phase) {
    if (this.phase !== p) {
      this.phase = p;
      this.view.update((v) => ({ ...v, phase: p }));
    }
  }

  private clearTimer() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  stop = () => {
    this.runId++;
    this.clearTimer();
    tuner.setPlaying(null);
    this.setPhaseOnce("setup");
    this.setState(IDLE);
  };

  reset = () => {
    this.runId++;
    this.clearTimer();
    this.setResult(null);
    this.setPhaseOnce("setup");
    this.setState(IDLE);
  };

  /** Present note `i`: sound the guide tone (if on), then start listening. */
  private present(i: number) {
    const store = tuner.get();
    const target = this.targets[i];
    this.index = i;
    this.holdMs = 0;
    this.offSince = null;
    this.holdStartedAt = 0;
    this.lastTickAt = performance.now();
    this.setState({ index: i, hold: 0, cents: null, onTarget: false });

    if (store.challengeGuideTone) {
      // Detection pauses while the app sounds a note, so the singer can never
      // be credited with the tone the app just played.
      tuner.setPlaying({ name: nameOf(target), octave: octaveOf(target) });
      this.guideUntil = performance.now() + GUIDE_TONE_MS;
      this.setPhaseOnce("guide");
    } else {
      this.guideUntil = 0;
      this.presentedAt = performance.now();
      this.setPhaseOnce("listen");
    }
  }

  private finish() {
    this.clearTimer();
    tuner.setPlaying(null);
    this.setResult(
      summarize(this.results, performance.now() - this.runStartedAt, this.difficulty)
    );
    this.setPhaseOnce("results");
  }

  /** Record the current note as given up on and move along. */
  skip = () => {
    const i = this.index;
    this.results.push(skippedResult(i, this.targets[i]));
    if (i + 1 >= this.targets.length) this.finish();
    else this.present(i + 1);
  };

  start = (direction: Direction, octave: number, difficulty: Difficulty) => {
    const store = tuner.get();
    this.difficulty = difficulty;
    this.targets = buildTargets(store.key, octave, direction);
    this.results = [];
    this.runId++;
    const runId = this.runId;
    this.clearTimer();
    this.runStartedAt = performance.now();
    this.setResult(null);
    this.present(0);

    const tick = () => {
      if (this.runId !== runId) return;
      const now = performance.now();
      const s = tuner.get();
      const i = this.index;
      const target = this.targets[i];
      const targetHz = noteToFreq(nameOf(target), octaveOf(target), s.a4);
      const tolerance = TOLERANCE_CENTS[difficulty];

      if (this.phase === "guide") {
        this.lastTickAt = now;
        if (now >= this.guideUntil) {
          tuner.setPlaying(null);
          // Time-to-find starts only once the tone has stopped.
          this.presentedAt = now;
          this.setPhaseOnce("listen");
        }
        return;
      }

      if (this.phase === "cleared") {
        this.lastTickAt = now;
        if (now >= this.clearedUntil) {
          if (i + 1 >= this.targets.length) this.finish();
          else this.present(i + 1);
        }
        return;
      }

      if (this.phase !== "listen") {
        this.lastTickAt = now;
        return;
      }

      // Measure the hold in wall-clock, never in tick counts: a busy page (or a
      // throttled background tab) slows the interval down, and counting ticks
      // would silently stretch the one second into two or more.
      const dt = Math.min(now - this.lastTickAt, 200);
      this.lastTickAt = now;

      const cents = s.pitch !== null ? centsFromTarget(s.pitch, targetHz) : null;
      const onTarget = cents !== null && Math.abs(cents) <= tolerance;

      if (onTarget) {
        if (this.holdMs === 0) this.holdStartedAt = now;
        this.holdMs += dt;
        this.offSince = null;
      } else if (this.holdMs > 0) {
        // Hold the accumulator steady through a brief lapse, then give up on it.
        this.offSince ??= now;
        if (now - this.offSince > HOLD_GRACE_MS) {
          this.holdMs = 0;
          this.offSince = null;
        }
      }

      if (this.holdMs >= HOLD_MS) {
        const { cents: median } = gradeHold(
          pitchHistory.recent(HOLD_MS + HOLD_GRACE_MS + 500),
          target,
          this.holdStartedAt,
          now
        );
        this.results.push({
          index: i,
          target,
          cents: median,
          errorCents: Math.abs(median ?? 0),
          missed: false,
          timeToFindMs: Math.max(0, this.holdStartedAt - this.presentedAt),
        });
        metronome.clickNow(true); // success chime
        this.clearedUntil = now + GAP_MS;
        this.setState({ index: i, hold: 1, cents, onTarget: true });
        this.setPhaseOnce("cleared");
        return;
      }

      this.setState({
        index: i,
        hold: Math.min(1, this.holdMs / HOLD_MS),
        cents,
        onTarget,
      });
    };

    // A plain interval, never requestAnimationFrame: rAF stops firing when the
    // tab is backgrounded, which would freeze the exercise mid-note.
    this.timer = setInterval(tick, TICK_MS);
  };

  /** The hook's unmount cleanup. */
  destroy = () => {
    this.runId++; // any in-flight tick sees a stale token
    this.clearTimer();
    tuner.setPlaying(null);
  };
}
