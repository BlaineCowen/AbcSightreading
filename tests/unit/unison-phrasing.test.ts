import { describe, expect, test } from "bun:test";
import { rhythms as catalogue } from "../../src/resources/rhythms";
import type { RhythmWithPattern } from "../../src/lib/types";
import type { SkipPolicy } from "../../src/lib/skip-policy";
import {
  breathEnds,
  canSkipFrom,
  capEighthRuns,
  FIRST_SKIP_PREFERENCE,
  MAX_EIGHTH_RUN,
  MOMENTUM,
  restsToBreaths,
  SEESAW_PENALTY,
  SEESAW_REPEAT_PENALTY,
  shapeFactor,
  SKIP_PREFERENCE,
  SKIP_SATED,
  skipCount,
  skipReachable,
  skipsWantedFor,
  sungFigureFor,
} from "../../src/lib/unison-phrasing";
import { createNewSr } from "../../src/lib/generateUnison";
import { nyssmaGenerationParams, nyssmaVoiceLevels } from "../../src/lib/nyssma-presets";

/**
 * Exact-skips line shaping (unison-phrasing.ts): rests only at breaths, the
 * listed skips reached for, no see-sawing. The pure helpers first, then rates
 * over generated NYSSMA exercises.
 */
const fig = (name: string) => catalogue.find((r) => r.name === name)!;
/** A rhythm as the generator lays it out, from catalogue names (patterns expanded). */
function lay(...names: string[]): RhythmWithPattern[] {
  return names.flatMap((name) => {
    const r = fig(name);
    if (!r.pattern) return [{ ...r, isPatternNote: false, isPatternStart: false, isPatternEnd: false, patternIndex: null }];
    return r.abcValue.map((abc, i) => ({
      ...r,
      abcValue: [abc],
      totalValue: parseInt(abc.replace(/^z/, ""), 10),
      isPatternNote: true,
      isPatternStart: i === 0,
      isPatternEnd: i === r.abcValue.length - 1,
      patternIndex: i,
      rest: abc.startsWith("z"),
    }));
  });
}
const starts = (rs: readonly { totalValue: number }[]) => {
  let at = 0;
  return rs.map((r) => ((at += r.totalValue), at - r.totalValue));
};
const BAR = 32;
const Q = "quarter", H = "half", QR = "quarterRest";
/** 8 bars of 4/4 from bar figures. */
const bars = (...bs: string[][]) => lay(...bs.flat());
const plainBar = [Q, Q, Q, Q];

describe("breathEnds", () => {
  test("the end of every even bar but the last", () => {
    expect(breathEnds(32, 8)).toEqual([64, 128, 192]);
    expect(breathEnds(16, 4)).toEqual([32]);
    expect(breathEnds(24, 16)).toEqual([2, 4, 6, 8, 10, 12, 14].map((b) => b * 24));
    expect(breathEnds(32, 2)).toEqual([]);
  });
});

describe("sungFigureFor", () => {
  test("the note of the same name when selected, else a figure of the same length that sings throughout", () => {
    expect(sungFigureFor(fig(QR), [fig(Q), fig(H), fig(QR)])!.name).toBe(Q);
    expect(sungFigureFor(fig(QR), [fig("eighthEighth"), fig(H)])!.name).toBe("eighthEighth");
    expect(sungFigureFor(fig(QR), [fig(H), fig(QR)])).toBeNull();
  });
});

