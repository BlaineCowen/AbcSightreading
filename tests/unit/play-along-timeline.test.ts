import { describe, expect, test } from "bun:test";
import { ballAt, barsForLength, frameAt, loopOffset, secondsPerBar, VIDEO_SECONDS } from "../../src/lib/play-along/timeline";
import { BACKING_TRACKS } from "../../src/lib/play-along/backing-tracks";
import { countInMeasures } from "../../src/lib/count-in";
import { EXERCISE_METER_NAMES } from "../../src/lib/meter";

/**
 * The play-along video: two panes leapfrogging, top then bottom, the top
 * turning over the instant the cursor drops to the bottom, about 1:30 long.
 */

const opts = { bars: 8, bpm: 120, meter: "4/4", countInBars: 1 }; // 2 s a bar
const at = (t: number) => frameAt(t, opts);

describe("length", () => {
  test("4/4 at 100 with a four-bar loop is 36 bars", () => {
    expect(barsForLength({ bpm: 100, meter: "4/4", loopBars: 4, countInBars: 1 })).toBe(36);
  });

  test("whole loop repeats, an even number of bars", () => {
    for (const loopBars of [1, 2, 3, 4, 8]) {
      const bars = barsForLength({ bpm: 90, meter: "3/4", loopBars, countInBars: 1 });
      expect(bars % loopBars).toBe(0);
      expect(bars % 2).toBe(0);
    }
  });

  test("lands near a minute and a half in every meter and tempo", () => {
    for (const meter of EXERCISE_METER_NAMES) {
      for (const bpm of [60, 80, 100, 120, 140]) {
        const countInBars = countInMeasures(meter);
        const bars = barsForLength({ bpm, meter, loopBars: 4, countInBars });
        const seconds = (bars + countInBars) * secondsPerBar(bpm, meter);
        // Within half a loop of the target.
        expect(Math.abs(seconds - VIDEO_SECONDS)).toBeLessThanOrEqual(2 * secondsPerBar(bpm, meter) + 1e-9);
      }
    }
  });

  test("compound meter counts dotted-quarter beats: 6/8 at 60 is 2 s a bar", () => {
    expect(secondsPerBar(60, "6/8")).toBe(2);
    expect(secondsPerBar(60, "12/8")).toBe(4);
  });
});

describe("count-in", () => {
  test("shows the first two bars and the director's words", () => {
    expect(at(0)).toMatchObject({ phase: "countIn", top: 0, bottom: 1, active: null, word: "1" });
    expect(at(0.5).word).toBe("2");
    expect(at(1.0).word).toBe("Ready");
    expect(at(1.5).word).toBe("Go");
  });

  test("before the downbeat is the start of the count-in", () => {
    expect(at(-3)).toMatchObject({ phase: "countIn", word: "1" });
  });

  test("a two-bar intro counts its first bar plainly", () => {
    const f = (t: number) => frameAt(t, { ...opts, countInBars: 2 });
    expect([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].map((t) => f(t).word)).toEqual(["1", "2", "3", "4", "1", "2", "Ready", "Go"]);
  });
});

describe("bouncing ball", () => {
  const notes = [{ at: 0, x: 10 }, { at: 0.5, x: 50 }, { at: 0.75, x: 60 }];
  test("lands on each note as it sounds", () => {
    expect(ballAt(notes, 0, 100)).toMatchObject({ x: 10, lift: 0, note: 0 });
    expect(ballAt(notes, 0.5, 100)).toMatchObject({ x: 50, lift: 0, note: 1 });
    expect(ballAt(notes, 0.75, 100)).toMatchObject({ x: 60, lift: 0, note: 2 });
  });
  test("is highest halfway between two notes", () => {
    const b = ballAt(notes, 0.25, 100);
    expect(b.x).toBe(30);
    expect(b.lift).toBe(1);
    expect(b.span).toBe(0.5);
  });
  test("the last note arcs to the barline", () => {
    expect(ballAt(notes, 1, 100)).toMatchObject({ x: 100, lift: 0, hop: 1, note: 2 });
  });
});

describe("leapfrog", () => {
  test("bar 0 plays on top with bar 1 waiting below", () => {
    expect(at(2)).toMatchObject({ phase: "playing", bar: 0, active: "top", top: 0, bottom: 1, progress: 0 });
    expect(at(3).progress).toBeCloseTo(0.5);
  });

  test("the top turns over the instant the cursor drops to the bottom", () => {
    expect(at(3.999)).toMatchObject({ top: 0, bottom: 1, active: "top" });
    expect(at(4)).toMatchObject({ top: 2, bottom: 1, active: "bottom", bar: 1 });
    expect(at(6)).toMatchObject({ top: 2, bottom: 3, active: "top", bar: 2 });
  });

  test("bar n is always in pane n mod 2, with the next bar in the other", () => {
    for (let n = 0; n < opts.bars; n++) {
      const f = at(2 + n * 2 + 1);
      expect(f.bar).toBe(n);
      expect(f.active).toBe(n % 2 === 0 ? "top" : "bottom");
      const other = n % 2 === 0 ? f.bottom : f.top;
      expect(other).toBe(n + 1 < opts.bars ? n + 1 : null);
    }
  });

  test("an odd bar count leaves the last bar alone on top", () => {
    const f = frameAt(2 + 4 * 2 + 1, { ...opts, bars: 5 });
    expect(f).toMatchObject({ bar: 4, top: 4, bottom: null });
  });

  test("done after the last bar, with the last pair still showing", () => {
    expect(at(2 + 8 * 2)).toMatchObject({ phase: "done", top: 6, bottom: 7, active: null });
  });
});

describe("backing loops", () => {
  test("a count-in starts far enough into the loop that its bar 1 lands on the music's", () => {
    expect(loopOffset(1, 4)).toBe(3);
    expect(loopOffset(2, 4)).toBe(2);
    expect(loopOffset(4, 4)).toBe(0);
    expect(loopOffset(1, 1)).toBe(0);
    expect(loopOffset(5, 4)).toBe(3);
  });

  test("every loop in the catalogue makes a video near a minute and a half", () => {
    for (const t of BACKING_TRACKS) {
      const countInBars = t.introBars ?? countInMeasures(t.meter);
      const bars = barsForLength({ bpm: t.bpm, meter: t.meter, loopBars: t.bars, countInBars });
      const seconds = (bars + countInBars) * secondsPerBar(t.bpm, t.meter);
      const step = (t.bars % 2 === 0 ? t.bars : t.bars * 2) * secondsPerBar(t.bpm, t.meter);
      expect(Math.abs(seconds - VIDEO_SECONDS)).toBeLessThanOrEqual(step / 2 + 1e-9);
      expect(bars % t.bars).toBe(0);
    }
  });
});
