import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import { startsOf, xAt } from "../../src/lib/games/beat-bar";

describe("xAt (where a beat falls among the notes drawn)", () => {
  const pts = [{ units: 0, x: 100 }, { units: 12, x: 160 }, { units: 16, x: 200 }, { units: 32, x: 300 }];
  test("on a note, its place; inside a dotted quarter, partway along it", () => {
    expect(xAt(pts, 0)).toBe(100);
    expect(xAt(pts, 12)).toBe(160);
    // Beat 2 (8 units) is two thirds of the way through the dotted quarter (12 units).
    expect(xAt(pts, 8)).toBe(140);
    expect(xAt(pts, 24)).toBe(250);
  });
  test("before the first and past the last: the ends", () => {
    expect(xAt(pts, -4)).toBe(100);
    expect(xAt(pts, 40)).toBe(300);
    expect(xAt([], 5)).toBe(0);
  });
  // Property: later times are never drawn further left (the dot only moves forward).
  test("never goes backwards", () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 1, max: 16 }), { minLength: 1, maxLength: 12 }), fc.integer({ min: 0, max: 200 }), fc.integer({ min: 0, max: 200 }), (lens, a, b) => {
        let u = 0, x = 50;
        const points = [{ units: 0, x: 50 }];
        for (const l of lens) { u += l; x += 5 + l * 3; points.push({ units: u, x }); }
        const [t1, t2] = a <= b ? [a, b] : [b, a];
        expect(xAt(points, t1)).toBeLessThanOrEqual(xAt(points, t2));
      }),
    );
  });
});

describe("startsOf", () => {
  test("each note's and rest's start, in drawing order, and the total", () => {
    // L:1/32: a dotted quarter (12), an eighth (4), a quarter rest (8), a half (16).
    const abc = "X:1\nM:4/4\nL:1/32\nK:C\nB12 B4 z8 B8 | B16 B16 |]";
    expect(startsOf(abc)).toEqual({ starts: [0, 12, 16, 24, 32, 48], total: 64 });
  });
});
