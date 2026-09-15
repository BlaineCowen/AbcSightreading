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
    // notes/uil-criteria.md: level 1 is 2/4, 3/4, 4/4; levels 2 and 3 are 3/4
    // and 4/4; level 4 adds 6/8, which the page does not offer; level 5 is all
    // simple and compound meters.
    expect(new Set(uilPresets["UIL 1"].allowedMeters)).toEqual(new Set(["4/4", "3/4", "2/4"]));
    expect(new Set(uilPresets["UIL 2"].allowedMeters)).toEqual(new Set(["4/4", "3/4"]));
    expect(new Set(uilPresets["UIL 3"].allowedMeters)).toEqual(new Set(["4/4", "3/4"]));
    expect(new Set(uilPresets["UIL 4"].allowedMeters)).toEqual(new Set(["4/4", "3/4"]));
    expect(new Set(uilPresets["UIL 5"].allowedMeters)).toEqual(new Set(["4/4", "3/4", "2/4"]));
  });

  test("2/4 belongs to levels 1 and 5 only", () => {
    // Stated on its own because this is the one that was wrong in practice:
    // picking level 2 left 2/4 selected and generated in it.
    for (const key of LEVELS) {
      const has = uilPresets[key].allowedMeters.includes("2/4");
      expect(has).toBe(key === "UIL 1" || key === "UIL 5");
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

  test("minor keys appear only from the level that allows them", () => {
    // Levels 1 and 2 are major only in the criteria; a minor key in either
    // would be offered by the picker and generated without comment.
    for (const key of ["UIL 1", "UIL 2"] as const) {
      expect(uilPresets[key].allowedKeys.some((k) => k.endsWith("m"))).toBe(false);
    }
  });
});
