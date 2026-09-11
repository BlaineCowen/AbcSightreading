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
