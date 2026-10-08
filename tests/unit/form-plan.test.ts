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
    // UIL's current criteria (7 October 2026): about 24 at Levels 1-2, 32-36
    // at Level 3, about 32 at Level 4, 32-36 for 5A plus 12-16 for 6A.
    expect(requiredMeasures(1)).toEqual([24, 26]);
    expect(requiredMeasures(2)).toEqual([24, 26]);
    expect(requiredMeasures(3)).toEqual([32, 36]);
    expect(requiredMeasures(4)).toEqual([32, 34]);
    expect(requiredMeasures(5)).toEqual([32, 52]);
  });

  test("3/4 is the same amount of music, not the same number of barlines", () => {
    // The criteria say "or equivalent in 3/4" everywhere and do the arithmetic
    // once, at level 3: 32-36 measures in 4/4 or 42-48 in 3/4. Converting by
    // beats reproduces that exactly, which is what says the reading is right.
    expect(requiredMeasures(3, "3/4")).toEqual([42, 48]);
  });

  test("2/4 needs twice the bars of 4/4", () => {
    expect(requiredMeasures(4, "2/4")).toEqual([64, 68]);
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
    expect(() => planForm({ level: 1, measures: 8 })).toThrow(/24-26/);
    expect(() => planForm({ level: 5, measures: 100 })).toThrow(/32-52/);
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
  test("level 5's B section turns to the relative minor, and nowhere else", () => {
    // UIL: "possible modulation to relative minor keys"; Blaine: an 8-bar or so
    // B section in the relative minor.
    for (const plan of everyPlan(5)) {
      const away = plan.sections.filter((s) => s.keyArea !== "tonic");
      expect(away.map((s) => s.label)).toEqual(["B"]);
      expect(away[0].keyArea).toBe("relative-minor");
    }
  });

  test("levels 1 to 4 stay at home", () => {
    // UIL names no modulation below Level 5; ii and vi are chords, not places
    // the music goes and cadences.
    for (const level of [1, 2, 3, 4]) {
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

describe("one example, 5A and 6A", () => {
  test("a Level 5 piece past the 5A length stops for 5A at a full cadence, 6A going on", () => {
    // Both of Blaine's Level 5 pieces "stop at m32" for 5A and run on for 6A.
    for (const plan of everyPlan(5)) {
      const fiveAMax = Math.floor((36 * 4) / ({ "4/4": 4, "3/4": 3, "2/4": 2 } as Record<string, number>)[plan.meter]);
      if (plan.measures <= fiveAMax) continue;
      const close = plan.sections.find((s) => s.style === "close")!;
      expect(plan.shortEndingBar).toBe(close.startsAtBar + close.measures - 1);
      expect(plan.shortEndingBar!).toBeLessThan(plan.measures);
      expect(plan.sections.at(-1)!.style).toBe("coda");
    }
    expect(planForm({ level: 5, measures: 48 }).shortEndingBar).toBe(32);
  });

  test("other levels, and a 5A-length piece, have no second ending to report", () => {
    expect(planForm({ level: 5, measures: 32 }).shortEndingBar).toBeUndefined();
    for (const level of [1, 2, 3, 4]) {
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
    expect(lines.join("\n")).toMatch(/toward vi/);
    expect(lines.join("\n")).toMatch(/staggered entrances/);
    expect(lines.join("\n")).toMatch(/5A stops at bar 32/);
  });
});

test("12/8 is four beats a bar, so a level wants as many bars as in 4/4", () => {
  // Read by its top number it was twelve beats, a third of the bars.
  expect(requiredMeasures(3, "12/8")).toEqual(requiredMeasures(3, "4/4"));
});
