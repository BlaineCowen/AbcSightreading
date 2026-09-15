import { describe, expect, test } from "bun:test";
import {
  planForm,
  describeForm,
  requiredMeasures,
  majorKeysFor,
  POLYPHONY_CEILING,
  type FormPlan,
} from "../../src/lib/form-plan";

/**
 * Planning a whole example rather than a phrase of one.
 *
 * The plan is the thing being tested, not the music: whether it is the right
 * length for the level, whether it holds together as a shape, and whether it
 * stays inside what the UIL criteria allow. What the sections then sound like
 * is the generator's business.
 */

const LEVELS = [1, 2, 3, 4, 5];
const METERS = ["4/4", "3/4", "2/4"];

/** Every plan a level can legally produce, across meters and lengths. */
function everyPlan(level: number): FormPlan[] {
  const out: FormPlan[] = [];
  for (const meter of METERS) {
    const [min, max] = requiredMeasures(level, meter);
    for (let m = min; m <= max; m++) out.push(planForm({ level, meter, measures: m }));
  }
  return out;
}

describe("how long a level's example has to be", () => {
  test("the 4/4 lengths are the ones the criteria state", () => {
    expect(requiredMeasures(1)).toEqual([24, 28]);
    expect(requiredMeasures(2)).toEqual([28, 32]);
    expect(requiredMeasures(3)).toEqual([32, 36]);
    expect(requiredMeasures(4)).toEqual([36, 48]);
    expect(requiredMeasures(5)).toEqual([48, 56]);
  });

  test("3/4 is the same amount of music, not the same number of barlines", () => {
    // The criteria say "or equivalent in 3/4" everywhere and do the arithmetic
    // once, at level 3: 32-36 measures in 4/4 or 42-48 in 3/4. Converting by
    // beats reproduces that exactly, which is what says the reading is right.
    expect(requiredMeasures(3, "3/4")).toEqual([42, 48]);
  });

  test("2/4 needs twice the bars of 4/4", () => {
    expect(requiredMeasures(1, "2/4")).toEqual([48, 56]);
  });

  test("an unknown level or meter is refused rather than guessed at", () => {
    expect(() => requiredMeasures(9)).toThrow(/No such level/);
    expect(() => requiredMeasures(1, "banana")).toThrow(/meter/);
  });
});

describe("the plan adds up", () => {
  test("the sections sum to exactly the length asked for", () => {
    // A plan whose parts do not add up to its own total is worse than no plan:
    // the piece silently comes out the wrong length.
    for (const level of LEVELS) {
      for (const plan of everyPlan(level)) {
        const sum = plan.sections.reduce((n, s) => n + s.measures, 0);
        expect(sum).toBe(plan.measures);
      }
    }
  });

  test("the sections run end to end with no gap and no overlap", () => {
    for (const level of LEVELS) {
      for (const plan of everyPlan(level)) {
        let bar = 1;
        for (const s of plan.sections) {
          expect(s.startsAtBar).toBe(bar);
          bar += s.measures;
        }
      }
    }
  });

  test("no section is empty", () => {
    for (const level of LEVELS) {
      for (const plan of everyPlan(level)) {
        for (const s of plan.sections) expect(s.measures).toBeGreaterThan(0);
      }
    }
  });

  test("a length outside the level's range is refused", () => {
    expect(() => planForm({ level: 1, measures: 8 })).toThrow(/24-28/);
    expect(() => planForm({ level: 5, measures: 100 })).toThrow(/48-56/);
  });
});

describe("the shape", () => {
  test("every level states something and comes back to it", () => {
    for (const level of LEVELS) {
      const plan = planForm({ level });
      const statement = plan.sections.find((s) => s.style === "statement");
      const ret = plan.sections.find((s) => s.style === "return");
      expect(statement).toBeDefined();
      expect(ret).toBeDefined();
      expect(ret!.restates).toBe(statement!.label);
    }
  });

  test("a return is the same length as what it restates", () => {
    // sectional-form copies the earlier section note for note, so a return of a
    // different length is not a return - it is a different section wearing the
    // label, and the copy would not fit.
    for (const level of LEVELS) {
      for (const plan of everyPlan(level)) {
        for (const s of plan.sections) {
          if (!s.restates) continue;
          const source = plan.sections.find((o) => o.label === s.restates);
          expect(source).toBeDefined();
          expect(s.measures).toBe(source!.measures);
        }
      }
    }
  });

  test("a restatement never points at a section that does not exist", () => {
    for (const level of LEVELS) {
      for (const plan of everyPlan(level)) {
        const labels = plan.sections.map((s) => s.label);
        for (const s of plan.sections) {
          if (s.restates) expect(labels).toContain(s.restates);
        }
      }
    }
  });
});

