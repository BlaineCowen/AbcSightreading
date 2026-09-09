import type { Rhythm } from "../resources/rhythms";

/**
 * The rhythmic shapes a non-chord tone may take.
 *
 * This used to be `params.selectedRhythms.filter(r => r.pattern)` - the user's
 * *main* rhythm menu doing double duty as the decoration vocabulary. That
 * conflated two unrelated choices: what the exercise's rhythmic surface should
 * be, and what a passing tone is allowed to look like. On a UIL level 2
 * selection the only pattern rhythm ticked is `dotQuarterEighth`, so **only
 * half notes could be decorated, and only ever into a dotted quarter plus an
 * eighth** - which is why every NCT in that preset came out dotted. 65% of all
 * NCT attempts died on "no pattern rhythm of that length", silently.
 *
 * These live here rather than in `rhythms.ts` because they are not rhythms a
 * user picks or that the main generator tiles a measure with; `quarterQuarter`
 * as a menu entry would just be "quarter" twice. Keeping them separate also
 * keeps them out of `selectableRhythms`, and so out of the check-rhythm
 * selection matrix.
 *
 * Every entry is exactly two notes, because that is what the NCT generators
 * accept (`abcValue.length !== 2` returns null). Four of the ten pattern
 * rhythms in `rhythms.ts` have three or four notes and could therefore never
 * produce a decoration at all - a third of all attempts wasted. Teaching the
 * generators longer patterns (double passing tones, turns) is worth doing, and
 * this list is where they would be added.
 *
 * `L:1/32`, so abcValue entries are 32nd-note counts: 4 = eighth, 8 = quarter,
 * 16 = half, 24 = dotted half.
 */
const base = {
  rest: false,
  pattern: true,
  maxRng: 0,
  isPatternNote: true,
} as const;

