import { describe, expect, test } from "bun:test";
import { rhythmLabel } from "../../src/lib/rhythm-labels";
import { rhythms } from "../../src/resources/rhythms";

/**
 * These strings are never shown; they go in `aria-label`, so a wrong one is
 * silent. The sweep at the bottom is the important test - it is what catches a
 * rhythm added later whose name the tokeniser does not know, which would
 * otherwise fall through the escape and announce "dotEighthSixteenth".
 */

describe("rhythm labels", () => {
  test("plain values", () => {
    expect(rhythmLabel("quarter")).toBe("quarter");
    expect(rhythmLabel("half")).toBe("half");
    expect(rhythmLabel("whole")).toBe("whole");
  });

  test("thirtySecond is one value, not two words", () => {
    // The reason this is tokenised rather than split on capitals.
    expect(rhythmLabel("thirtySecond")).toBe("thirty-second");
  });

  test("a dot modifies the value after it", () => {
    expect(rhythmLabel("dotQuarter")).toBe("dotted quarter");
    expect(rhythmLabel("dotHalf")).toBe("dotted half");
  });

  test("a rest modifies the value before it", () => {
    expect(rhythmLabel("quarterRest")).toBe("quarter rest");
    expect(rhythmLabel("dotEighthRest")).toBe("dotted eighth rest");
  });

  test("figures read in order", () => {
    expect(rhythmLabel("dotQuarterEighth")).toBe("dotted quarter, eighth");
    expect(rhythmLabel("eighthDotQuarter")).toBe("eighth, dotted quarter");
    expect(rhythmLabel("sixteenthEighthSixteenth")).toBe(
      "sixteenth, eighth, sixteenth"
    );
  });

  test("a rest inside a figure silences only its own note", () => {
    // eighthRestEighth is an eighth rest and then an eighth note, so the rest
    // must attach to the first eighth and not to the second.
    expect(rhythmLabel("eighthRestEighth")).toBe("eighth rest, eighth");
  });

  test("a count applies to the value it precedes", () => {
    expect(rhythmLabel("fourSixteenths")).toBe("four sixteenths");
  });

  test("an unknown name comes back unchanged rather than mangled", () => {
    expect(rhythmLabel("quintuplet")).toBe("quintuplet");
  });

  test("every rhythm in the app gets a real label", () => {
    // A name the tokeniser does not know comes back verbatim, so the test is
    // that every word of every label is vocabulary - `quarter` cannot be caught
    // by comparing against the name, since its label IS its name.
    const WORDS = new Set([
      "thirty-second", "sixteenth", "sixteenths", "eighth", "eighths",
      "quarter", "quarters", "half", "halves", "whole", "wholes",
      "dotted", "rest", "two", "three", "four",
    ]);
    for (const r of rhythms) {
      for (const word of rhythmLabel(r.name).split(/[\s,]+/).filter(Boolean)) {
        expect([r.name, word]).toEqual([r.name, word.toLowerCase()]);
        expect(WORDS.has(word) ? word : `${r.name} -> unknown word "${word}"`)
          .toBe(word);
      }
    }
  });
});
