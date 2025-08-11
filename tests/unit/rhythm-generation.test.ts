import type { Rhythm } from "../resources/rhythms";
import {
  generateRandomRhythm,
  type RhythmWithPattern,
  type TimeSig,
} from "../lib/rhythm-generation";

describe("Rhythm Array Generation", () => {
  // Test data
  const quarterNote: Rhythm = {
    name: "quarter",
    abcValue: ["8"],
    meterValue: [1 / 4],
    totalValue: 8,
    rest: false,
    oddsWeight: 10,
    maxRng: 0,
    pattern: false,
    symbol: "𝄘",
    weight: 10,
  };

  const eighthNote: Rhythm = {
    name: "eighth",
    abcValue: ["4"],
    meterValue: [1 / 8],
    totalValue: 4,
    rest: false,
    oddsWeight: 10,
    maxRng: 0,
    pattern: false,
    symbol: "𝄙",
    weight: 10,
  };

  const halfNote: Rhythm = {
    name: "half",
    abcValue: ["16"],
    meterValue: [1 / 2],
    totalValue: 16,
    rest: false,
    oddsWeight: 10,
    maxRng: 0,
    pattern: false,
    symbol: "𝄗",
    weight: 10,
  };

  const quarterRest: Rhythm = {
    name: "quarterRest",
    abcValue: ["8"],
    meterValue: [1 / 4],
    totalValue: 8,
    rest: true,
    oddsWeight: 10,
    maxRng: 0,
    pattern: false,
    symbol: "𝄽",
    weight: 10,
  };

  const eighthRest: Rhythm = {
    name: "eighthRest",
    abcValue: ["4"],
    meterValue: [1 / 8],
    totalValue: 4,
    rest: true,
    oddsWeight: 10,
    maxRng: 0,
    pattern: false,
    symbol: "𝄾",
    weight: 10,
  };

  const dottedQuarterEighth: Rhythm = {
    name: "dottedQuarterEighth",
    abcValue: ["12", "4"],
    meterValue: [3 / 8, 1 / 8],
    totalValue: 16,
    rest: false,
    oddsWeight: 10,
    maxRng: 0,
    pattern: true,
    symbol: "𝄘•𝄙",
    weight: 10,
  };

  const commonTime: TimeSig = {
    name: "4/4",
    tsPerMeasure: 32, // In 32nd notes
  };

  const threeFourTime: TimeSig = {
    name: "3/4",
    tsPerMeasure: 24, // In 32nd notes
  };

  test("should generate all rests", () => {
    const measures = 1;
    const allowedRhythms = [quarterRest, eighthRest];
    const result = generateRandomRhythm(commonTime, measures, allowedRhythms);

    // All rhythms should be rests
    result.forEach((rhythm) => {
      expect(rhythm.rest).toBe(true);
    });

    // Total should add up to one measure
    const total = result.reduce((sum, rhythm) => sum + rhythm.totalValue, 0);
    expect(total).toBe(commonTime.tsPerMeasure);
  });

  test("should generate simple pattern with quarters, eighths, and dotted pattern", () => {
    const measures = 1;
    const allowedRhythms = [quarterNote, eighthNote, dottedQuarterEighth];
    const result = generateRandomRhythm(commonTime, measures, allowedRhythms);

    // Total should add up to one measure
    const total = result.reduce((sum, rhythm) => sum + rhythm.totalValue, 0);
    expect(total).toBe(commonTime.tsPerMeasure);

    // Each rhythm should be one of the allowed types
    result.forEach((rhythm) => {
      const isAllowedRhythm = allowedRhythms.some(
        (allowed) =>
          rhythm.name === allowed.name ||
          (rhythm.isPatternNote && allowed.name === "dottedQuarterEighth")
      );
      expect(isAllowedRhythm).toBe(true);
    });
  });

  test("should throw error for half notes in 3/4 time", () => {
    const measures = 1;
    const allowedRhythms = [halfNote];

    expect(() => {
      generateRandomRhythm(threeFourTime, measures, allowedRhythms);
    }).toThrow();
  });

  // Five random rhythm tests
  const randomRhythms = [
    quarterNote,
    eighthNote,
    halfNote,
    quarterRest,
    eighthRest,
    dottedQuarterEighth,
  ];

  for (let i = 1; i <= 5; i++) {
    test(`random rhythm test ${i}`, () => {
      const measures = Math.floor(Math.random() * 3) + 1; // 1-3 measures
      const result = generateRandomRhythm(commonTime, measures, randomRhythms);

      // Total should add up to correct number of measures
      const total = result.reduce((sum, rhythm) => sum + rhythm.totalValue, 0);
      expect(total).toBe(commonTime.tsPerMeasure * measures);

      // Each rhythm should be one of the allowed types
      result.forEach((rhythm) => {
        const isAllowedRhythm = randomRhythms.some(
          (allowed) =>
            rhythm.name === allowed.name ||
            (rhythm.isPatternNote && allowed.name === "dottedQuarterEighth")
        );
        expect(isAllowedRhythm).toBe(true);
      });
    });
  }

  test("should throw error when rhythms can't divide time signature evenly", () => {
    const measures = 1;
    const invalidRhythm: Rhythm = {
      name: "invalid",
      abcValue: ["7"], // 7/32 note - can't divide 4/4 evenly
      meterValue: [7 / 32],
      totalValue: 7,
      rest: false,
      oddsWeight: 10,
      maxRng: 0,
      pattern: false,
      symbol: "𝄘",
      weight: 10,
    };

    expect(() => {
      generateRandomRhythm(commonTime, measures, [invalidRhythm]);
    }).toThrow();
  });
});
