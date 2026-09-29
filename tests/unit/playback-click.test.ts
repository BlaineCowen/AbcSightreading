import { describe, expect, test } from "bun:test";
import { barClicks, drumPatternFor } from "../../src/lib/playback-click";

/**
 * The click under the exercise, set by the Tools metronome: its subdivision,
 * accent and sound. Written before the code.
 */
describe("one bar's clicks", () => {
  test("beats alone: the downbeat accented", () => {
    expect(barClicks(4, 1, true)).toEqual(["downbeat", "beat", "beat", "beat"]);
  });
  test("no accent: every beat the same", () => {
    expect(barClicks(3, 1, false)).toEqual(["beat", "beat", "beat"]);
  });
  test("eighths: a lighter click between the beats", () => {
    expect(barClicks(2, 2, true)).toEqual(["downbeat", "sub", "beat", "sub"]);
  });
  test("triplets", () => {
    expect(barClicks(2, 3, true)).toEqual(["downbeat", "sub", "sub", "beat", "sub", "sub"]);
  });
});

describe("the Choral page's drum pattern (abcjs spreads it evenly across the bar)", () => {
  test("4/4, woodblock, beats: high block on one, low on the others, one hit per beat", () => {
    const p = drumPatternFor({ beats: 4, subdivision: 1, accent: true, sound: "woodblock" }).split(" ");
    expect(p[0]).toBe("dddd");
    expect(p.slice(1, 5)).toEqual(["76", "77", "77", "77"]);
    const vel = p.slice(5).map(Number);
    expect(vel[0]).toBeGreaterThan(vel[1]);
  });
  test("2/4 in eighths: four hits, the offbeats quietest", () => {
    const p = drumPatternFor({ beats: 2, subdivision: 2, accent: true, sound: "woodblock" }).split(" ");
    expect(p[0]).toBe("dddd");
    const vel = p.slice(5).map(Number);
    expect(vel[1]).toBeLessThan(vel[2]);
    expect(vel[3]).toBeLessThan(vel[2]);
  });
  test("claves and the click-and-bell use their own drums; the synthesized beep falls back to woodblock", () => {
    expect(drumPatternFor({ beats: 3, subdivision: 1, accent: true, sound: "claves" }).split(" ").slice(1, 4)).toEqual(["75", "75", "75"]);
    expect(drumPatternFor({ beats: 3, subdivision: 1, accent: true, sound: "clickbell" }).split(" ").slice(1, 4)).toEqual(["34", "33", "33"]);
    expect(drumPatternFor({ beats: 3, subdivision: 1, accent: true, sound: "beep" }).split(" ").slice(1, 4)).toEqual(["76", "77", "77"]);
  });
  test("velocities are MIDI's, 1 to 127", () => {
    for (const sound of ["woodblock", "claves", "clickbell"] as const) {
      const vel = drumPatternFor({ beats: 4, subdivision: 4, accent: true, sound }).split(" ").slice(17).map(Number);
      for (const v of vel) expect(v >= 1 && v <= 127 && Number.isInteger(v)).toBe(true);
    }
  });
});
