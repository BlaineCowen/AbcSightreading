import { describe, expect, test } from "bun:test";
import { uilPresets } from "../../src/lib/uil-presets";
import { rhythms as allRhythms } from "../../src/resources/rhythms";
import { keySignatures } from "../../src/resources/key-signatures";

/**
 * What a level declares.
 *
 * A preset that names something the app cannot act on is worse than one that
 * says nothing: it reads as a constraint and is not one. Every field here had
 * that happen at least once - allowedVoicings and measureRange sat unread for
 * months, and allowedMeters did not exist at all while the criteria named
 * meters for all five levels.
 */

/** The meters the page offers. */
const OFFERED_METERS = ["4/4", "3/4", "2/4"];
const LEVELS = ["UIL 1", "UIL 2", "UIL 3", "UIL 4", "UIL 5"] as const;

describe("every level declares what it allows", () => {
  test("each preset names meters, and only ones the page offers", () => {
    for (const key of LEVELS) {
      const p = uilPresets[key];
      expect(p.allowedMeters.length).toBeGreaterThan(0);
      for (const m of p.allowedMeters) expect(OFFERED_METERS).toContain(m);
    }
  });

  test("the meters are the ones the criteria state", () => {
    // UIL's current criteria (7 October 2026): Levels 1-3 are 3/4 and 4/4;
    // Levels 4 and 5 add 2/4. No meter changes, and no compound meter.
    expect(new Set(uilPresets["UIL 1"].allowedMeters)).toEqual(new Set(["4/4", "3/4"]));
    expect(new Set(uilPresets["UIL 2"].allowedMeters)).toEqual(new Set(["4/4", "3/4"]));
    expect(new Set(uilPresets["UIL 3"].allowedMeters)).toEqual(new Set(["4/4", "3/4"]));
    expect(new Set(uilPresets["UIL 4"].allowedMeters)).toEqual(new Set(["4/4", "3/4", "2/4"]));
    expect(new Set(uilPresets["UIL 5"].allowedMeters)).toEqual(new Set(["4/4", "3/4", "2/4"]));
  });

  test("2/4 belongs to levels 4 and 5 only", () => {
    // Stated on its own because this is the one that was wrong in practice:
    // picking level 2 left 2/4 selected and generated in it.
    for (const key of LEVELS) {
      const has = uilPresets[key].allowedMeters.includes("2/4");
      expect(has).toBe(key === "UIL 4" || key === "UIL 5");
    }
  });

  test("every rhythm a level names actually exists", () => {
    const known = new Set(allRhythms.map((r) => r.name));
    for (const key of LEVELS) {
      for (const name of uilPresets[key].allowedRhythmNames) expect(known).toContain(name);
    }
  });

  test("every key a level names actually exists", () => {
    for (const key of LEVELS) {
      for (const k of uilPresets[key].allowedKeys) {
        expect(keySignatures[k]).toBeDefined();
      }
    }
  });

  test("each level's length range is a range, and grows with the level", () => {
    let previous = 0;
    for (const key of LEVELS) {
      const [lo, hi] = uilPresets[key].measureRange;
      expect(hi).toBeGreaterThanOrEqual(lo);
      expect(lo).toBeGreaterThanOrEqual(previous);
      previous = lo;
    }
  });

  test("the largest leap never shrinks as the level rises", () => {
    let previous = 0;
    for (const key of LEVELS) {
      expect(uilPresets[key].maxSkip).toBeGreaterThanOrEqual(previous);
      previous = uilPresets[key].maxSkip;
    }
  });

  test("no level is in a minor key", () => {
    // UIL's pieces are major at every level; Level 5 may modulate to the
    // relative minor inside a piece (form-plan), and minor-key practice lives
    // outside the levels (Blaine, 7 October 2026).
    for (const key of LEVELS) {
      expect(uilPresets[key].allowedKeys.some((k) => k.endsWith("m"))).toBe(false);
    }
  });
});

/**
 * UIL's current criteria, read from uiltexas.org on 7 October 2026 and
 * confirmed with Blaine (notes/uil-criteria.md). Each line here is one the
 * presets had drifted from.
 */
describe("the levels say what UIL says", () => {
  test("keys", () => {
    expect(uilPresets["UIL 1"].allowedKeys).toEqual(["F", "G"]);
    expect(uilPresets["UIL 2"].allowedKeys).toEqual(["F", "G"]);
    expect(new Set(uilPresets["UIL 3"].allowedKeys)).toEqual(new Set(["Bb", "F", "C", "G", "D"]));
    expect(new Set(uilPresets["UIL 4"].allowedKeys)).toEqual(new Set(["Bb", "Eb", "F", "C", "G", "D", "A"]));
    expect(new Set(uilPresets["UIL 5"].allowedKeys)).toEqual(new Set(["Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E"]));
  });

  test("V7 from Level 1; ii and vi from Level 2; iii at Level 4; altered tones only at Level 5", () => {
    expect(uilPresets["UIL 1"].allowedChordNames).toContain("5-7");
    expect(uilPresets["UIL 2"].allowedChordNames).toEqual(expect.arrayContaining(["2", "6"]));
    expect(uilPresets["UIL 4"].allowedChordNames).toContain("3");
    const altered = (k: keyof typeof uilPresets) => uilPresets[k].allowedChordNames.filter((c) => c.includes("/"));
    for (const k of ["UIL 1", "UIL 2", "UIL 3", "UIL 4"] as const) expect(altered(k)).toEqual([]);
    expect(altered("UIL 5").length).toBeGreaterThan(0);
  });

  test("authentic, half and plagal cadences only, through Level 4", () => {
    for (const k of ["UIL 1", "UIL 2", "UIL 3", "UIL 4"] as const) {
      expect(uilPresets[k].allowedCadenceTypes).toBeDefined();
      expect(uilPresets[k].allowedCadenceTypes!.some((t) => /Deceptive/.test(t))).toBe(false);
    }
  });

  test("no rests at Levels 1 and 2, and Level 2's dotted quarter only on strong beats", () => {
    for (const k of ["UIL 1", "UIL 2"] as const) {
      expect(uilPresets[k].noRests).toBe(true);
      expect(uilPresets[k].allowedRhythmNames.some((r) => /Rest/.test(r))).toBe(false);
    }
    expect(uilPresets["UIL 2"].dottedOnStrongBeats).toBe(true);
  });

  test("no sixteenths but Level 5's dotted eighth and sixteenth", () => {
    const sixteenths = /Sixteenth/;
    for (const k of ["UIL 1", "UIL 2", "UIL 3", "UIL 4"] as const)
      expect(uilPresets[k].allowedRhythmNames.some((r) => sixteenths.test(r))).toBe(false);
    expect(uilPresets["UIL 5"].allowedRhythmNames.filter((r) => sixteenths.test(r))).toEqual(["dotEighthSixteenth"]);
  });

  test("Level 5 is 32-36 bars for 5A, 12-16 more for 6A", () => {
    expect(uilPresets["UIL 5"].measureRange).toEqual([32, 36]);
    expect(uilPresets["UIL 5"].longVersion).toEqual([44, 52]);
  });
});
