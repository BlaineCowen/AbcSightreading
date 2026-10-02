import { describe, expect, test } from "bun:test";
import {
  ALL_LAND_ON, DEFAULT_SKIP_SETTINGS, SKIP_CHIPS, addExtraSkip, chipMoves, degreesConnected, policyFor,
  readSkipParams, setExactOn, skipSettingsFrom, togglePattern, toggleLandOn, writeSkipParams,
  type SkipSettings,
} from "../../src/lib/skip-settings";
import { isAllowedMove, type SkipMove, type SkipPolicy } from "../../src/lib/skip-policy";

const code = (m: SkipMove) => `${m.from}${{ up: "↑", down: "↓", both: "↕" }[m.dir]}${m.to}`;
const codes = (ms: SkipMove[]) => ms.map(code);
const movesOf = (p: SkipPolicy) => (p.kind === "custom" ? p.moves : []);
const exact = (patch: Partial<SkipSettings>): SkipSettings => ({ ...DEFAULT_SKIP_SETTINGS, exactOn: true, ...patch });

describe("patterns", () => {
  test("each pattern allows exactly its rows (spec table)", () => {
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
      expect(codes(movesOf(policyFor(3, exact({ patterns: [chip.id] }))))).toEqual(want[chip.label]);
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

  test("labels and ids are the spec's, in order", () => {
    expect(SKIP_CHIPS.map((c) => c.label)).toEqual([
      "Do-Mi-Sol ↑", "Do-Sol ↑", "Sol-Mi-Do ↓", "Sol-Do ↓", "Do-Sol ↓",
      "Sol-Ti-Re ↑", "Tonic triad ↕", "4ths & 5ths ↕",
    ]);
    expect(SKIP_CHIPS.map((c) => c.id)).toEqual([
      "do-mi-sol-up", "do-sol-up", "sol-mi-do-down", "sol-do-down", "do-sol-down",
      "sol-ti-re-up", "tonic-triad", "fourths-fifths",
    ]);
  });

  test("chipMoves hands back copies, so changing one never changes the pattern", () => {
    const rows = chipMoves("do-mi-sol-up");
    rows[0].to = 6;
    expect(codes(chipMoves("do-mi-sol-up"))).toEqual(["1↑3", "3↑5"]);
  });

  test("turning a pattern on turns exact skips on, and keeps SKIP_CHIPS order", () => {
    const one = togglePattern(DEFAULT_SKIP_SETTINGS, "sol-do-down");
    expect(one.exactOn).toBe(true);
    expect(one.patterns).toEqual(["sol-do-down"]);
    expect(togglePattern(one, "do-mi-sol-up").patterns).toEqual(["do-mi-sol-up", "sol-do-down"]);
  });

  test("turning a pattern off leaves exact skips on (stepwise only if it was the last)", () => {
    const off = togglePattern(togglePattern(DEFAULT_SKIP_SETTINGS, "do-sol-up"), "do-sol-up");
    expect(off).toEqual({ ...DEFAULT_SKIP_SETTINGS, exactOn: true, patterns: [] });
    expect(policyFor(4, off)).toEqual({ kind: "custom", moves: [] });
  });

  test("turning exact skips off keeps the choices, and on again brings them back", () => {
    const on = exact({ patterns: ["do-sol-up"], extraSkips: [{ from: 2, to: 5, dir: "up" }], landOn: [8] });
    const off = setExactOn(on, false);
    expect(off).toEqual({ ...on, exactOn: false });
    expect(policyFor(4, off)).toEqual({ kind: "max", maxSkip: 4 });
    expect(setExactOn(off, true)).toEqual(on);
  });
});

describe("other skips", () => {
  test("adding one appends it; a duplicate or a unison does nothing", () => {
    const one = addExtraSkip([], { from: 2, to: 5, dir: "up" });
    expect(codes(one)).toEqual(["2↑5"]);
    expect(addExtraSkip(one, { from: 2, to: 5, dir: "up" })).toEqual(one);
    expect(addExtraSkip(one, { from: 3, to: 3, dir: "up" })).toEqual(one);
    expect(codes(addExtraSkip(one, { from: 2, to: 5, dir: "down" }))).toEqual(["2↑5", "2↓5"]);
  });

  test("a ↕ skip is the same skip either way round", () => {
    const one = addExtraSkip([], { from: 2, to: 5, dir: "both" });
    expect(addExtraSkip(one, { from: 5, to: 2, dir: "both" })).toEqual(one);
  });
});

describe("policyFor", () => {
  test("exact skips off is the Max skip number, whatever is chosen", () => {
    expect(policyFor(3, { exactOn: false, patterns: ["do-sol-up"], extraSkips: [], landOn: [8] }))
      .toEqual({ kind: "max", maxSkip: 3 });
  });

  test("the union of the patterns on and the other skips, without duplicates", () => {
    const s = exact({
      patterns: ["do-mi-sol-up", "tonic-triad"],
      extraSkips: [{ from: 1, to: 3, dir: "up" }, { from: 2, to: 5, dir: "down" }, { from: 5, to: 3, dir: "both" }],
    });
    expect(codes(movesOf(policyFor(3, s)))).toEqual(["1↑3", "3↑5", "1↕3", "3↕5", "1↕5", "2↓5"]);
  });

  test("a ↕ pattern is symmetric: sol back down to do and do up to sol are both allowed", () => {
    const policy = policyFor(4, exact({ patterns: ["tonic-triad"] }));
    const n = (pitchValue: number, degree: number) => ({ pitchValue, degree });
    expect(isAllowedMove(n(18, 4), n(14, 0), 8, policy)).toBe(true); // sol down to do
    expect(isAllowedMove(n(14, 0), n(18, 4), 8, policy)).toBe(true); // do up to sol
    expect(isAllowedMove(n(14, 0), n(17, 3), 8, policy)).toBe(false); // do up to fa: not listed
  });

  test("every land-on value on means no limit; fewer is a limit", () => {
    expect(policyFor(3, exact({ patterns: ["do-sol-up"] }))).toEqual({ kind: "custom", moves: chipMoves("do-sol-up") });
    expect(policyFor(3, exact({ patterns: ["do-sol-up"], landOn: [8, 16] })))
      .toEqual({ kind: "custom", moves: chipMoves("do-sol-up"), landOn: [8, 16] });
  });
});

describe("skips land on", () => {
  test("toggles in note-value order and never leaves none", () => {
    expect(toggleLandOn(ALL_LAND_ON, 4)).toEqual([8, 12, 16]);
    expect(toggleLandOn([16], 8)).toEqual([8, 16]);
    expect(toggleLandOn([8], 8)).toEqual([8]);
  });
});

describe("saved in presets and URLs", () => {
  const settings: SkipSettings = {
    exactOn: true,
    patterns: ["do-mi-sol-up", "sol-do-down"],
    extraSkips: [{ from: 2, to: 5, dir: "up" }, { from: 6, to: 4, dir: "both" }],
    landOn: [8, 16],
  };

  test("a preset (JSON) round-trips", () => {
    expect(skipSettingsFrom(JSON.parse(JSON.stringify({ maxSkip: 3, ...settings })))).toEqual(settings);
  });

  test("a preset or option set without the fields loads in Max skip mode", () => {
    expect(skipSettingsFrom({ maxSkip: 3 })).toEqual(DEFAULT_SKIP_SETTINGS);
    expect(skipSettingsFrom(undefined)).toEqual(DEFAULT_SKIP_SETTINGS);
    expect(DEFAULT_SKIP_SETTINGS).toEqual({ exactOn: false, patterns: [], extraSkips: [], landOn: ALL_LAND_ON });
  });

  test("junk is dropped and never throws", () => {
    const got = skipSettingsFrom({
      exactOn: "yes",
      patterns: ["sol-do-down", "nope", 4, "do-mi-sol-up", "sol-do-down"],
      extraSkips: [{ from: 1, to: 1, dir: "up" }, { from: 2, to: 9 }, null, "1u3", { from: 2, to: 4, dir: "both" }],
      landOn: [5, "x", 16],
    });
    expect(got).toEqual({
      exactOn: false,
      patterns: ["do-mi-sol-up", "sol-do-down"],
      extraSkips: [{ from: 2, to: 4, dir: "both" }],
      landOn: [16],
    });
    expect(skipSettingsFrom({ patterns: "x", extraSkips: 3, landOn: {} })).toEqual(DEFAULT_SKIP_SETTINGS);
    expect(skipSettingsFrom(null)).toEqual(DEFAULT_SKIP_SETTINGS);
  });

  test("a URL round-trips", () => {
    const params = new URLSearchParams();
    writeSkipParams(settings, params);
    expect(params.get("exactSkips")).toBe("1");
    expect(params.get("skipPatterns")).toBe("do-mi-sol-up,sol-do-down");
    expect(params.get("skips")).toBe("2u5,6b4");
    expect(params.get("skipLand")).toBe("8,16");
    expect(readSkipParams(new URLSearchParams(params.toString()))).toEqual(settings);
  });

  test("exact skips off still carries the choices, so a reload keeps them", () => {
    const params = new URLSearchParams();
    writeSkipParams({ ...settings, exactOn: false }, params);
    expect(params.has("exactSkips")).toBe(false);
    expect(readSkipParams(new URLSearchParams(params.toString()))).toEqual({ ...settings, exactOn: false });
  });

  test("the defaults write nothing, and an old link reads as Max skip mode", () => {
    const params = new URLSearchParams();
    writeSkipParams(DEFAULT_SKIP_SETTINGS, params);
    expect(params.toString()).toBe("");
    expect(readSkipParams(new URLSearchParams("maxSkip=3&key=F"))).toBeNull();
  });

  test("junk in a URL is dropped and never throws", () => {
    const got = readSkipParams(new URLSearchParams("exactSkips=1&skipPatterns=zzz,do-sol-up&skips=1u1,9u2,2x5,3d6&skipLand=7,q"));
    expect(got).toEqual({ exactOn: true, patterns: ["do-sol-up"], extraSkips: [{ from: 3, to: 6, dir: "down" }], landOn: ALL_LAND_ON });
  });
});

describe("degreesConnected", () => {
  const policy = (patch: Partial<SkipSettings>) => policyFor(4, exact(patch));
  test("stepwise through neighbours is connected", () => {
    expect(degreesConnected([1, 2, 3, 4, 5], policy({}))).toBe(true);
  });
  test("1, 3, 5 with only Do-Mi-Sol ↑ cannot get back down", () => {
    expect(degreesConnected([1, 3, 5], policy({ patterns: ["do-mi-sol-up"] }))).toBe(false);
  });
  test("1, 3, 5 with the tonic triad both ways is connected", () => {
    expect(degreesConnected([1, 3, 5], policy({ patterns: ["tonic-triad"] }))).toBe(true);
  });
  test("1, 3, 5 with Do-Mi-Sol ↑ plus Sol-Do ↓ is connected", () => {
    expect(degreesConnected([1, 3, 5], policy({ patterns: ["do-mi-sol-up", "sol-do-down"] }))).toBe(true);
  });
  test("an other skip can make the connection", () => {
    expect(degreesConnected([1, 3, 5], policy({ patterns: ["do-mi-sol-up"], extraSkips: [{ from: 5, to: 1, dir: "down" }] }))).toBe(true);
  });
  test("Max skip mode is left to the page's own gap check", () => {
    expect(degreesConnected([1, 5], { kind: "max", maxSkip: 1 })).toBe(true);
  });
});
