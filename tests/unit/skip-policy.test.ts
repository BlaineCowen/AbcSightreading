import { describe, expect, test } from "bun:test";
import {
  isAllowedMove, landablePolicy, largestSkip, livePitches, sungLengths, toSkipPolicy, STEP_ONLY, type SkipPolicy,
} from "../../src/lib/skip-policy";
import { degreesConnected } from "../../src/lib/skip-settings";

/**
 * The move rule. A note in C major: pitchValue indexes noteArray, which is
 * diatonic (C4 = 14, so a distance of 2 is a 3rd), and degree is 0-based.
 */
const n = (pitchValue: number, chromatic = false) => ({ pitchValue, degree: pitchValue % 7, chromatic });
const [G3, C4, D4, E4, F4, G4, C5, E5] = [11, 14, 15, 16, 17, 18, 21, 23];
const EIGHTH = 4, QUARTER = 8, HALF = 16;
const LEVEL_II: SkipPolicy = {
  kind: "custom",
  moves: [{ from: 1, to: 3, dir: "up" }, { from: 3, to: 5, dir: "up" }],
  landOn: [QUARTER],
};

describe("isAllowedMove", () => {
  test("re↑fa is refused at Level II", () => {
    expect(isAllowedMove(n(D4), n(F4), QUARTER, LEVEL_II)).toBe(false);
  });

  test("do↑mi is allowed in any octave, and so is mi↑sol", () => {
    expect(isAllowedMove(n(C4), n(E4), QUARTER, LEVEL_II)).toBe(true);
    expect(isAllowedMove(n(C5), n(E5), QUARTER, LEVEL_II)).toBe(true);
    expect(isAllowedMove(n(7), n(9), QUARTER, LEVEL_II)).toBe(true); // C3 to E3
    expect(isAllowedMove(n(E4), n(G4), QUARTER, LEVEL_II)).toBe(true);
  });

  test("do↓mi and mi↓do are refused when only ↑ is listed", () => {
    expect(isAllowedMove(n(C5), n(E4), QUARTER, LEVEL_II)).toBe(false);
    expect(isAllowedMove(n(E4), n(C4), QUARTER, LEVEL_II)).toBe(false);
  });

  test("a 10th is refused for a 1↑3 row: listed skips are simple intervals", () => {
    expect(isAllowedMove(n(C4), n(E5), QUARTER, LEVEL_II)).toBe(false);
  });

  test("a skip onto an eighth (or a half) is refused when skips land on quarters", () => {
    expect(isAllowedMove(n(C4), n(E4), EIGHTH, LEVEL_II)).toBe(false);
    expect(isAllowedMove(n(C4), n(E4), HALF, LEVEL_II)).toBe(false);
    const anywhere: SkipPolicy = { kind: "custom", moves: LEVEL_II.kind === "custom" ? LEVEL_II.moves : [] };
    expect(isAllowedMove(n(C4), n(E4), EIGHTH, anywhere)).toBe(true);
  });

  test("steps and repeated notes are always allowed, on any length", () => {
    const policies: SkipPolicy[] = [LEVEL_II, { kind: "custom", moves: [] }, STEP_ONLY, { kind: "max", maxSkip: 3 }];
    for (const p of policies) {
      for (const len of [EIGHTH, QUARTER, HALF]) {
        expect(isAllowedMove(n(C4), n(D4), len, p)).toBe(true);
        expect(isAllowedMove(n(D4), n(C4), len, p)).toBe(true);
        expect(isAllowedMove(n(C4), n(C4), len, p)).toBe(true);
      }
    }
  });

  test("in custom mode a chromatic note is reached and left only by step", () => {
    const doMi: SkipPolicy = { kind: "custom", moves: [{ from: 1, to: 3, dir: "both" }] };
    expect(isAllowedMove(n(C4), n(E4, true), QUARTER, doMi)).toBe(false);
    expect(isAllowedMove(n(C4, true), n(E4), QUARTER, doMi)).toBe(false);
    expect(isAllowedMove(n(D4), n(E4, true), QUARTER, doMi)).toBe(true);
    // Max skip mode is today's rule, which never looked at alterations.
    expect(isAllowedMove(n(C4), n(E4, true), QUARTER, { kind: "max", maxSkip: 4 })).toBe(true);
  });

  test("max mode is exactly today's rule: diatonic distance <= maxSkip", () => {
    for (let d = 0; d <= 9; d++) {
      expect(isAllowedMove(n(C4), n(C4 + d), QUARTER, { kind: "max", maxSkip: 4 })).toBe(d <= 4);
      expect(isAllowedMove(n(C4), n(C4 + d), EIGHTH, STEP_ONLY)).toBe(d <= 1);
    }
  });

  test("↑ and ↓ rows stay directed: Sol-Do ↓ does not allow do→sol", () => {
    const solDo: SkipPolicy = { kind: "custom", moves: [{ from: 5, to: 1, dir: "down" }] };
    expect(isAllowedMove(n(G4), n(C4), QUARTER, solDo)).toBe(true);
    expect(isAllowedMove(n(G3), n(C4), QUARTER, solDo)).toBe(false);
    expect(isAllowedMove(n(C4), n(G3), QUARTER, solDo)).toBe(false);
  });

  test("↕ both allows either direction; Do-Sol ↓ is the 4th down to the sol below", () => {
    const both: SkipPolicy = { kind: "custom", moves: [{ from: 1, to: 5, dir: "both" }] };
    expect(isAllowedMove(n(C4), n(G4), QUARTER, both)).toBe(true); // a 5th up
    expect(isAllowedMove(n(C4), n(G3), QUARTER, both)).toBe(true); // a 4th down
    expect(isAllowedMove(n(G4), n(C4), QUARTER, both)).toBe(true); // ↕ is symmetric: sol↓do
    expect(isAllowedMove(n(G3), n(C4), QUARTER, both)).toBe(true); // sol↑do, a 4th up
    expect(isAllowedMove(n(C4), n(E4), QUARTER, both)).toBe(false); // other pairs stay unlisted
    const doSolDown: SkipPolicy = { kind: "custom", moves: [{ from: 1, to: 5, dir: "down" }] };
    expect(isAllowedMove(n(C4), n(G3), QUARTER, doSolDown)).toBe(true);
    expect(isAllowedMove(n(C4), n(G4), QUARTER, doSolDown)).toBe(false);
  });
});

