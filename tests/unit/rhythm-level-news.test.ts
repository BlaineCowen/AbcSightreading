import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { RHYTHM_LEVELS, levelNews } from "../../src/lib/games/rhythm-levels";

/** Tap the rhythm's level cards show what each level brings in (levelNews), as the Unison picker's symbols. */
describe("levelNews", () => {
  const news = levelNews();

  test("every level shows something: a figure, a meter, or everything mixed", () => {
    news.forEach((n, i) => expect(n.figures.length + n.meters.length > 0 || n.all, RHYTHM_LEVELS[i]!.name).toBe(true));
  });

  test("a figure or meter is new once, at the first level that has it", () => {
    const seen = new Set<string>();
    news.forEach((n) => [...n.figures, ...n.meters].forEach((x) => (expect(seen.has(x)).toBe(false), seen.add(x))));
  });

  test("every figure shown has its symbol", () => {
    for (const n of news) for (const f of n.figures) expect(existsSync(`src/assets/svgs/${f}.svg`), f).toBe(true);
  });

  test("Two beats is the 2/4 step, and Every rhythm mixes them all", () => {
    const two = RHYTHM_LEVELS.findIndex((l) => l.id === "sbs-10-rhythm");
    expect(news[two]).toEqual({ figures: [], meters: ["2/4"], all: false });
    expect(news.at(-1)!.all).toBe(true);
  });

  test("a level added after another gets only what it adds", () => {
    const extra = [...RHYTHM_LEVELS, { id: "x", name: "New", meters: ["4/4"], rhythms: [...RHYTHM_LEVELS.at(-1)!.rhythms, "eighthRestEighth"] }];
    expect(levelNews(extra).at(-1)).toEqual({ figures: ["eighthRestEighth"], meters: [], all: false });
  });
});