export const nctPatterns: Rhythm[] = [
  // Even subdivisions. Neither of these existed, which meant the most ordinary
  // decoration in the style - a half note becoming two quarters with a passing
  // tone between the chord tones - could not be produced at all.
  {
    ...base,
    name: "nctQuarterQuarter",
    abcValue: ["8", "8"],
    meterValue: [1 / 4, 1 / 4],
    totalValue: 16,
    oddsWeight: 10,
    weight: 10,
    symbol: "𝄘𝄘",
  },
  {
    ...base,
    name: "nctHalfHalf",
    abcValue: ["16", "16"],
    meterValue: [1 / 2, 1 / 2],
    totalValue: 32,
    oddsWeight: 8,
    weight: 8,
    symbol: "𝄗𝄗",
  },
  {
    ...base,
    name: "nctEighthEighth",
    abcValue: ["4", "4"],
    meterValue: [1 / 8, 1 / 8],
    totalValue: 8,
    oddsWeight: 10,
    weight: 10,
    symbol: "𝄙𝄙",
  },
  // Three- and four-note figures. These are what let a passing tone cross a 4th
  // or a 5th: the figure needs one note per step of the journey, so a leap wider
  // than a 3rd simply could not be filled while every pattern was two notes.
  // They also carry the double neighbour.
  {
    ...base,
    name: "nctThreeEighths",
    abcValue: ["4", "4", "4"],
    meterValue: [1 / 8, 1 / 8, 1 / 8],
    totalValue: 12,
    oddsWeight: 6,
    weight: 6,
    symbol: "\ud834\udd19\ud834\udd19\ud834\udd19",
  },
  {
    ...base,
    name: "nctThreeQuarters",
    abcValue: ["8", "8", "8"],
    meterValue: [1 / 4, 1 / 4, 1 / 4],
    totalValue: 24,
    oddsWeight: 6,
    weight: 6,
    symbol: "\ud834\udd18\ud834\udd18\ud834\udd18",
  },
  {
    ...base,
    name: "nctQuarterEighthEighth",
    abcValue: ["8", "4", "4"],
    meterValue: [1 / 4, 1 / 8, 1 / 8],
    totalValue: 16,
    oddsWeight: 5,
    weight: 5,
    symbol: "\ud834\udd18\ud834\udd19\ud834\udd19",
  },
  {
    ...base,
    name: "nctHalfQuarterQuarter",
    abcValue: ["16", "8", "8"],
    meterValue: [1 / 2, 1 / 4, 1 / 4],
    totalValue: 32,
    oddsWeight: 4,
    weight: 4,
    symbol: "\ud834\udd17\ud834\udd18\ud834\udd18",
  },
  {
    ...base,
    name: "nctFourEighths",
    abcValue: ["4", "4", "4", "4"],
    meterValue: [1 / 8, 1 / 8, 1 / 8, 1 / 8],
    totalValue: 16,
    oddsWeight: 4,
    weight: 4,
    symbol: "\ud834\udd19\ud834\udd19\ud834\udd19\ud834\udd19",
  },
  {
    ...base,
    name: "nctFourQuarters",
    abcValue: ["8", "8", "8", "8"],
    meterValue: [1 / 4, 1 / 4, 1 / 4, 1 / 4],
    totalValue: 32,
    oddsWeight: 4,
    weight: 4,
    symbol: "\ud834\udd18\ud834\udd18\ud834\udd18\ud834\udd18",
  },
  // Dotted values, split at the natural point: a dotted quarter is a quarter
  // plus an eighth, a dotted half a half plus a quarter. Without these, any
  // dotted note in the surface simply could not be decorated - the remaining
  // "no pattern of that length" bails were all totalValue 12 and 24.
  {
    ...base,
    name: "nctQuarterEighth",
    abcValue: ["8", "4"],
    meterValue: [1 / 4, 1 / 8],
    totalValue: 12,
    oddsWeight: 8,
    weight: 8,
    symbol: "\ud834\udd18\ud834\udd19",
  },
  {
    ...base,
    name: "nctHalfQuarter",
    abcValue: ["16", "8"],
    meterValue: [1 / 2, 1 / 4],
    totalValue: 24,
    oddsWeight: 6,
    weight: 6,
    symbol: "\ud834\udd17\ud834\udd18",
  },
  // Uneven subdivisions. These were the *only* shapes available before, and are
  // deliberately weighted below the even ones now - a dotted decoration should
  // be a colour, not the default.
  {
    ...base,
    name: "nctDotQuarterEighth",
    abcValue: ["12", "4"],
    meterValue: [3 / 8, 1 / 8],
    totalValue: 16,
    oddsWeight: 4,
    weight: 4,
    symbol: "𝄘•𝄙",
  },
  {
    ...base,
    name: "nctDotHalfQuarter",
    abcValue: ["24", "8"],
    meterValue: [3 / 4, 1 / 4],
    totalValue: 32,
    oddsWeight: 3,
    weight: 3,
    symbol: "𝄗•𝄘",
  },
  {
    ...base,
    name: "nctDotEighthSixteenth",
    abcValue: ["6", "2"],
    meterValue: [3 / 16, 1 / 16],
    totalValue: 8,
    oddsWeight: 2,
    weight: 2,
    symbol: "𝄙•𝄚",
  },
];

/** Shortest note in a rhythm, in 32nd-note units. */
function shortestNote(rhythm: Rhythm): number {
  const values = rhythm.abcValue
    .map((v) => parseInt(v))
    .filter((v) => !isNaN(v) && v > 0);
  return values.length ? Math.min(...values) : rhythm.totalValue;
}

/**
 * The decoration vocabulary for a given exercise.
 *
 * Decoupling the NCT patterns from the rhythm menu must not mean a level 1
 * exercise sprouting sixteenths, so the *difficulty ceiling* is still taken
 * from the selection even though the shapes no longer are: a decoration may not
 * introduce a note shorter than the shortest note the user already asked for.
 *
 * Level 1 (whole/half/quarter) therefore decorates in quarters and halves;
 * level 2, which includes a dotted quarter-eighth, unlocks eighths as well.
 */
export function nctPatternsFor(selectedRhythms: Rhythm[]): Rhythm[] {
  const floor = selectedRhythms.length
    ? Math.min(...selectedRhythms.map(shortestNote))
    : 8;
  return nctPatterns.filter((p) => shortestNote(p) >= floor);
}
