import { describe, expect, test } from "bun:test";
import { choralAdvice, unisonAdvice, widenedRange } from "../../src/lib/failure-fix";
import { NO_LANDING_MESSAGE } from "../../src/lib/skip-settings";

const part = (name: string, low: number, high: number) => ({ name, range: [low, high] as [number, number] });
const tenorBass = [part("Tenor", 14, 23), part("Baritone", 6, 17), part("Bass", 2, 13)];
const ctx = (over = {}) => ({ parts: tenorBass, measures: 8, chordCount: 12, maxSkip: 6, ...over });

describe("Choral: the setting in the way", () => {
  test("sixteen bars of close parts with eighths held to a step: Harmony, let them leap", () => {
    const a = choralAdvice(ctx({ measures: 16, stepwiseEighths: true }));
    expect(a.pill).toBe("harmony");
    expect(a.fix?.action).toEqual({ kind: "stepwiseEighthsOff" });
  });
  test("sixteen bars otherwise: Length, try 8", () => {
    const a = choralAdvice(ctx({ measures: 16 }));
    expect(a.pill).toBe("length");
    expect(a.fix?.action).toEqual({ kind: "measures", to: 8 });
  });
  test("a tight part: Ranges, and the fix widens that part, the one the message names", () => {
    const a = choralAdvice(ctx());
    expect(a.pill).toBe("ranges");
    expect(a.fix?.action).toEqual({ kind: "widenPart", part: "Tenor", steps: 2 });
    expect(a.message).toContain("Tenor");
  });
  test("few chords: Harmony, no guess at which chord", () => {
    const a = choralAdvice(ctx({ parts: [part("S", 0, 20), part("A", 0, 20)], chordCount: 3 }));
    expect(a.pill).toBe("harmony");
    expect(a.fix).toBeNull();
  });
  test("a small largest leap: one larger", () => {
    const a = choralAdvice(ctx({ parts: [part("S", 0, 20), part("A", 0, 20)], maxSkip: 2 }));
    expect(a.fix?.action).toEqual({ kind: "maxSkip", to: 3 });
  });
});

describe("Unison: the pill a message points at", () => {
  const u = (m: string, over = {}) => unisonAdvice(m, { maxSkip: 3, exactSkips: false, tiesOn: false, ...over });
  test("range problems: Notes, widen the range", () => {
    for (const m of [
      "No valid notes found in range for the selected scale degrees",
      "No tonic notes found in the selected range and scale degrees. Please adjust the settings.",
      "With these skips the line would get stuck on a note it cannot leave in this range. Add a skip, select the notes in between, or widen the range.",
    ]) {
      const a = u(m);
      expect(a.pill).toBe("notes");
      expect(a.fix?.action).toEqual({ kind: "widenRange" });
    }
  });
  test("Max skip: Notes, one larger", () => {
    const a = u("The gap between selected scale degrees is larger than the Max Skip. Please increase Max Skip or select more notes to fill the gap.");
    expect(a.pill).toBe("notes");
    expect(a.fix?.action).toEqual({ kind: "maxSkip", to: 4 });
  });
  test("exact skips: Notes, no guess", () => {
    expect(u(NO_LANDING_MESSAGE).pill).toBe("notes");
    expect(u(NO_LANDING_MESSAGE).fix).toBeNull();
  });
  test("rhythms that cannot fill a bar: Rhythm, ties offered when off", () => {
    const a = u("The selected rhythms can't fill a 3/4 measure. Or turn on \"Ties across barline\".");
    expect(a.pill).toBe("rhythm");
    expect(a.fix?.action).toEqual({ kind: "tiesOn" });
    expect(u("The selected rhythms can't fill a 3/4 measure.", { tiesOn: true }).fix).toBeNull();
  });
  test("not a setting: no pill", () => {
    expect(u("The instrument sounds did not load, so only the metronome would play. Press Play again to retry.").pill).toBeNull();
    expect(u("Your browser is blocking audio until you interact with the page. Click anywhere on the page, then press Play again.").pill).toBeNull();
  });
});

describe("widening a Unison range", () => {
  // F major: do is F, letter 3. noteArray indices, C = 0.
  const all = { min: 0, max: 40 };
  test("a step more at each end", () => {
    expect(widenedRange({ min: 14, max: 21 }, 3, [0, 1, 2, 3, 4], all)).toEqual({ min: 13, max: 22 });
  });
  test("grows until a starting note sits inside it", () => {
    // G to A in F major (re, mi with nothing but do selected as a start): grows up to reach do.
    const r = widenedRange({ min: 18, max: 19 }, 3, [0], all);
    const inside = [];
    for (let i = r.min + 1; i < r.max; i++) inside.push(((i - 3) % 7 + 7) % 7);
    expect(inside).toContain(0);
  });
  test("never past the limits", () => {
    const r = widenedRange({ min: 0, max: 2 }, 0, [4], { min: 0, max: 3 });
    expect(r.min).toBeGreaterThanOrEqual(0);
    expect(r.max).toBeLessThanOrEqual(3);
  });
});

describe("Show me goes to the control", () => {
  test("each pointer names a control the page marks", () => {
    expect(unisonAdvice("No valid notes found in range for the selected scale degrees", { maxSkip: 3, exactSkips: false, tiesOn: false }).target).toBe("range");
    expect(choralAdvice(ctx()).target).toBe("part:Tenor");
  });
  test("a bare generator message is put in plain words", () => {
    const a = unisonAdvice("No tonic notes found in the selected range and scale degrees. Please adjust the settings.", { maxSkip: 3, exactSkips: false, tiesOn: false });
    expect(a.message).toContain("do, mi or so");
    expect(a.message).not.toMatch(/ [-–—] |—/);
  });
});