describe("restsToBreaths", () => {
  const selected = [fig(Q), fig(H), fig(QR)];
  const opts = (random: number) => ({ tsPerMeasure: BAR, measures: 8, selected, random: () => random });

  test("a rest inside a phrase becomes the note of its length; one ending at a breath stays", () => {
    const rhythm = bars([Q, QR, Q, Q], [Q, Q, Q, QR], plainBar, [Q, Q, H], [QR, Q, Q, Q], plainBar, plainBar, [H, H]);
    const out = restsToBreaths(rhythm, opts(0.99));
    const rests = out.flatMap((r, k) => (r.rest ? [starts(out)[k] + r.totalValue] : []));
    expect(rests).toEqual([2 * BAR]); // bar 1's and bar 5's went; bar 2's, at a breath, stayed
    expect(out[1].name).toBe(Q);
    expect(out[1].rest).toBe(false);
    // Same lengths in the same places: nothing slides off the beat.
    expect(out.map((r) => r.totalValue)).toEqual(rhythm.map((r) => r.totalValue));
  });

  test("with no rest at a breath, one goes in at the end of bar 4 - with BREATH_REST_CHANCE", () => {
    const rhythm = bars(plainBar, plainBar, plainBar, plainBar, plainBar, plainBar, plainBar, [H, H]);
    const placed = restsToBreaths(rhythm, opts(0));
    const k = placed.findIndex((r) => r.rest);
    expect(k).toBeGreaterThan(-1);
    expect(starts(placed)[k] + placed[k].totalValue).toBe(4 * BAR);
    expect(placed.filter((r) => r.rest)).toHaveLength(1);
    expect(restsToBreaths(rhythm, opts(0.99)).some((r) => r.rest)).toBe(false);
  });

  test("never the cadence note, never a figure's note; falls back to another breath", () => {
    const cadence = { ...lay(H)[0], isCadenceEnd: true };
    const rhythm = [
      ...bars(plainBar, plainBar, plainBar, [Q, Q]),
      cadence,
      ...bars(plainBar, plainBar, [Q, Q, "eighthEighth", "eighthEighth"], [H, H]),
    ];
    const out = restsToBreaths(rhythm, opts(0));
    const ends = out.flatMap((r, k) => (r.rest ? [starts(out)[k] + r.totalValue] : []));
    expect(ends).toHaveLength(1);
    // Not bar 4 (the cadence note); bars 2 and 6 are as near the middle, and 2 comes first.
    expect(ends[0]).toBe(2 * BAR);
  });

  test("no rest selected: no rest is placed", () => {
    const rhythm = bars(plainBar, plainBar, plainBar, plainBar, plainBar, plainBar, plainBar, [H, H]);
    const out = restsToBreaths(rhythm, { tsPerMeasure: BAR, measures: 8, selected: [fig(Q), fig(H)], random: () => 0 });
    expect(out.some((r) => r.rest)).toBe(false);
  });

  test("a rest with no sung figure of its length selected is left where it is", () => {
    const rhythm = bars([H, QR, Q], plainBar, plainBar, plainBar);
    const out = restsToBreaths(rhythm, { tsPerMeasure: BAR, measures: 4, selected: [fig(H), fig(QR)], random: () => 0.99 });
    expect(out[1].rest).toBe(true);
  });
});

describe("skips and line shape", () => {
  const DO_MI_SOL_UP: SkipPolicy = {
    kind: "custom",
    moves: [{ from: 1, to: 3, dir: "up" }, { from: 3, to: 5, dir: "up" }],
    landOn: [8],
  };
  // C major, do = 14 (C4): degree = pitch - 14.
  const n = (pitch: number) => ({ pitchValue: pitch, degree: ((pitch - 14) % 7 + 7) % 7 });
  const scale = [14, 15, 16, 17, 18, 19].map(n); // do to la

  test("skipCount counts the moves wider than a step", () => {
    expect(skipCount([14, 15, 16, 18, 17, 14])).toBe(2);
    expect(skipCount([14, 14, 15])).toBe(0);
  });

  test("canSkipFrom: only a listed skip, onto an allowed length, inside the figure's cap", () => {
    expect(canSkipFrom(n(14), scale, 8, Infinity, DO_MI_SOL_UP)).toBe(true); // do up to mi
    expect(canSkipFrom(n(14), scale, 4, Infinity, DO_MI_SOL_UP)).toBe(false); // onto an eighth
    expect(canSkipFrom(n(14), scale, 8, 1, DO_MI_SOL_UP)).toBe(false); // inside a figure that steps
    expect(canSkipFrom(n(15), scale, 8, Infinity, DO_MI_SOL_UP)).toBe(false); // re starts none
  });

  test("skipReachable: the rhythm needs a note a skip may land on", () => {
    const capAt = () => Infinity;
    expect(skipReachable(scale, lay(Q, Q, H), capAt, DO_MI_SOL_UP)).toBe(true);
    expect(skipReachable(scale, lay(H, H, H), capAt, DO_MI_SOL_UP)).toBe(false);
    expect(skipReachable(scale, lay(Q, Q, H), capAt, { kind: "custom", moves: [] })).toBe(false);
    expect(skipReachable(scale, lay(Q, Q, H), capAt, { kind: "max", maxSkip: 4 })).toBe(false);
  });

  test("shapeFactor: a skip is wanted hard until the first, less after, and not past the target", () => {
    expect(shapeFactor([14, 15], 17)).toBe(FIRST_SKIP_PREFERENCE);
    expect(shapeFactor([14, 16, 15], 17)).toBe(SKIP_PREFERENCE);
    expect(shapeFactor([14, 16, 18, 16, 18], 20, false, 2)).toBe(SKIP_SATED);
    expect(skipsWantedFor(8)).toBe(3);
    expect(skipsWantedFor(16)).toBe(6);
    expect(skipsWantedFor(2)).toBe(1);
  });

  test("shapeFactor: A-B-A is avoided, A-B-A-B far more; a step run is carried on", () => {
    expect(shapeFactor([16, 15], 16)).toBe(SEESAW_PENALTY);
    expect(shapeFactor([15, 16, 15], 16)).toBe(SEESAW_REPEAT_PENALTY);
    expect(shapeFactor([16, 15], 14)).toBe(MOMENTUM);
    expect(shapeFactor([16, 15], 15)).toBe(1); // a repeat: the generator's own rule
  });
});

