import { describe, expect, test } from "bun:test";
import {
  advance,
  rampEndBpm,
  startingState,
  BPM_CEILING,
  type PracticeRunSettings,
  type PracticeRunState,
  type PracticeStep,
} from "../../src/lib/practice-run";

/**
 * The counting behind a practice run.
 *
 * The full-run tests below are the ones that matter: they drive the machine the
 * way playback does, one ended pass at a time, and assert the whole shape of
 * the session. An off-by-one in either counter shows up there as a run of the
 * wrong length, which is exactly how a user would meet it.
 */

const settings = (over: Partial<PracticeRunSettings> = {}): PracticeRunSettings => ({
  exercises: 4,
  repeats: 2,
  rampBpm: 0,
  ...over,
});

/** Drive a whole run to its end, collecting every step. */
function runToEnd(s: PracticeRunSettings, startBpm = 60, ceiling = BPM_CEILING) {
  const steps: PracticeStep[] = [];
  let state: PracticeRunState = startingState();
  let bpm = startBpm;
  // Generous bound: a wrong machine that never finishes must fail the length
  // assertion rather than hang the test run.
  for (let guard = 0; guard < 500; guard++) {
    const out = advance(state, s, bpm, ceiling);
    steps.push(out.step);
    state = out.state;
    if (out.step.kind === "finish") break;
    if (out.step.kind === "next") bpm = out.step.bpm;
  }
  return { steps, endBpm: bpm };
}

describe("practice run", () => {
  test("a run plays each exercise the requested number of times", () => {
    const s = settings({ exercises: 3, repeats: 2 });
    const { steps } = runToEnd(s);
    // 3 exercises x 2 passes = 6 passes. The first pass is started by the run
    // itself, so the machine sees 5 endings before the last one finishes it.
    expect(steps.filter((x) => x.kind === "repeat").length).toBe(3); // one per exercise
    expect(steps.filter((x) => x.kind === "next").length).toBe(2); // two handovers
    expect(steps.at(-1)!.kind).toBe("finish");
  });

  test("a longer run is longer in the right dimension", () => {
    const three = runToEnd(settings({ exercises: 3, repeats: 2 })).steps;
    const six = runToEnd(settings({ exercises: 6, repeats: 2 })).steps;
    expect(six.filter((x) => x.kind === "next").length).toBe(5);
    expect(three.filter((x) => x.kind === "next").length).toBe(2);
  });

  test("one pass each means it never repeats", () => {
    const { steps } = runToEnd(settings({ exercises: 4, repeats: 1 }));
    expect(steps.some((x) => x.kind === "repeat")).toBe(false);
    expect(steps.filter((x) => x.kind === "next").length).toBe(3);
  });

  test("one exercise means it never moves on", () => {
    const { steps } = runToEnd(settings({ exercises: 1, repeats: 3 }));
    expect(steps.some((x) => x.kind === "next")).toBe(false);
    expect(steps.filter((x) => x.kind === "repeat").length).toBe(2);
    expect(steps.at(-1)!.kind).toBe("finish");
  });

  test("the shortest possible run ends immediately", () => {
    const { steps } = runToEnd(settings({ exercises: 1, repeats: 1 }));
    expect(steps).toEqual([{ kind: "finish" }]);
  });

  test("the ramp applies between exercises, not between passes", () => {
    // Two passes each: if the ramp were applied per pass the tempo would climb
    // twice as fast.
    const s = settings({ exercises: 4, repeats: 2, rampBpm: 10 });
    const { steps } = runToEnd(s, 60);
    const tempos = steps.filter((x) => x.kind === "next").map((x: any) => x.bpm);
    expect(tempos).toEqual([70, 80, 90]);
  });

  test("no ramp means every exercise at the same tempo", () => {
    const { steps } = runToEnd(settings({ exercises: 4, rampBpm: 0 }), 72);
    for (const step of steps) {
      if (step.kind === "next") expect(step.bpm).toBe(72);
    }
  });

  test("the ramp stops at the ceiling instead of running past it", () => {
    const s = settings({ exercises: 8, repeats: 1, rampBpm: 20 });
    const { steps } = runToEnd(s, 150, 200);
    const tempos = steps.filter((x) => x.kind === "next").map((x: any) => x.bpm);
    expect(Math.max(...tempos)).toBe(200);
    expect(tempos).toEqual([170, 190, 200, 200, 200, 200, 200]);
  });

  test("the ramp continues from wherever the tempo actually is", () => {
    // The tempo control stays live during a run. A user who nudges it should
    // not have the next exercise jump back to the ramp's own idea of where it
    // had got to.
    const s = settings({ exercises: 3, repeats: 1, rampBpm: 10 });
    const first = advance(startingState(), s, 60);
    expect(first.step).toEqual({ kind: "next", bpm: 70 });
    // User drags the tempo down to 50 mid-exercise.
    const second = advance(first.state, s, 50);
    expect(second.step).toEqual({ kind: "next", bpm: 60 });
  });

  test("the state walks exercise by exercise and pass by pass", () => {
    const s = settings({ exercises: 2, repeats: 3 });
    let state = startingState();
    expect(state).toEqual({ index: 0, repeat: 0 });
    state = advance(state, s, 60).state;
    expect(state).toEqual({ index: 0, repeat: 1 });
    state = advance(state, s, 60).state;
    expect(state).toEqual({ index: 0, repeat: 2 });
    state = advance(state, s, 60).state;
    expect(state).toEqual({ index: 1, repeat: 0 }); // new exercise, passes reset
  });

  test("the panel can say where the ramp ends up", () => {
    // N exercises ramp N-1 times, because the first is played as generated.
    expect(rampEndBpm(60, settings({ exercises: 4, rampBpm: 10 }))).toBe(90);
    expect(rampEndBpm(60, settings({ exercises: 1, rampBpm: 10 }))).toBe(60);
    expect(rampEndBpm(60, settings({ exercises: 4, rampBpm: 0 }))).toBe(60);
    expect(rampEndBpm(190, settings({ exercises: 8, rampBpm: 20 }))).toBe(200);
  });

  test("the readout agrees with what the run actually plays", () => {
    // The label is a promise to the user; this is the promise being kept.
    for (const exercises of [1, 2, 4, 8]) {
      for (const rampBpm of [0, 5, 20]) {
        const s = settings({ exercises, repeats: 2, rampBpm });
        const { endBpm } = runToEnd(s, 60);
        expect(`${exercises}/${rampBpm}: ${endBpm}`).toBe(
          `${exercises}/${rampBpm}: ${rampEndBpm(60, s)}`
        );
      }
    }
  });
});
