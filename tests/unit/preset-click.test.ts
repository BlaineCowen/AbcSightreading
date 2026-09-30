import { describe, expect, test } from "bun:test";
import { clickFrom, numberIn } from "../../src/lib/preset-click";

describe("a preset's click", () => {
  test("a saved click comes back as it was", () => {
    expect(clickFrom({ subdivision: 2, accent: false, sound: "quartz" })).toEqual({ subdivision: 2, accent: false, sound: "quartz" });
  });
  test("the click's on/off and level come back too, and a click saved without them loads without them", () => {
    expect(clickFrom({ subdivision: 1, accent: true, sound: "tick", withMusic: false, volume: 0.3 }))
      .toEqual({ subdivision: 1, accent: true, sound: "tick", withMusic: false, volume: 0.3 });
    expect(clickFrom({ subdivision: 1, accent: true, sound: "tick" })).toEqual({ subdivision: 1, accent: true, sound: "tick" });
    expect(clickFrom({ subdivision: 1, accent: true, sound: "tick", volume: 3 })).toEqual({ subdivision: 1, accent: true, sound: "tick" });
  });
  test("a preset naming an old sound gets the new one nearest it", () => {
    expect(clickFrom({ subdivision: 1, accent: true, sound: "claves" })?.sound).toBe("tick");
  });
  test("older presets, with no click, load without one", () => {
    expect(clickFrom(undefined)).toBeNull();
    expect(clickFrom(null)).toBeNull();
  });
  test("a malformed click is ignored rather than put on the metronome", () => {
    expect(clickFrom({ subdivision: 0, accent: true, sound: "woodblock" })).toBeNull();
    expect(clickFrom({ subdivision: 2.5, accent: true, sound: "woodblock" })).toBeNull();
    expect(clickFrom({ subdivision: 2, accent: "yes", sound: "woodblock" })).toBeNull();
    expect(clickFrom({ subdivision: 2, accent: true, sound: "cowbell-9000" })).toBeNull();
  });
});

describe("numberIn", () => {
  test("keeps a number in range, falls back otherwise", () => {
    expect(numberIn(0.4, 0, 1, 1)).toBe(0.4);
    expect(numberIn(3, 0, 1, 1)).toBe(1);
    expect(numberIn("0.4", 0, 1, 1)).toBe(1);
    expect(numberIn(undefined, 0, 1, 0.5)).toBe(0.5);
  });
});
