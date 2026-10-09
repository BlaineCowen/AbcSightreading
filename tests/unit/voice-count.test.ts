import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { DEFAULT_VOICE, VOICE_WORDS, countWords, voiceFrom, wordAt } from "../../src/lib/tuner/voice-count";

describe("the counting voice", () => {
  test("Counting says the beat's number and the page's subdivision words", () => {
    expect(countWords("counting", 1, 2, false)).toEqual(["3"]);
    expect(countWords("counting", 2, 0, false)).toEqual(["1", "and"]);
    expect(countWords("counting", 4, 3, false)).toEqual(["4", "e", "and", "a"]);
    expect(countWords("counting", 3, 1, false)).toEqual(["2", "trip", "let"]);
    expect(countWords("counting", 3, 0, true)).toEqual(["1", "la", "li"]);
    expect(countWords("counting", 6, 1, true)).toEqual(["2", "ta", "la", "ta", "li", "ta"]);
  });

  test("Kodály says ta on the beat, ti-ti, ti ki ti ki, tri o la, and ti ti ti in compound", () => {
    expect(countWords("kodaly", 1, 5, false)).toEqual(["ta"]);
    expect(countWords("kodaly", 2, 0, false)).toEqual(["ti", "ti"]);
    expect(countWords("kodaly", 4, 0, false)).toEqual(["ti", "ki", "ti", "ki"]);
    expect(countWords("kodaly", 3, 0, false)).toEqual(["tri", "o", "la"]);
    expect(countWords("kodaly", 3, 0, true)).toEqual(["ti", "ti", "ti"]);
  });

  test("too fast to say, a subdivision is left out and the beat is counted plainly", () => {
    expect(wordAt("counting", 4, 1, 0, false, 0.1)).toBeNull();
    expect(wordAt("counting", 4, 0, 2, false, 0.1)).toBe("3");
    expect(wordAt("kodaly", 4, 0, 0, false, 0.1)).toBe("ta");
    expect(wordAt("kodaly", 4, 1, 0, false, 0.2)).toBe("ki");
    expect(countWords("counting", 8, 0, false).slice(1).every((w) => w === null)).toBe(true);
  });

  test("every word it can say has a built file and a lead-in", () => {
    const manifest = JSON.parse(readFileSync("public/voice/robot/manifest.json", "utf8"));
    const said = new Set<string>();
    for (const system of ["counting", "kodaly"] as const) for (const compound of [false, true]) for (const grid of [1, 2, 3, 4, 6, 8]) for (let beat = 0; beat < 12; beat++) {
      for (const w of countWords(system, grid, beat, compound)) if (w) said.add(w);
    }
    for (const w of said) {
      expect({ w, built: !!manifest[w] }).toEqual({ w, built: true });
      expect(manifest[w].leadIn).toBeGreaterThanOrEqual(0);
    }
    expect(Object.keys(VOICE_WORDS).sort()).toEqual(Object.keys(manifest).sort());
  });

  test("settings read back whole", () => {
    expect(voiceFrom(undefined)).toEqual(DEFAULT_VOICE);
    expect(voiceFrom({ mode: "voice", system: "kodaly", volume: 2 })).toEqual({ mode: "voice", system: "kodaly", volume: DEFAULT_VOICE.volume });
  });
});
