import { describe, expect, test } from "bun:test";
import {
  firstSystemScrollTarget,
  worthScrolling,
  targetMoved,
  NAVBAR_CLEARANCE,
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
