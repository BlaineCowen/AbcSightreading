import { describe, expect, test } from "bun:test";
import {
  PracticeRunner,
  type PracticeRunHooks,
  type PracticeRunOptions,
  type PracticeRunSettings,
} from "../../src/lib/practice-run";

/**
 * A whole practice run, driven the way playback drives it.
 *
 * This is the half that a browser cannot check here: a run is carried forward
 * by the end of a pass, and an automated browser will not start audio at all -
 * `AudioContext.resume()` simply never resolves without a click - so no pass
 * ever ends and the sequence is never exercised. The fake page below ends
 * passes on demand and writes down everything it was asked to do.
 */

type Call = string;

function fakePage(over: Partial<PracticeRunHooks> = {}) {
  const calls: Call[] = [];
  let bpm = 60;
  let playing = false;
  let quiet = false;
  let canPlay = true;

  const hooks: PracticeRunHooks = {
    generate: async () => {
      calls.push("generate");
      playing = false;
    },
    canPlay: () => canPlay,
    wait: async (s) => {
      calls.push(`wait:${s}`);
    },
    play: async () => {
      calls.push("play");
      playing = true;
    },
    repeatPass: () => {
      calls.push("repeatPass");
      playing = true;
    },
    isPlaying: () => playing,
    stopPlayback: () => {
      calls.push("stopPlayback");
      playing = false;
    },
    getBpm: () => bpm,
    setBpm: (next) => {
      calls.push(`bpm:${next}`);
      bpm = next;
    },
    setQuiet: (q) => {
      if (q !== quiet) calls.push(`quiet:${q}`);
      quiet = q;
    },
    rerender: async () => {
      calls.push("rerender");
    },
    ...over,
  };

  return {
    hooks,
    calls,
    get bpm() { return bpm; },
    get quiet() { return quiet; },
    get playing() { return playing; },
    set canPlay(v: boolean) { canPlay = v; },
    set playing(v: boolean) { playing = v; },
  };
}

const settings = (over: Partial<PracticeRunSettings> = {}): PracticeRunSettings => ({
  exercises: 2,
  repeats: 2,
  rampBpm: 0,
  ...over,
});
const options = (over: Partial<PracticeRunOptions> = {}): PracticeRunOptions => ({
  quietRepeats: true,
  readingSeconds: 5,
  ...over,
});

/** Play a run to its end, ending each pass as soon as one starts. */
async function playThrough(runner: PracticeRunner, page: ReturnType<typeof fakePage>) {
  await runner.start();
  for (let guard = 0; guard < 200 && runner.running; guard++) {
    if (!page.playing) break; // nothing is sounding; nothing will end
    runner.passEnded();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  }
  return page.calls;
}

