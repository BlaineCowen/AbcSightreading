/**
 * What a practice run does when a pass ends.
 *
 * Pulled out of the component because it is the part most likely to be wrong
 * and the hardest part to see: the decision is taken inside an audio buffer's
 * `onended`, so getting at it means actually playing four exercises through,
 * and a browser that will not start audio - an automated one, or a tab that has
 * had no click yet - cannot exercise it at all.
 *
 * As a function it is just counting, and counting can be checked.
 */

export type PracticeRunSettings = {
  /** How many exercises are written over the run. */
  exercises: number;
  /** How many times each is played before the next is written. */
  repeats: number;
  /** Added to the tempo for each NEW exercise, never for a repeat. */
  rampBpm: number;
};

export type PracticeRunState = {
  /** 0-based, which exercise. */
  index: number;
  /** 0-based, which pass of it. */
  repeat: number;
};

export type PracticeStep =
  /** Play the same exercise again. */
  | { kind: "repeat" }
  /** Write a new exercise and play it at `bpm`. */
  | { kind: "next"; bpm: number }
  /** The run is over. */
  | { kind: "finish" };

/** The fastest the tempo control will go; the ramp must not walk past it. */
export const BPM_CEILING = 200;

export function startingState(): PracticeRunState {
  return { index: 0, repeat: 0 };
}

/**
 * A pass just finished. Repeat it, move on, or stop.
 *
 * `currentBpm` is passed in rather than derived from the index because the
 * tempo control stays live during a run - a user who nudges it mid-run has
 * changed where the ramp continues from, and the ramp should carry on from
 * where the music actually is.
 */
export function advance(
  state: PracticeRunState,
  settings: PracticeRunSettings,
  currentBpm: number,
  ceiling: number = BPM_CEILING
): { step: PracticeStep; state: PracticeRunState } {
  const nextRepeat = state.repeat + 1;
  if (nextRepeat < settings.repeats) {
    return { step: { kind: "repeat" }, state: { ...state, repeat: nextRepeat } };
  }
  const nextIndex = state.index + 1;
  if (nextIndex >= settings.exercises) {
    return { step: { kind: "finish" }, state };
  }
  return {
    step: { kind: "next", bpm: Math.min(ceiling, currentBpm + settings.rampBpm) },
    state: { index: nextIndex, repeat: 0 },
  };
}

/**
 * The tempo the last exercise of a run will be played at.
 *
 * For the settings panel, so the ramp says where it ends up rather than only
 * how much it adds. The ramp applies between exercises, so a run of N
 * exercises ramps N-1 times.
 */
export function rampEndBpm(
  startBpm: number,
  settings: PracticeRunSettings,
  ceiling: number = BPM_CEILING
): number {
  return Math.min(ceiling, startBpm + settings.rampBpm * Math.max(0, settings.exercises - 1));
}

/**
 * Everything the runner needs the page to do.
 *
 * The runner never touches a tune, a buffer or the DOM; it asks for these. That
 * is what makes a whole run testable: a browser that will not start audio - an
 * automated one, or any tab that has not been clicked - can never end a pass,
 * so the sequence that a run is made of could otherwise only be checked by
 * playing several exercises through and watching.
 */
export type PracticeRunHooks = {
  /** Write a new exercise. Must not throw; a failure shows up in `canPlay`. */
  generate: () => Promise<void>;
  /** Did that leave something playable? False ends the run. */
  canPlay: () => boolean;
  /** Silence before a new exercise, so it can be read. Resolves early if stopped. */
  wait: (seconds: number) => Promise<void>;
  /** Start playing the exercise on screen. */
  play: () => Promise<void>;
  /** Play the same exercise again, butted against the pass that just ended. */
  repeatPass: () => void;
  /** Is playback actually running? Checked after every attempt to start one. */
  isPlaying: () => boolean;
  stopPlayback: () => void;
  getBpm: () => number;
  setBpm: (bpm: number) => void;
  /** Silence the cursor and the auto-scroll for a repeat pass. */
  setQuiet: (quiet: boolean) => void;
  /** Put the score back in step with a restored tempo. */
  rerender?: () => Promise<void>;
  /** Told when the run's position changes, so the page can say where it is. */
  onChange?: (run: { running: boolean; index: number; repeat: number }) => void;
  /** Told why a run ended early, if it did. */
  onError?: (message: string) => void;
};