describe("polyphony stays inside what the level allows", () => {
  test("never over the ceiling, at any length or meter", () => {
    for (const level of LEVELS) {
      for (const plan of everyPlan(level)) {
        expect(plan.polyphony.share).toBeLessThanOrEqual(POLYPHONY_CEILING[level]);
      }
    }
  });

  test("levels 1 and 2 are homophonic - no imitative section at all", () => {
    // "Homophonic only" and "homophonic with a few simple parallel motion
    // lines". Not a small amount of imitation: none.
    for (const level of [1, 2]) {
      for (const plan of everyPlan(level)) {
        expect(plan.sections.some((s) => s.style === "imitative")).toBe(false);
        expect(plan.sections.some((s) => s.texture === "staggered")).toBe(false);
        expect(plan.polyphony.share).toBe(0);
      }
    }
  });

  test("levels 3 and up get an imitative section", () => {
    for (const level of [3, 4, 5]) {
      for (const plan of everyPlan(level)) {
        expect(plan.sections.some((s) => s.style === "imitative")).toBe(true);
      }
    }
  });

  test("an imitative section is written with staggered entrances", () => {
    // We have no fugue-like texture. Staggered entrances are what stand in for
    // it and they are imitative in effect - each part enters alone, lowest
    // first - so the plan names the texture we can actually produce.
    for (const level of LEVELS) {
      for (const plan of everyPlan(level)) {
        for (const s of plan.sections) {
          if (s.style === "imitative") expect(s.texture).toBe("staggered");
          else expect(s.texture).toBe("full");
        }
      }
    }
  });
});

describe("where the harmony goes", () => {
  test("levels 4 and 5 lean away from home somewhere", () => {
    // "Sections that move toward the V chord or the minor vi."
    for (const level of [4, 5]) {
      for (const plan of everyPlan(level)) {
        const away = plan.sections.filter((s) => s.keyArea !== "tonic");
        expect(away.length).toBeGreaterThan(0);
        expect(away.some((s) => s.keyArea === "dominant")).toBe(true);
      }
    }
  });

  test("level 5 takes the relative minor as well as the dominant", () => {
    for (const plan of everyPlan(5)) {
      const areas = new Set(plan.sections.map((s) => s.keyArea));
      expect(areas.has("dominant")).toBe(true);
      expect(areas.has("relative-minor")).toBe(true);
    }
  });

  test("levels 1 to 3 stay at home", () => {
    // Their harmony is I, IV, V, V7 with ii and vi as chords, not as places the
    // music goes and cadences.
    for (const level of [1, 2, 3]) {
      for (const plan of everyPlan(level)) {
        for (const s of plan.sections) expect(s.keyArea).toBe("tonic");
      }
    }
  });
});

describe("a full-length example is in major", () => {
  test("a minor key is refused, and says where minor belongs", () => {
    expect(() => planForm({ level: 5, key: "Cm" })).toThrow(/minor/i);
  });

  test("the key chosen is always one of the level's majors", () => {
    for (const level of LEVELS) {
      const majors = majorKeysFor(level);
      for (let i = 0; i < 50; i++) {
        expect(majors).toContain(planForm({ level }).key);
      }
    }
  });

  test("no level offers a minor key for a full-length plan", () => {
    for (const level of LEVELS) {
      for (const key of majorKeysFor(level)) expect(key.endsWith("m")).toBe(false);
    }
  });

  test("a key the level does not allow is refused", () => {
    expect(() => planForm({ level: 1, key: "B" })).toThrow(/does not allow/);
  });
});

describe("one example, two levels", () => {
  test("levels 4 and 5 reach a full cadence before the coda", () => {
    // Standard practice: the lower level stops at the cadence, the higher one
    // carries on. forgotten.abc does exactly this at bar 34 of 44.
    for (const level of [4, 5]) {
      for (const plan of everyPlan(level)) {
        const close = plan.sections.find((s) => s.style === "close");
        expect(close).toBeDefined();
        expect(plan.shortEndingBar).toBe(close!.startsAtBar + close!.measures - 1);
        expect(plan.shortEndingBar!).toBeLessThan(plan.measures);
      }
    }
  });

  test("shorter levels have no second ending to report", () => {
    for (const level of [1, 2, 3]) {
      for (const plan of everyPlan(level)) {
        expect(plan.shortEndingBar).toBeUndefined();
      }
    }
  });
});

describe("describeForm", () => {
  test("names every section, its bars and where it leans", () => {
    const lines = describeForm(planForm({ level: 5, measures: 48, key: "C" }));
    expect(lines[0]).toMatch(/Level 5, C major, 4\/4, 48 bars/);
    expect(lines.join("\n")).toMatch(/toward V/);
    expect(lines.join("\n")).toMatch(/toward vi/);
    expect(lines.join("\n")).toMatch(/staggered entrances/);
    expect(lines.join("\n")).toMatch(/may stop at bar/);
  });
});
