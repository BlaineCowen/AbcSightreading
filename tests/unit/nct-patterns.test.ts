import { describe, expect, test } from "bun:test";
import { nctPatterns, nctPatternsFor } from "../../src/lib/nct-patterns";
import { uilPresets } from "../../src/lib/uil-presets";
import { rhythms } from "../../src/resources/rhythms";

/**
 * The shapes a decoration is allowed to take.
 *
 * The vocabulary is separate from the user's rhythm menu, but the menu still
 * sets the ceiling: a decoration may not introduce a note shorter than the
 * shortest one already asked for.
 */

const shortest = (r: { abcValue: string[] }) =>
  Math.min(...r.abcValue.map((v) => parseInt(v)).filter((v) => v > 0));

const menuFor = (preset: string) => {
  const names = (uilPresets as Record<string, { allowedRhythmNames: string[] }>)[preset]
    .allowedRhythmNames;
  return rhythms.filter((r) => names.includes(r.name));
};

describe("the decoration vocabulary", () => {
  test("no decoration is a dotted eighth plus a sixteenth", () => {
    // It was the only shape whose shortest note is a sixteenth, so the floor
    // kept it out of every level but 5 - which meant the hardest rhythm on a
    // level 5 page arrived as decoration rather than as anything chosen.
    expect(nctPatterns.map((p) => p.name)).not.toContain("nctDotEighthSixteenth");
  });

  test("nothing in the library needs a note shorter than an eighth", () => {
    // Stated as a property rather than a name, so adding another snapped figure
    // trips this too.
    expect(nctPatterns.filter((p) => shortest(p) < 4).map((p) => p.name)).toEqual([]);
  });

  test("UIL 5 gets no sixteenth-bearing decoration, though its menu has sixteenths", () => {
    const menu = menuFor("UIL 5");
    expect(menu.some((r) => shortest(r) === 2)).toBe(true); // fourSixteenths is there
    expect(nctPatternsFor(menu).filter((p) => shortest(p) === 2)).toEqual([]);
  });

  test("the ceiling still holds: UIL 1 decorates no faster than it sings", () => {
    const menu = menuFor("UIL 1");
    const floor = Math.min(...menu.map(shortest));
    for (const p of nctPatternsFor(menu)) expect(shortest(p)).toBeGreaterThanOrEqual(floor);
  });

  test("a level with eighths may decorate in eighths", () => {
    // The ceiling must not have been lowered into a blanket ban - level 5 should
    // still get the ordinary fast decorations, just not the snapped one.
    const got = nctPatternsFor(menuFor("UIL 5")).map((p) => p.name);
    expect(got).toContain("nctEighthEighth");
    expect(got).toContain("nctQuarterQuarter");
  });
});