export type PracticeRunOptions = {
  /** Cursor and auto-scroll off after the first pass of each exercise. */
  quietRepeats: boolean;
  /** Seconds of silence before each new exercise. */
  readingSeconds: number;
};

/**
 * A practice run: generate, read, play, repeat, move on, stop.
 *
 * Every step that starts playback is followed by a check that playback is
 * actually running. A run is driven forward by the end of a pass, so a start
 * that silently fails is not a missed exercise - it is a run that sits on
 * screen saying "pass 1 of 2" for ever.
 */
export class PracticeRunner {
  private state: PracticeRunState = startingState();
  private active = false;
  private startBpm = 0;

  constructor(
    private hooks: PracticeRunHooks,
    private settings: PracticeRunSettings,
    private options: PracticeRunOptions,
    private ceiling: number = BPM_CEILING
  ) {}

  get running(): boolean {
    return this.active;
  }
  get index(): number {
    return this.state.index;
  }
  get repeat(): number {
    return this.state.repeat;
  }

  private changed() {
    this.hooks.onChange?.({
      running: this.active,
      index: this.state.index,
      repeat: this.state.repeat,
    });
  }

  async start(): Promise<void> {
    if (this.active) return;
    this.startBpm = this.hooks.getBpm();
    this.state = startingState();
    this.active = true;
    this.changed();
    await this.runExercise();
  }

  /**
   * @param rerender - put the score back in step with the restored tempo.
   *   Skipped when the caller is about to generate anyway, since generating
   *   writes a fresh exercise at whatever the tempo is by then.
   */
  async stop(rerender = true): Promise<void> {
    if (!this.active) return;
    this.active = false;
    this.hooks.setQuiet(false);
    this.hooks.stopPlayback();
    this.changed();
    // The ramp moved the tempo. A run that has ended should not leave the
    // control somewhere the user did not put it, and pressing Start again
    // should mean what it meant the first time.
    if (this.startBpm > 0 && this.hooks.getBpm() !== this.startBpm) {
      this.hooks.setBpm(this.startBpm);
      if (rerender) await this.hooks.rerender?.();
    }
  }

  /** Write the next exercise, leave time to read it, then play it. */
  private async runExercise(): Promise<void> {
    if (!this.active) return;
    this.hooks.setQuiet(false);
    await this.hooks.generate();
    if (!this.active) return; // stopped while it was generating
    if (!this.hooks.canPlay()) {
      await this.stop();
      return;
    }
    await this.hooks.wait(this.options.readingSeconds);
    if (!this.active) return;
    await this.hooks.play();
    if (!this.active) return;
    if (!this.hooks.isPlaying()) {
      this.hooks.onError?.("Playback could not start, so the practice run stopped.");
      await this.stop();
    }
  }

  /** A pass just ended: take another, move on, or finish. */
  passEnded(): void {
    if (!this.active) return;
    const { step, state } = advance(
      this.state,
      this.settings,
      this.hooks.getBpm(),
      this.ceiling
    );
    this.state = state;
    this.changed();

    if (step.kind === "finish") {
      void this.stop();
      return;
    }
    if (step.kind === "repeat") {
      if (this.options.quietRepeats) this.hooks.setQuiet(true);
      this.hooks.repeatPass();
      // repeatPass stops playback if it cannot schedule the pass, and a stopped
      // run that still thinks it is running never ends.
      if (!this.hooks.isPlaying()) void this.stop();
      return;
    }
    this.hooks.stopPlayback();
    if (step.bpm !== this.hooks.getBpm()) this.hooks.setBpm(step.bpm);
    void this.runExercise();
  }
}
