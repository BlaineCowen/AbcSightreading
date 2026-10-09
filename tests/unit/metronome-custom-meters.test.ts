import { describe, expect, test } from "bun:test";
import { METERS, customMeter, groupLevels, groupingsOf, meterById, subdivisionLabel } from "../../src/lib/tuner/meters";
import { QUICK_PRESETS, presetFrom, presetsFrom } from "../../src/lib/tuner/metronome-presets";
import { spokenBeat } from "../../src/lib/tuner/voice-count";
import { resolveMeter } from "../../src/lib/meter";

/** Custom time signatures, their groupings, and the metronome's presets. */

describe("custom meters", () => {
  test("every table meter reads back as itself", () => {
    for (const m of METERS) expect(customMeter(m.id)).toBe(m);
    expect(customMeter("7/8:2+2+3")).toBe(meterById("7/8"));
    expect(customMeter("12/8:3+3+3+3")).toBe(meterById("12/8"));
  });

  test("an odd top over 8 or 16 is uneven, in twos with the three last", () => {
    const m = customMeter("11/8")!;
    expect(m).toMatchObject({ id: "11/8", kind: "uneven", beats: 11, beatNote: "eighth", grouping: "2+2+2+2+3" });
    expect(m.groupStarts).toEqual([2, 4, 6, 8]);
    expect(customMeter("13/16")).toMatchObject({ kind: "uneven", beatNote: "sixteenth", beats: 13 });
  });

  test("a grouping of its own is kept in the id, and heard", () => {
    const m = customMeter("7/8:3+2+2")!;
    expect(m).toMatchObject({ id: "7/8:3+2+2", grouping: "3+2+2", groupStarts: [3, 5] });
    expect(groupLevels(m)).toEqual(["accent", "soft", "soft", "normal", "soft", "normal", "soft"]);
    // 5/4 is the table's 3+2, so 2+3 must say so.
    expect(customMeter("5/4:2+3")!.id).toBe("5/4:2+3");
    expect(meterById(customMeter("5/4:2+3")!.id).groupStarts).toEqual([2]);
    expect(customMeter("8/8:3+3+2")).toMatchObject({ kind: "uneven", groupStarts: [3, 6] });
  });

  test("multiples of three are compound, in dotted beats", () => {
    expect(customMeter("6/4")).toMatchObject({ kind: "compound", beats: 2, beatNote: "dottedHalf", defaultSubdivision: 3 });
    expect(customMeter("9/16")).toMatchObject({ kind: "compound", beats: 3, beatNote: "dottedEighth" });
    expect(customMeter("15/8")).toMatchObject({ kind: "compound", beats: 5 });
    // Unless grouped otherwise: 9/8 as 2+2+2+3 is counted in eighths.
    expect(customMeter("9/8:2+2+2+3")).toMatchObject({ kind: "uneven", beats: 9 });
  });

  test("everything else is simple, in the bottom note", () => {
    expect(customMeter("3/2")).toMatchObject({ kind: "simple", beats: 3, beatNote: "half" });
    expect(customMeter("3/8")).toMatchObject({ kind: "simple", beats: 3, beatNote: "eighth" });
    expect(customMeter("7/4")).toMatchObject({ kind: "simple", beats: 7, groupStarts: [4] });
    expect(groupLevels(customMeter("7/4")!)).toBeNull();
  });

  test("nonsense is refused, and meterById falls back to 4/4", () => {
    for (const bad of ["", "x", "0/4", "33/8", "4/3", "7/8:3+3", "7/8:0+7", "7/8:3+2+2+"]) expect(customMeter(bad)).toBeUndefined();
    expect(meterById("7/8:3+3").id).toBe("4/4");
  });

  test("every custom meter offers its default subdivision and names each one", () => {
    for (let top = 1; top <= 32; top++)
      for (const bottom of [1, 2, 4, 8, 16]) {
        const m = customMeter(`${top}/${bottom}`)!;
        expect(m.subdivisions).toContain(m.defaultSubdivision);
        expect(m.beats * (m.kind === "compound" ? 3 : 1)).toBe(top);
        for (const n of m.subdivisions) expect(subdivisionLabel(m, n)).not.toMatch(/per beat/);
      }
  });

  test("groupings of twos and threes, the default first", () => {
    expect(groupingsOf(7).map((g) => g.join("+"))).toEqual(["2+2+3", "2+3+2", "3+2+2"]);
    for (const g of groupingsOf(13)) expect(g.reduce((a, b) => a + b, 0)).toBe(13);
  });

  test("an exercise meter is untouched by any of it", () => {
    expect(resolveMeter("6/8")).toMatchObject({ beatUnits: 12, beatsPerMeasure: 2, kind: "compound" });
    expect(resolveMeter("4/4")).toMatchObject({ beatUnits: 8, beatsPerMeasure: 4 });
  });
});