describe("largestSkip", () => {
  test("is maxSkip, or the widest listed interval, or 1 for stepwise only", () => {
    expect(largestSkip({ kind: "max", maxSkip: 4 })).toBe(4);
    expect(largestSkip({ kind: "custom", moves: [] })).toBe(1);
    expect(largestSkip(LEVEL_II)).toBe(2);
    expect(largestSkip({ kind: "custom", moves: [{ from: 1, to: 5, dir: "up" }] })).toBe(4);
    expect(largestSkip({ kind: "custom", moves: [{ from: 1, to: 5, dir: "down" }] })).toBe(3);
    expect(largestSkip({ kind: "custom", moves: [{ from: 1, to: 5, dir: "both" }] })).toBe(4);
  });
});

describe("toSkipPolicy", () => {
  test("wraps a number as Max skip, at least a step", () => {
    expect(toSkipPolicy(3)).toEqual({ kind: "max", maxSkip: 3 });
    expect(toSkipPolicy(0)).toEqual({ kind: "max", maxSkip: 1 });
    expect(toSkipPolicy({ kind: "max", maxSkip: 2 })).toEqual({ kind: "max", maxSkip: 2 });
  });

  test("keeps only well-formed rows and lengths", () => {
    expect(
      toSkipPolicy({
        kind: "custom",
        moves: [{ from: 1, to: 3, dir: "up" }, { from: 1, to: 1, dir: "up" }, { from: 9, to: 3, dir: "up" }, "x"],
        landOn: [8, "q", -1],
      })
    ).toEqual({ kind: "custom", moves: [{ from: 1, to: 3, dir: "up" }], landOn: [8] });
    expect(toSkipPolicy({ kind: "custom", moves: [], landOn: [] })).toEqual({ kind: "custom", moves: [] });
  });

  test("falls back to the page's default Max skip", () => {
    expect(toSkipPolicy(undefined)).toEqual({ kind: "max", maxSkip: 4 });
    expect(toSkipPolicy("nonsense")).toEqual({ kind: "max", maxSkip: 4 });
  });
});

/**
 * livePitches: with exact skips, the pitches a line may start on or move to -
 * each has a way on to another pitch, and a way home. A note in F major here:
 * degree is 0-based from F (C4 = 14 is sol).
 */
