import { describe, expect, test } from "bun:test";
import {
  DEFAULT_SKIP_SETTINGS, policyFor, progressionForPolicy, progressionsFromEnv, setExactOn, togglePattern, writeOverProgression,
} from "../../src/lib/skip-settings";

/**
 * The scripts decide progressions from the built skip rule; the page decides
 * from its controls. They must always agree, or the sweep tests exercises
 * nobody gets.
 */
describe("progressionForPolicy agrees with writeOverProgression", () => {
  const cases = [
    { name: "max skip of a step", maxSkip: 1, skips: DEFAULT_SKIP_SETTINGS },
    { name: "max skip of a third", maxSkip: 2, skips: DEFAULT_SKIP_SETTINGS },
    { name: "max skip of a fifth", maxSkip: 4, skips: DEFAULT_SKIP_SETTINGS },
    { name: "exact skips, none listed", maxSkip: 4, skips: setExactOn(DEFAULT_SKIP_SETTINGS, true) },
    { name: "exact skips, the tonic triad", maxSkip: 1, skips: togglePattern(DEFAULT_SKIP_SETTINGS, "tonic-triad") },
  ];
  for (const c of cases) {
    test(c.name, () => {
      expect(progressionForPolicy(policyFor(c.maxSkip, c.skips))).toBe(writeOverProgression(c.maxSkip, c.skips));
    });
  }
  test("a bare number is a Max skip", () => {
    expect(progressionForPolicy(1)).toBe(false);
    expect(progressionForPolicy(4)).toBe(true);
  });
});

test("PROGRESSIONS forces it either way; unset follows the rule", () => {
  expect(progressionsFromEnv("1", 1)).toBe(true);
  expect(progressionsFromEnv("0", 4)).toBe(false);
  expect(progressionsFromEnv(undefined, 1)).toBe(false);
  expect(progressionsFromEnv(undefined, 4)).toBe(true);
});
