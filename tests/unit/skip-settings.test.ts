import { describe, expect, test } from "bun:test";
import {
  ALL_LAND_ON, SKIP_CHIPS, addMoves, chipMoves, degreesConnected, policyFor, readSkipParams,
  skipSettingsFrom, toggleLandOn, writeSkipParams, type SkipSettings,
} from "../../src/lib/skip-settings";
import type { SkipMove } from "../../src/lib/skip-policy";

const code = (m: SkipMove) => `${m.from}${{ up: "↑", down: "↓", both: "↕" }[m.dir]}${m.to}`;
const codes = (ms: SkipMove[]) => ms.map(code);

describe("quick-add chips", () => {
  test("each chip adds exactly its rows (spec table)", () => {
    const want: Record<string, string[]> = {
      "Do-Mi-Sol ↑": ["1↑3", "3↑5"],
      "Do-Sol ↑": ["1↑5"],
      "Sol-Mi-Do ↓": ["5↓3", "3↓1"],
      "Sol-Do ↓": ["5↓1"],
      "Do-Sol ↓": ["1↓5"],
      "Sol-Ti-Re ↑": ["5↑7", "7↑2"],
      "Tonic triad ↕": ["1↕3", "3↕5", "1↕5"],
    };
    for (const chip of SKIP_CHIPS.filter((c) => c.id !== "fourths-fifths")) {
      expect(codes(addMoves([], chip.moves))).toEqual(want[chip.label]);
    }
  });

  test("4ths & 5ths ↕ is every perfect 4th and 5th, both directions, no tritone", () => {
    const rows = chipMoves("fourths-fifths");
    expect(rows).toHaveLength(12);
    for (const m of rows) {
      expect(m.dir).toBe("both");
      const up = (((m.to - m.from) % 7) + 7) % 7;
      expect([3, 4]).toContain(up); // a 4th or a 5th up
      expect(code(m)).not.toBe("4↕7");
      expect(code(m)).not.toBe("7↕4");
    }
  });

  test("adding a row already there changes nothing; the other direction makes it ↕", () => {
    const once = addMoves([], chipMoves("do-sol-up"));
    expect(codes(addMoves(once, chipMoves("do-sol-up")))).toEqual(["1↑5"]);
    expect(codes(addMoves(once, chipMoves("do-sol-down")))).toEqual(["1↕5"]);
  });

  test("chipMoves hands back copies, so editing a row never edits the chip", () => {
    const rows = chipMoves("do-mi-sol-up");
    rows[0].to = 6;
    expect(codes(chipMoves("do-mi-sol-up"))).toEqual(["1↑3", "3↑5"]);
  });

  test("chip labels are the spec's, in order", () => {
    expect(SKIP_CHIPS.map((c) => c.label)).toEqual([
      "Do-Mi-Sol ↑", "Do-Sol ↑", "Sol-Mi-Do ↓", "Sol-Do ↓", "Do-Sol ↓",
      "Sol-Ti-Re ↑", "Tonic triad ↕", "4ths & 5ths ↕",
    ]);
  });

  test("adding a chip twice never duplicates rows", () => {
    for (const chip of SKIP_CHIPS) {
      const once = addMoves([], chip.moves);
      expect(addMoves(once, chip.moves)).toEqual(once);
    }
  });
});

describe("skips land on", () => {
  test("toggles in note-value order and never leaves none", () => {
    expect(toggleLandOn(ALL_LAND_ON, 4)).toEqual([8, 12, 16]);
    expect(toggleLandOn([16], 8)).toEqual([8, 16]);
    expect(toggleLandOn([8], 8)).toEqual([8]);
  });
});

