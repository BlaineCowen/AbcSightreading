import { describe, expect, test } from "bun:test";
import { levelSections, sectionToOpen } from "../../src/lib/preset-sections";

describe("the Levels tab's sections", () => {
  test("Unison lists abcStepByStep then NYSSMA Voice; Choral abcStepByStep then UIL", () => {
    expect(levelSections({ uil: false, nyssma: true }).map((s) => s.label)).toEqual(["abcStepByStep", "NYSSMA Voice"]);
    expect(levelSections({ uil: true, nyssma: false }).map((s) => s.label)).toEqual(["abcStepByStep", "UIL"]);
    expect(levelSections({ uil: false, nyssma: false }).map((s) => s.id)).toEqual(["steps"]);
  });

  test("the section holding the active preset opens", () => {
    const unison = levelSections({ uil: false, nyssma: true });
    const choral = levelSections({ uil: true, nyssma: false });
    expect(sectionToOpen(unison, { step: false, nyssma: true, uil: false })).toBe("nyssma");
    expect(sectionToOpen(unison, { step: true, nyssma: false, uil: false })).toBe("steps");
    expect(sectionToOpen(choral, { step: false, nyssma: false, uil: true })).toBe("uil");
  });

  test("with no built-in preset active, abcStepByStep opens (where a newcomer starts)", () => {
    const choral = levelSections({ uil: true, nyssma: false });
    const unison = levelSections({ uil: false, nyssma: true });
    expect(sectionToOpen(choral, { step: false, nyssma: false, uil: false })).toBe("steps");
    expect(sectionToOpen(unison, { step: false, nyssma: false, uil: false })).toBe("steps");
    // Unsubscribed from it: nothing opens.
    const without = levelSections({ uil: false, nyssma: true, subscribed: ["nyssma-voice"] });
    expect(sectionToOpen(without, { step: false, nyssma: false, uil: false })).toBeNull();
  });

  test("an active level whose section is not offered opens nothing", () => {
    const unison = levelSections({ uil: false, nyssma: true });
    expect(sectionToOpen(unison, { step: false, nyssma: false, uil: true })).toBeNull();
  });
});

describe("subscriptions choose the sections", () => {
  test("only what is subscribed shows, and the page must offer it", () => {
    expect(levelSections({ uil: false, nyssma: true, subscribed: ["nyssma-voice", "uil-choir"] }).map((s) => s.id)).toEqual(["nyssma"]);
    expect(levelSections({ uil: false, nyssma: true, subscribed: [] }).map((s) => s.id)).toEqual([]);
    expect(levelSections({ uil: false, nyssma: true, tracks: 2, subscribed: ["abc-step-by-step"] }).map((s) => s.id)).toEqual(["steps", "tracks"]);
  });
});

describe("UIL on the Choral page", () => {
  test("its five levels show whatever is subscribed", () => {
    expect(levelSections({ uil: true, nyssma: false, subscribed: [] }).map((s) => s.id)).toEqual(["uil"]);
    expect(levelSections({ uil: true, nyssma: false, subscribed: ["abc-step-by-step"] }).map((s) => s.id)).toEqual(["steps", "uil"]);
  });
});