describe("choosing a custom meter", () => {
  test("an uneven meter starts on its groups, and they do not follow into the next meter", async () => {
    const { tuner } = await import("../../src/lib/tuner/store");
    tuner.setMeter("7/8:3+2+2");
    expect(tuner.get()).toMatchObject({ meter: "7/8:3+2+2", beatsPerBar: 7 });
    expect(tuner.get().beatLevels).toEqual(groupLevels(meterById("7/8:3+2+2")));
    tuner.setMeter("7/8");
    expect(tuner.get().beatLevels).toEqual(groupLevels(meterById("7/8")));
    tuner.setMeter("7/4");
    expect(tuner.get().beatLevels).toBeNull();
    tuner.setMeter("4/4");
  });
});

describe("presets", () => {
  test("the built-in ones read back as themselves and keep the tempo", () => {
    for (const p of QUICK_PRESETS) {
      expect(presetFrom(p)).toMatchObject({ ...p, bpm: undefined });
    }
  });

  test("a saved preset is applied whole, and a broken one is dropped", async () => {
    const { tuner } = await import("../../src/lib/tuner/store");
    tuner.setMeter("4/4");
    tuner.setBpm(100);
    tuner.setMeter("11/8:3+3+3+2");
    tuner.setSubdivision(2);
    tuner.setBpm(144);
    tuner.saveMetronomePreset("Odd one");
    const saved = tuner.get().metronomePresets.find((p) => p.name === "Odd one")!;
    expect(saved).toMatchObject({ meter: "11/8:3+3+3+2", bpm: 144, subdivision: 2 });

    tuner.applyMetronomePreset(QUICK_PRESETS.find((p) => p.id === "q-swing")!);
    expect(tuner.get()).toMatchObject({ meter: "4/4", bpm: 144, subdivision: 3, subMask: "101", beatLevels: null });
    tuner.applyMetronomePreset(QUICK_PRESETS.find((p) => p.id === "q-backbeat")!);
    expect(tuner.get().beatLevels).toEqual(["soft", "accent", "soft", "accent"]);
    // Swing after backbeat is swing on plain beats, not swing with a backbeat.
    tuner.applyMetronomePreset(QUICK_PRESETS.find((p) => p.id === "q-swing")!);
    expect(tuner.get().beatLevels).toBeNull();

    tuner.setBpm(80);
    tuner.applyMetronomePreset(saved);
    expect(tuner.get()).toMatchObject({ meter: "11/8:3+3+3+2", bpm: 144, subdivision: 2, beatsPerBar: 11 });
    tuner.deleteMetronomePreset(saved.id);
    expect(tuner.get().metronomePresets.some((p) => p.id === saved.id)).toBe(false);

    expect(presetsFrom([{ id: "a", name: "bad", meter: "7/8:3+3" }, { id: "b", name: "ok", meter: "6/4", subdivision: 3 }, 5])).toHaveLength(1);
    tuner.setMeter("4/4");
  });
});

describe("the counting voice in a long bar", () => {
  test("up to twelve says every number; past it, each group from 1", () => {
    expect(Array.from({ length: 7 }, (_, b) => spokenBeat(b, 7, [2, 4]) + 1)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    const m = customMeter("13/8:2+2+3+3+3")!;
    expect(Array.from({ length: 13 }, (_, b) => spokenBeat(b, 13, m.groupStarts) + 1)).toEqual([1, 2, 1, 2, 1, 2, 3, 1, 2, 3, 1, 2, 3]);
    expect(spokenBeat(13, 16, []) + 1).toBe(2);
  });
});
