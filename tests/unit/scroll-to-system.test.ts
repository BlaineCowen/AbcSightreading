import { describe, expect, test } from "bun:test";
import {
  firstSystemScrollTarget,
  worthScrolling,
  targetMoved,
  NAVBAR_CLEARANCE,
  PLAYING_CLEARANCE,
  playingLineScrollTarget,
} from "../../src/lib/scroll-to-system";

/**
 * Scroll arithmetic, which is worth asserting because a wrong answer is silent:
 * the page just ends up somewhere unhelpful and nothing errors.
 */

describe("scrolling back to the first system", () => {
  test("leaves room above the system for the navbar", () => {
    // 1000px tall viewport: a tenth is 100, which clears the 80px bar.
    expect(firstSystemScrollTarget(500, 1000)).toBe(400);
  });

  test("a short viewport still clears the navbar", () => {
    // A tenth of 400 is 40, which would put the bar on top of the system.
    expect(firstSystemScrollTarget(500, 400)).toBe(500 - NAVBAR_CLEARANCE);
  });

  test("never asks to scroll above the top of the page", () => {
    expect(firstSystemScrollTarget(30, 800)).toBe(0);
  });

  test("a few pixels is not worth a scroll", () => {
    expect(worthScrolling(1000, 990)).toBe(false);
    expect(worthScrolling(1000, 1000)).toBe(false);
  });

  test("a real distance is", () => {
    expect(worthScrolling(1000, 500)).toBe(true);
    expect(worthScrolling(100, 900)).toBe(true);
  });

  test("a score that reflowed under the scroll is re-aimed", () => {
    // Annotations added a row per system, so the first system moved down.
    expect(targetMoved(400, 460)).toBe(true);
  });

  test("but a scroll merely still travelling is not", () => {
    // The check must key off the target, not off how far is left to go -
    // otherwise a smooth scroll restarts itself on every check and never
    // arrives. Same target, so nothing to re-aim at.
    expect(targetMoved(400, 400)).toBe(false);
    expect(targetMoved(400, 403)).toBe(false);
  });
});

describe("playingLineScrollTarget", () => {
  // A 900 px window with the playback bar's top at 800: lines are in document
  // coordinates, the bar in the viewport's.
  const vh = 900;
  const bar = 800;

  test("with room for both lines, the usual margin above the line", () => {
    // Line at 1000, the next ending 400 below it: plenty of room.
    expect(playingLineScrollTarget(1000, 1400, bar, vh)).toBe(1000 - 90);
  });

  test("the margin shrinks just enough for the next line to clear the bar", () => {
    // Two lines 750 tall together: 800 - 8 - 750 = 42 px left above.
    const target = playingLineScrollTarget(1000, 1750, bar, vh);
    expect(target).toBe(1000 - 42);
    expect(1750 - target).toBeLessThanOrEqual(bar - 8);
  });

  test("when both cannot fit, the line being played stays whole", () => {
    expect(playingLineScrollTarget(1000, 2000, bar, vh)).toBe(1000 - PLAYING_CLEARANCE);
  });

  test("the last line takes the usual margin", () => {
    expect(playingLineScrollTarget(1000, null, bar, vh)).toBe(1000 - Math.max(NAVBAR_CLEARANCE, vh * 0.1));
  });

  test("never above the page", () => {
    expect(playingLineScrollTarget(30, 400, bar, vh)).toBe(0);
  });
});