describe("livePitches", () => {
  const inF = (pitchValue: number, chromatic = false) => ({
    pitchValue, degree: (((pitchValue - 17) % 7) + 7) % 7, chromatic,
  });
  const isHomeDegree = (x: { degree: number }) => [0, 2, 4].includes(x.degree);
  const pitches = (notes: { pitchValue: number }[]) => notes.map((x) => x.pitchValue);
  // Do-Mi-Sol ↑ + Sol-Do ↓ + re ↗ sol.
  const TASK_6R: SkipPolicy = {
    kind: "custom",
    moves: [
      { from: 1, to: 3, dir: "up" }, { from: 3, to: 5, dir: "up" },
      { from: 5, to: 1, dir: "down" }, { from: 2, to: 5, dir: "up" },
    ],
    landOn: [QUARTER],
  };

  test("low sol, with only sol↓do below the range and no selected neighbour, is pruned", () => {
    // C4-C5 in F with do re mi sol: C4 sol, F4 do, G4 re, A4 mi, C5 sol.
    const notes = [14, 17, 18, 19, 21].map((p) => inF(p));
    expect(pitches(livePitches(notes, TASK_6R, isHomeDegree))).toEqual([17, 18, 19, 21]);
  });

  test("a set where every pitch has a way on and a way home is unchanged", () => {
    const notes = [17, 18, 19, 20, 21, 22].map((p) => inF(p)); // F4-D5, by step
    expect(livePitches(notes, TASK_6R, isHomeDegree)).toEqual(notes);
  });

  test("pruning is repeated: a pitch whose only way on was pruned goes too", () => {
    // Sol-Ti ↑ only, with do re sol ti: ti (E5) has no way on, so then sol
    // (C5), whose only way on was up to ti, has none either. Do and re stay.
    const policy: SkipPolicy = { kind: "custom", moves: [{ from: 5, to: 7, dir: "up" }] };
    const notes = [17, 18, 21, 23].map((p) => inF(p));
    expect(pitches(livePitches(notes, policy, isHomeDegree))).toEqual([17, 18]);
  });

  test("the landing limit does not prune: a skip may land on some note value", () => {
    const policy: SkipPolicy = { kind: "custom", moves: [{ from: 5, to: 1, dir: "down" }], landOn: [HALF] };
    const notes = [17, 18, 21].map((p) => inF(p)); // do re, and sol a 4th above do
    expect(pitches(livePitches(notes, policy, isHomeDegree))).toEqual([17, 18, 21]);
  });

  test("a chromatic note is left by step only", () => {
    // fi would be left by sol↓do-style skips if it were natural; altered, it needs a neighbour.
    const policy: SkipPolicy = { kind: "custom", moves: [{ from: 7, to: 3, dir: "down" }] };
    const notes = [inF(17), inF(18), inF(19), inF(23, true)];
    expect(pitches(livePitches(notes, policy, isHomeDegree))).toEqual([17, 18, 19]);
    expect(pitches(livePitches([...notes.slice(0, 3), inF(23)], policy, isHomeDegree))).toEqual([17, 18, 19, 23]);
  });

  test("pitches that cannot get home are pruned, and nothing is left when home is cut off", () => {
    // Steps only: la-ti (D5-E5) is an island with no home in it.
    const island = [17, 18, 22, 23].map((p) => inF(p));
    expect(pitches(livePitches(island, { kind: "custom", moves: [] }, isHomeDegree))).toEqual([17, 18]);
    // Do alone, nothing to step to: no way on, so nothing is left.
    expect(livePitches([inF(17)], { kind: "custom", moves: [] }, isHomeDegree)).toEqual([]);
  });

  test("Max skip never prunes", () => {
    const notes = [14, 17, 18, 19, 21].map((p) => inF(p));
    expect(livePitches(notes, { kind: "max", maxSkip: 1 }, isHomeDegree)).toEqual(notes);
    expect(livePitches([inF(17)], { kind: "max", maxSkip: 4 }, isHomeDegree)).toEqual([inF(17)]);
  });
});

/**
 * landablePolicy: exact skips limited to note values that no selected rhythm
 * sings can never be sung, so the line is treated as stepwise.
 */
describe("landablePolicy", () => {
  const triad: SkipPolicy = {
    kind: "custom",
    moves: [{ from: 1, to: 3, dir: "both" }, { from: 3, to: 5, dir: "both" }, { from: 1, to: 5, dir: "both" }],
  };
  const quarter = { abcValue: ["8"] };
  const eighthPair = { abcValue: ["4", "4"] };
  const eighthRestEighth = { abcValue: ["z4", "4"] };
  const halfRest = { abcValue: ["z16"] };

  test("sungLengths leaves rests out", () => {
    expect(sungLengths([eighthRestEighth, halfRest, quarter]).sort((a, b) => a - b)).toEqual([4, 8]);
  });
  test("halves only, quarters selected: stepwise, and 1, 3, 5 no longer connect", () => {
    const p = landablePolicy({ ...triad, landOn: [HALF] }, [quarter]);
    expect(p).toEqual({ kind: "custom", moves: [] });
    expect(degreesConnected([1, 3, 5], p)).toBe(false);
  });
  test("quarters only, eighth pairs selected: stepwise", () => {
    expect(landablePolicy({ ...triad, landOn: [QUARTER] }, [eighthPair])).toEqual({ kind: "custom", moves: [] });
  });
  test("a rest of the landing length is no landing", () => {
    expect(landablePolicy({ ...triad, landOn: [HALF] }, [quarter, halfRest])).toEqual({ kind: "custom", moves: [] });
  });
  test("one selected rhythm that sings a landing value keeps the policy as it is", () => {
    const p = { ...triad, landOn: [QUARTER] };
    expect(landablePolicy(p, [eighthPair, quarter])).toBe(p);
  });
  test("no landing limit, Max skip, or no listed skips: unchanged", () => {
    expect(landablePolicy(triad, [eighthPair])).toBe(triad);
    expect(landablePolicy(STEP_ONLY, [eighthPair])).toBe(STEP_ONLY);
    const none: SkipPolicy = { kind: "custom", moves: [], landOn: [HALF] };
    expect(landablePolicy(none, [quarter])).toBe(none);
  });
});