describe("policyFor", () => {
  const custom = (skipLandOn: number[]): SkipSettings => ({ skipMode: "custom", customSkips: chipMoves("do-sol-up"), skipLandOn });
  test("Max skip mode is the number", () => {
    expect(policyFor(3, { skipMode: "max", customSkips: chipMoves("do-sol-up"), skipLandOn: [8] })).toEqual({ kind: "max", maxSkip: 3 });
  });
  test("every box on means no landing limit; fewer is a limit", () => {
    expect(policyFor(3, custom(ALL_LAND_ON))).toEqual({ kind: "custom", moves: chipMoves("do-sol-up") });
    expect(policyFor(3, custom([8, 16]))).toEqual({ kind: "custom", moves: chipMoves("do-sol-up"), landOn: [8, 16] });
  });
});

describe("saved in presets and URLs", () => {
  const settings: SkipSettings = {
    skipMode: "custom",
    customSkips: [{ from: 1, to: 3, dir: "up" }, { from: 3, to: 5, dir: "up" }, { from: 1, to: 5, dir: "both" }],
    skipLandOn: [8, 16],
  };

  test("a preset (JSON) round-trips the custom list", () => {
    expect(skipSettingsFrom(JSON.parse(JSON.stringify(settings)))).toEqual(settings);
  });

  test("an old preset without the fields loads in Max skip mode", () => {
    expect(skipSettingsFrom({ maxSkip: 3 })).toEqual({ skipMode: "max", customSkips: [], skipLandOn: ALL_LAND_ON });
    expect(skipSettingsFrom(undefined)).toEqual({ skipMode: "max", customSkips: [], skipLandOn: ALL_LAND_ON });
  });

  test("junk rows and lengths are dropped", () => {
    const got = skipSettingsFrom({ skipMode: "custom", customSkips: [{ from: 1, to: 1, dir: "up" }, { from: 2, to: 9 }], skipLandOn: [5, "x"] });
    expect(got).toEqual({ skipMode: "custom", customSkips: [], skipLandOn: ALL_LAND_ON });
  });

  test("a URL round-trips the custom list", () => {
    const params = new URLSearchParams();
    writeSkipParams(settings, params);
    expect(params.get("skips")).toBe("1u3,3u5,1b5");
    expect(readSkipParams(new URLSearchParams(params.toString()))).toEqual(settings);
  });

  test("Max skip mode writes nothing, and an old link reads as Max skip mode", () => {
    const params = new URLSearchParams();
    writeSkipParams({ ...settings, skipMode: "max" }, params);
    expect(params.toString()).toBe("");
    expect(readSkipParams(new URLSearchParams("maxSkip=3&key=F"))).toBeNull();
  });
});

describe("degreesConnected", () => {
  test("stepwise through neighbours is connected", () => {
    expect(degreesConnected([1, 2, 3, 4, 5], { kind: "custom", moves: [] })).toBe(true);
  });
  test("1, 3, 5 with only Do-Mi-Sol ↑ cannot get back down", () => {
    expect(degreesConnected([1, 3, 5], { kind: "custom", moves: chipMoves("do-mi-sol-up") })).toBe(false);
  });
  test("1, 3, 5 with the tonic triad both ways is connected", () => {
    expect(degreesConnected([1, 3, 5], { kind: "custom", moves: chipMoves("tonic-triad") })).toBe(true);
  });
  test("1, 3, 5 with the tonic triad plus Sol-Do ↓ is connected", () => {
    const moves = addMoves(chipMoves("tonic-triad"), chipMoves("sol-do-down"));
    expect(degreesConnected([1, 3, 5], { kind: "custom", moves })).toBe(true);
  });
  test("a custom list with 1, 3, 5 and every 3rd and 5th row both ways is connected", () => {
    const moves = [1, 3, 5].flatMap((a) => [1, 3, 5].filter((b) => b !== a).map((b) => ({ from: a, to: b, dir: "both" as const })));
    expect(degreesConnected([1, 3, 5], { kind: "custom", moves })).toBe(true);
  });
  test("Max skip mode is left to the page's own gap check", () => {
    expect(degreesConnected([1, 5], { kind: "max", maxSkip: 1 })).toBe(true);
  });
});
