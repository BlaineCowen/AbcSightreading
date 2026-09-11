/**
 * A rhythm's name, in words.
 *
 * `Rhythm.name` is an identifier - `dotEighthSixteenth`, `fourSixteenths` - and
 * the UI shows rhythms as engraved icons, which is right for a musician reading
 * the panel. It leaves the buttons with no accessible name at all: a screen
 * reader announces "button", and the three frequency rows under How Often are
 * three identical "Normal" buttons distinguishable only by a picture.
 *
 * So this exists to name them. Not to be displayed - the icon is better - but to
 * go in `aria-label`, where the icon cannot go.
 *
 * Tokenised against a dictionary rather than split on capitals, because
 * `thirtySecond` is one note value and a naive split makes it two.
 */

/**
 * Singular only, longest first.
 *
 * Plurals deliberately are NOT tokens. Listing `sixteenths` alongside
 * `sixteenth` looks harmless and is not: in `sixteenthEighthSixteenth` the
 * `eighths` entry matches across the seam between the second and third values,
 * eats a letter of the one after it, and the whole name falls through as
 * unlabelled. A plural only ever follows a count, so it is handled there.
 */
const TOKENS: [string, string][] = [
  ["thirtysecond", "thirty-second"],
  ["sixteenth", "sixteenth"],
  ["eighth", "eighth"],
  ["quarter", "quarter"],
  ["half", "half"],
  ["whole", "whole"],
];

/** Words that modify the value that follows, or the one just before. */
const COUNTS: Record<string, string> = { two: "two", three: "three", four: "four" };

type Part = { count?: string; dotted?: boolean; value: string; rest?: boolean };

export function rhythmLabel(name: string): string {
  const lower = name.toLowerCase();
  const parts: Part[] = [];
  let dotted = false;
  let count: string | undefined;

  let i = 0;
  while (i < lower.length) {
    if (lower.startsWith("dot", i)) {
      dotted = true;
      i += 3;
      continue;
    }
    if (lower.startsWith("rest", i)) {
      // A rest belongs to the value just written: `eighthRest` is an eighth
      // rest, and in `eighthRestEighth` it is the FIRST eighth that is silent.
      if (parts.length > 0) parts[parts.length - 1].rest = true;
      i += 4;
      continue;
    }
    const word = Object.keys(COUNTS).find((c) => lower.startsWith(c, i));
    if (word) {
      count = COUNTS[word];
      i += word.length;
      continue;
    }
    const token = TOKENS.find(([t]) => lower.startsWith(t, i));
    if (!token) {
      // An unknown name is better shown raw than silently mangled.
      return name;
    }
    i += token[0].length;
    // `fourSixteenths`: the plural `s` rides along with the count, and only
    // with a count, so it can never be mistaken for the start of a value.
    let value = token[1];
    if (count && lower[i] === "s") {
      value = value === "half" ? "halves" : `${value}s`;
      i += 1;
    }
    parts.push({ count, dotted: dotted || undefined, value });
    dotted = false;
    count = undefined;
  }

  if (parts.length === 0) return name;
  return parts
    .map((p) =>
      [p.count, p.dotted ? "dotted" : null, p.value, p.rest ? "rest" : null]
        .filter(Boolean)
        .join(" ")
    )
    .join(", ");
}
