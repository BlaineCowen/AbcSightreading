import { describe, expect, test } from "bun:test";
import {
  nyssmaById, nyssmaGenerationParams, nyssmaPolicy, nyssmaRange, nyssmaVoiceLevels,
} from "../../src/lib/nyssma-presets";
import { isAllowedMove } from "../../src/lib/skip-policy";
import { SKIP_CHIPS, ALL_LAND_ON, chipMoves, type SkipChipId } from "../../src/lib/skip-settings";
import { selectableRhythms } from "../../src/lib/selectable-rhythms";
import { keySignatures } from "../../src/resources/key-signatures";
import { createNewSr } from "../../src/lib/generateUnison";
import { timeSignatureFor } from "../../src/lib/meter";

const UNISON_KEYS = ["Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E"];
const L = (n: number) => nyssmaById[`nyssma-voice-${n}`];

describe("NYSSMA Voice levels match the chart (spec table)", () => {
  test("five levels, stable ids", () => {
    expect(nyssmaVoiceLevels.map((l) => l.id)).toEqual([
      "nyssma-voice-1", "nyssma-voice-2", "nyssma-voice-3", "nyssma-voice-4", "nyssma-voice-5",
    ]);
    expect(nyssmaVoiceLevels.map((l) => l.short)).toEqual(["Level I", "Level II", "Level III", "Level IV", "Level V"]);
  });

  test("keys and meters", () => {
    expect(nyssmaVoiceLevels.map((l) => l.keys)).toEqual([
      ["C", "F"], ["C", "F", "G"], ["C", "F", "G"], ["C", "F", "G", "D", "Eb"], ["C", "F", "G", "D", "Eb"],
    ]);
    expect(nyssmaVoiceLevels.map((l) => l.meters)).toEqual([
      ["4/4"], ["4/4", "2/4"], ["4/4", "2/4", "3/4"], ["4/4", "2/4", "3/4"], ["4/4", "2/4", "3/4"],
    ]);
  });

  test("every level uses only simple meters", () => {
    for (const l of nyssmaVoiceLevels) {
      for (const m of l.meters) {
        expect(["4/4", "2/4", "3/4"]).toContain(m);
        expect(timeSignatureFor(m).tsPerMeasure).toBe({ "4/4": 32, "2/4": 16, "3/4": 24 }[m]!);
      }
    }
  });

  test("range: do-sol, do-la, do-la, do-do', low sol-la", () => {
    expect(nyssmaVoiceLevels.map((l) => l.span)).toEqual([[0, 4], [0, 5], [0, 5], [0, 7], [-3, 5]]);
  });

  test("skip patterns and what they land on", () => {
    expect(nyssmaVoiceLevels.map((l) => l.skips.exactOn)).toEqual([true, true, true, true, true]);
    expect(nyssmaVoiceLevels.map((l) => l.skips.patterns)).toEqual([
      [],
      ["do-mi-sol-up"],
      ["do-mi-sol-up"],
      ["do-mi-sol-up", "do-sol-up"],
      ["do-mi-sol-up", "do-sol-up", "sol-mi-do-down", "sol-do-down", "sol-ti-re-up", "do-sol-down"],
    ]);
    expect(nyssmaVoiceLevels.map((l) => l.skips.extraSkips)).toEqual([[], [], [], [], []]);
    expect(nyssmaVoiceLevels.map((l) => l.skips.landOn)).toEqual([ALL_LAND_ON, [8], [8], [8], [8, 16]]);
  });

  test("pattern ids exist in SKIP_CHIPS", () => {
    const ids = new Set<string>(SKIP_CHIPS.map((c) => c.id));
    for (const l of nyssmaVoiceLevels) for (const p of l.skips.patterns) expect(ids.has(p)).toBe(true);
  });

  test("rhythms and rests", () => {
    expect(nyssmaVoiceLevels.map((l) => l.rhythms)).toEqual([
      ["quarter", "half"],
      ["quarter", "half", "quarterRest"],
      ["quarter", "half", "quarterRest", "eighthEighth"],
      ["quarter", "half", "quarterRest", "eighthEighth"],
      ["quarter", "half", "quarterRest", "eighthEighth", "dotQuarterEighth"],
    ]);
  });

  test("Max skip per level, from its own skip list", () => {
    expect(nyssmaVoiceLevels.map((l) => l.maxSkip)).toEqual([1, 2, 2, 4, 4]);
  });

  test("maxSkip equals the widest chipMoves interval (drift guard)", () => {
    const mod = (n: number) => ((n % 7) + 7) % 7;
    for (const l of nyssmaVoiceLevels) {
      const widths = l.skips.patterns.flatMap((id) => chipMoves(id)).map((m) =>
        m.dir === "up" ? mod(m.to - m.from) : m.dir === "down" ? mod(m.from - m.to) : Math.max(mod(m.to - m.from), mod(m.from - m.to)));
      expect(l.maxSkip).toBe(Math.max(1, ...widths));
    }
  });

  test("tempo, dynamics, length, short-note skips", () => {
    expect(nyssmaVoiceLevels.every((l) => l.bpm === 72 && l.measures === 8)).toBe(true);
    expect(nyssmaVoiceLevels.map((l) => l.dynamics)).toEqual([
      ["mf"], ["mf"], ["mf"], ["p", "mf", "f"], ["p", "mp", "mf", "f"],
    ]);
    for (const l of nyssmaVoiceLevels) {
      expect(l.shortSkipsLinked).toBe(false);
      expect([l.max8th, l.max16th]).toEqual([1, 1]);
    }
  });
});

