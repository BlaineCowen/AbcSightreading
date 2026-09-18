import { describe, expect, test } from "bun:test";
import { nextNavState } from "../../src/lib/nav-reveal";

const MAX = 2000;
const TOP = 64;
const run = (ys: number[], start = { anchorY: 0, visible: true }) =>
  ys.reduce((s, y) => nextNavState(s, y, MAX, TOP), start);

describe("nextNavState", () => {
  test("scrolling down hides, scrolling back up shows", () => {
    const down = run([100, 300, 600]);
    expect(down.visible).toBe(false);
    expect(run([500, 400], down).visible).toBe(true);
  });

  test("a rubber-band at the top never hides it", () => {
    // Pull past the top, then spring back to 0 - an "increase" of 40px.
    expect(run([-40, -20, 0]).visible).toBe(true);
  });

  test("near the top it shows, even if it was hidden", () => {
    expect(run([30], { anchorY: 800, visible: false }).visible).toBe(true);
  });

  test("scrolling down within the header's own height does not hide it", () => {
    // Hiding here would uncover the page top with nothing to scroll back to.
    expect(run([20, 40, 60]).visible).toBe(true);
  });

  test("a bounce past the bottom does not reveal it", () => {
    const atBottom = run([400, 1200, MAX]);
    expect(atBottom.visible).toBe(false);
    // Overshoot then settle back at the end: clamped, so no upward move.
    expect(run([MAX + 60, MAX + 20, MAX], atBottom).visible).toBe(false);
  });

  test("small jitter keeps the current state", () => {
    const hidden = run([400, 900]);
    expect(run([895, 900, 893], hidden).visible).toBe(false);
    const shown = run([850, 700], hidden);
    expect(shown.visible).toBe(true);
    expect(run([705, 698, 706], shown).visible).toBe(true);
  });

  test("slow scrolling still accumulates against the anchor", () => {
    // Many 5px steps, each under the threshold, add up to a real scroll down.
    const steps = Array.from({ length: 20 }, (_, i) => 200 + i * 5);
    expect(run(steps, { anchorY: 200, visible: true }).visible).toBe(false);
  });
});