describe("practice runner", () => {
  test("a run reads, plays, repeats, then writes the next one", async () => {
    const page = fakePage();
    const runner = new PracticeRunner(page.hooks, settings({ exercises: 2, repeats: 2 }), options());
    const calls = await playThrough(runner, page);
    expect(calls).toEqual([
      "generate", "wait:5", "play",        // exercise 1, after time to read it
      "quiet:true", "repeatPass",           // its second pass, cursor silenced
      "stopPlayback",
      "quiet:false", "generate", "wait:5", "play", // exercise 2
      "quiet:true", "repeatPass",
      "quiet:false", "stopPlayback",        // and the run ends
    ]);
    expect(runner.running).toBe(false);
  });

  test("the reading pause happens before each new exercise, not before a repeat", async () => {
    const page = fakePage();
    const runner = new PracticeRunner(page.hooks, settings({ exercises: 3, repeats: 3 }), options());
    const calls = await playThrough(runner, page);
    expect(calls.filter((c) => c.startsWith("wait:")).length).toBe(3); // one per exercise
    expect(calls.filter((c) => c === "repeatPass").length).toBe(6); // two per exercise
  });

  test("no reading pause is asked for when it is set to zero", async () => {
    const page = fakePage();
    const runner = new PracticeRunner(
      page.hooks, settings({ exercises: 1, repeats: 1 }), options({ readingSeconds: 0 })
    );
    const calls = await playThrough(runner, page);
    expect(calls).toContain("wait:0");
    expect(calls.indexOf("wait:0")).toBeLessThan(calls.indexOf("play"));
  });

  test("the ramp raises the tempo between exercises only", async () => {
    const page = fakePage();
    const runner = new PracticeRunner(
      page.hooks, settings({ exercises: 3, repeats: 2, rampBpm: 10 }), options()
    );
    const calls = await playThrough(runner, page);
    expect(calls.filter((c) => c.startsWith("bpm:"))).toEqual(["bpm:70", "bpm:80", "bpm:60"]);
    //                                                          ^ two handovers   ^ restored
  });

  test("the tempo goes back where it started, and the score with it", async () => {
    const page = fakePage();
    const runner = new PracticeRunner(
      page.hooks, settings({ exercises: 3, repeats: 1, rampBpm: 20 }), options()
    );
    await playThrough(runner, page);
    expect(page.bpm).toBe(60);
    expect(page.calls).toContain("rerender");
  });

  test("a run with no ramp never touches the tempo at all", async () => {
    const page = fakePage();
    const runner = new PracticeRunner(page.hooks, settings({ exercises: 3, rampBpm: 0 }), options());
    const calls = await playThrough(runner, page);
    expect(calls.some((c) => c.startsWith("bpm:"))).toBe(false);
    expect(calls).not.toContain("rerender");
  });

  test("quiet repeats silence the cursor for the repeat and restore it for the next exercise", async () => {
    const page = fakePage();
    const runner = new PracticeRunner(page.hooks, settings({ exercises: 2, repeats: 2 }), options());
    const calls = await playThrough(runner, page);
    // On for the repeat pass, off again before the next exercise is played.
    expect(calls.indexOf("quiet:true")).toBeGreaterThan(calls.indexOf("play"));
    expect(calls.indexOf("quiet:false")).toBeGreaterThan(calls.indexOf("quiet:true"));
    expect(page.quiet).toBe(false); // and never left on at the end
  });

  test("with quiet repeats off the cursor is never silenced", async () => {
    const page = fakePage();
    const runner = new PracticeRunner(
      page.hooks, settings({ exercises: 2, repeats: 3 }), options({ quietRepeats: false })
    );
    const calls = await playThrough(runner, page);
    expect(calls).not.toContain("quiet:true");
    expect(calls.filter((c) => c === "repeatPass").length).toBe(4);
  });

  test("a run that cannot play stops instead of hanging", async () => {
    // The failure this is here for: playback silently not starting. A run is
    // carried by the end of a pass, so nothing would ever end it.
    const page = fakePage({ play: async () => {} }); // "plays" without playing
    const errors: string[] = [];
    page.hooks.onError = (m) => errors.push(m);
    const runner = new PracticeRunner(page.hooks, settings(), options());
    await runner.start();
    expect(runner.running).toBe(false);
    expect(errors.length).toBe(1);
  });

  test("a repeat pass that cannot be scheduled stops the run too", async () => {
    // The real failure: startLoopRepeat() calls stopMusic() when it cannot
    // schedule the pass, so playback is over and nothing will ever end it.
    const page = fakePage();
    const runner = new PracticeRunner(page.hooks, settings({ exercises: 2, repeats: 2 }), options());
    await runner.start();
    expect(runner.running).toBe(true);
    page.hooks.repeatPass = () => { page.playing = false; };
    runner.passEnded();
    await Promise.resolve();
    await Promise.resolve();
    expect(runner.running).toBe(false);
  });

  test("a failed generation ends the run rather than playing nothing", async () => {
    const page = fakePage();
    page.canPlay = false;
    const runner = new PracticeRunner(page.hooks, settings(), options());
    await runner.start();
    expect(runner.running).toBe(false);
    expect(page.calls).not.toContain("play");
  });

  test("stopping mid-run halts it there", async () => {
    const page = fakePage();
    const runner = new PracticeRunner(page.hooks, settings({ exercises: 8, repeats: 2 }), options());
    await runner.start();
    runner.passEnded(); // into the repeat
    await runner.stop();
    const after = page.calls.length;
    runner.passEnded(); // a late callback from the pass that was cut off
    expect(page.calls.length).toBe(after); // ignored
    expect(runner.running).toBe(false);
  });

  test("stopping while it is generating does not then start playing", async () => {
    // The window that matters: generation is awaited, and Stop can land inside it.
    let stopNow: (() => void) | null = null;
    const page = fakePage();
    const runner = new PracticeRunner(page.hooks, settings(), options());
    page.hooks.generate = async () => {
      page.calls.push("generate");
      stopNow?.();
      await runner.stop();
    };
    stopNow = () => {};
    await runner.start();
    expect(page.calls).not.toContain("play");
    // And it does not sit through the reading pause of an exercise nobody
    // asked for: a Stop during generation should take effect at once, not
    // five seconds later.
    expect(page.calls.some((c) => c.startsWith("wait:"))).toBe(false);
    expect(runner.running).toBe(false);
  });

  test("start is idempotent - a second press does not run two sessions", async () => {
    const page = fakePage();
    const runner = new PracticeRunner(page.hooks, settings(), options());
    await runner.start();
    const after = page.calls.length;
    await runner.start();
    expect(page.calls.length).toBe(after);
  });

  test("the page is told where the run is, so it can say so", async () => {
    const seen: string[] = [];
    const page = fakePage();
    page.hooks.onChange = (r) => seen.push(`${r.running ? "on" : "off"} ${r.index}.${r.repeat}`);
    const runner = new PracticeRunner(page.hooks, settings({ exercises: 2, repeats: 2 }), options());
    await playThrough(runner, page);
    expect(seen[0]).toBe("on 0.0");
    expect(seen).toContain("on 0.1"); // second pass of the first exercise
    expect(seen).toContain("on 1.0"); // first pass of the second
    expect(seen.at(-1)!.startsWith("off")).toBe(true);
  });
});