describe("a level's skip policy allows exactly the listed skips", () => {
  // Note at do + offset steps (do = C4 = 14), degree 0-based.
  const note = (offset: number) => ({ pitchValue: 14 + offset, degree: ((offset % 7) + 7) % 7 });
  const allowed = (level: number, from: number, to: number, length = 8) =>
    isAllowedMove(note(from), note(to), length, nyssmaPolicy(L(level)));
  const deg = (offset: number) => ((offset % 7) + 7) % 7 + 1;

  test("Level I: steps and repeats only", () => {
    expect(nyssmaPolicy(L(1))).toEqual({ kind: "custom", moves: [] });
    for (let a = 0; a <= 4; a++) for (let b = 0; b <= 4; b++) {
      expect(allowed(1, a, b)).toBe(Math.abs(a - b) <= 1);
    }
  });

  test("Level II: do-mi-sol up on quarters; re-fa and do-sol refused", () => {
    expect(allowed(2, 0, 2)).toBe(true);   // do up mi
    expect(allowed(2, 2, 4)).toBe(true);   // mi up sol
    expect(allowed(2, 7, 9)).toBe(true);   // do' up mi', another octave
    expect(allowed(2, 1, 3)).toBe(false);  // re up fa
    expect(allowed(2, 0, 4)).toBe(false);  // do up sol
    expect(allowed(2, 2, 0)).toBe(false);  // mi down do
    expect(allowed(2, 0, 2, 4)).toBe(false);  // onto an eighth
    expect(allowed(2, 0, 2, 16)).toBe(false); // onto a half
  });

  test("Level V: lands on quarters and halves, not eighths", () => {
    expect(allowed(5, 4, 0, 16)).toBe(true);   // sol down do on a half
    expect(allowed(5, 4, 0, 8)).toBe(true);
    expect(allowed(5, 4, 0, 4)).toBe(false);
    expect(allowed(5, 4, 0, 12)).toBe(false);
  });

  test("every level allows a move exactly when a listed row covers it", () => {
    for (let n = 1; n <= 5; n++) {
      const level = L(n);
      const moves = level.skips.patterns.flatMap((id: SkipChipId) => chipMoves(id));
      for (let from = -3; from <= 6; from++) {
        for (let to = -3; to <= 6; to++) {
          const dist = Math.abs(to - from);
          if (dist <= 1) continue;
          const expected =
            dist < 7 &&
            level.skips.landOn.includes(8) &&
            moves.some((m) => {
              const dir = to > from ? "up" : "down";
              const forward = m.from === deg(from) && m.to === deg(to) && (m.dir === dir || m.dir === "both");
              const back = m.dir === "both" && m.from === deg(to) && m.to === deg(from);
              return forward || back;
            });
          expect(allowed(n, from, to, 8)).toBe(expected);
        }
      }
    }
  });
});

describe("what the levels name exists", () => {
  test("rhythms the Unison page offers, keys it offers", () => {
    const names = new Set(selectableRhythms.map((r) => r.name));
    for (const l of nyssmaVoiceLevels) {
      for (const r of l.rhythms) expect(names.has(r)).toBe(true);
      for (const k of l.keys) {
        expect(UNISON_KEYS).toContain(k);
        expect(keySignatures[k]).toBeDefined();
      }
    }
  });

  test("scale degrees are exactly the ones in the span", () => {
    for (const l of nyssmaVoiceLevels) {
      const inSpan = new Set<number>();
      for (let s = l.span[0]; s <= l.span[1]; s++) inSpan.add((((s % 7) + 7) % 7) + 1);
      expect([...l.scaleDegrees].sort()).toEqual([...inSpan].sort());
    }
  });

  test("ranges are placed on the do at or above the anchor", () => {
    expect(nyssmaRange(L(1), "C", 14)).toEqual({ min: 14, max: 18 });
    expect(nyssmaRange(L(2), "F", 14)).toEqual({ min: 17, max: 22 });
    expect(nyssmaRange(L(4), "G", 14)).toEqual({ min: 18, max: 25 });
  });

  test("Level V's range in F and D", () => {
    expect(nyssmaRange(L(5), "F", 14)).toEqual({ min: 14, max: 22 });
    expect(nyssmaRange(L(5), "D", 14)).toEqual({ min: 12, max: 20 });
  });

  test("Level V's 9th has the sol below do", () => {
    expect(nyssmaRange(L(5), "C", 14)).toEqual({ min: 11, max: 19 }); // G3-A4
  });
});

describe("each level generates", () => {
  test("every key and meter, treble", () => {
    const saved = { log: console.log, warn: console.warn, error: console.error };
    Object.assign(console, { log: () => {}, warn: () => {}, error: () => {} });
    try {
      for (const l of nyssmaVoiceLevels) {
        for (const key of l.keys) for (const meter of l.meters) {
          expect(() => createNewSr(nyssmaGenerationParams(l, { key, meter, clef: "treble", anchor: 14 }) as any)).not.toThrow();
        }
      }
    } finally {
      Object.assign(console, saved);
    }
  });
});