describe("capEighthRuns", () => {
  const E = "eighthEighth", DQE = "dotQuarterEighth";
  const longestRun = (rs: readonly RhythmWithPattern[]) => {
    let run = 0, best = 0;
    for (const r of rs) best = Math.max(best, (run = !r.rest && r.totalValue <= 4 ? run + 1 : 0));
    return best;
  };
  const selected = [fig(Q), fig(H), fig(E), fig(DQE)];

  test("no more than four eighths in a row: the third ti-ti in a row becomes a ta", () => {
    const out = capEighthRuns(lay(E, E, E, Q, E, E, E, E), { selected });
    expect(MAX_EIGHTH_RUN).toBe(4);
    expect(longestRun(out)).toBe(4);
    expect(out.map((r) => r.name)).toEqual([E, E, E, E, Q, Q, E, E, E, E, Q, E, E]);
  });

  test("every note keeps its place: the total and each beat start are unchanged", () => {
    const before = lay(E, E, E, E, Q, E, E, E);
    const out = capEighthRuns(before, { selected });
    expect(out.reduce((a, r) => a + r.totalValue, 0)).toBe(before.reduce((a, r) => a + r.totalValue, 0));
    const beatStarts = (rs: readonly RhythmWithPattern[]) => starts(rs).filter((t) => t % 8 === 0);
    expect(beatStarts(out)).toEqual(beatStarts(before));
  });

  test("ta-(i) ti then two ti-tis is five in a row: the last ti-ti becomes a ta", () => {
    const out = capEighthRuns(lay(DQE, E, E, Q), { selected });
    expect(longestRun(out)).toBeLessThanOrEqual(4);
    expect(out.map((r) => r.name)).toEqual([DQE, DQE, E, E, Q, Q]);
  });

  test("a figure is left alone when nothing eighth-free of its length is selected", () => {
    const out = capEighthRuns(lay(E, E, E), { selected: [fig(E)] });
    expect(out.map((r) => r.name)).toEqual([E, E, E, E, E, E]);
  });

  test("never the figure that closes a cadence", () => {
    const rs = lay(E, E, E);
    rs[5] = { ...rs[5], isCadenceEnd: true };
    const out = capEighthRuns(rs, { selected });
    expect(out.filter((r) => r.isCadenceEnd).length).toBe(1);
  });
});

describe("generated NYSSMA lines (exact skips)", () => {
  const quiet = () => {};
  function generate(levelShort: string, key: string, meter: string): any[] {
    const level = nyssmaVoiceLevels.find((l) => l.short === levelShort)!;
    const saved = { log: console.log, warn: console.warn, error: console.error };
    Object.assign(console, { log: quiet, warn: quiet, error: quiet });
    try {
      const r: any = createNewSr(nyssmaGenerationParams(level, { key, meter, clef: "treble", anchor: 14 }) as any);
      return r[2].partsObject.parts.Unison.chordNoteObject;
    } finally {
      Object.assign(console, saved);
    }
  }

  test("Levels II-V: every exercise sings a listed skip, and every rest ends at a breath", () => {
    for (const lv of ["Level II", "Level III", "Level IV", "Level V"]) {
      for (const meter of ["4/4", "2/4"]) {
        for (let run = 0; run < 15; run++) {
          const notes = generate(lv, "C", meter);
          const sung = notes.filter((x) => !x.rhythm?.rest).map((x) => x.pitchValue);
          expect({ lv, meter, skips: skipCount(sung) > 0 }).toEqual({ lv, meter, skips: true });
          const bar = meter === "2/4" ? 16 : 32;
          const ends = new Set(breathEnds(bar, 8));
          let at = 0;
          for (const x of notes) {
            if (x.rhythm?.rest) expect(ends.has(at + x.noteLength)).toBe(true);
            at += x.noteLength;
          }
        }
      }
    }
  }, 30000);

  test("Levels III-V: never more than four eighths in a row (it was over four in 36-48% of exercises)", () => {
    for (const lv of ["Level III", "Level IV", "Level V"]) {
      for (const meter of ["4/4", "3/4", "2/4"]) {
        for (let run = 0; run < 12; run++) {
          let row = 0, best = 0;
          for (const x of generate(lv, "C", meter)) best = Math.max(best, (row = !x.rhythm?.rest && x.noteLength <= 4 ? row + 1 : 0));
          expect({ lv, meter, best: Math.min(best, 5) }).toEqual({ lv, meter, best: Math.min(best, 4) });
        }
      }
    }
  }, 30000);

  test("Level IV: A-B-A-B under 10% of moves (it was 25%)", () => {
    let abab = 0, moves = 0;
    for (const meter of ["4/4", "3/4"]) for (let run = 0; run < 20; run++) {
      const p = generate("Level IV", "C", meter).filter((x) => !x.rhythm?.rest).map((x) => x.pitchValue);
      for (let k = 1; k < p.length; k++) {
        moves++;
        if (k >= 3 && p[k] === p[k - 2] && p[k - 1] === p[k - 3] && p[k] !== p[k - 1]) abab++;
      }
    }
    expect(abab / moves).toBeLessThan(0.1);
  }, 30000);
});
