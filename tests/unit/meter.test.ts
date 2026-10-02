import { describe, expect, test } from "bun:test";
import {
  COMPOUND_METER_NAMES,
  EXERCISE_METERS,
  SIMPLE_METER_NAMES,
  beatSymbolOf,
  beatUnitOf,
  beatsOf,
  isCompound,
  meterByName,
  meterKindOf,
  resolveMeter,
  tempoField,
  timeSignatureFor,
  timeSignaturesFor,
} from "../../src/lib/meter";
import { METERS } from "../../src/lib/tuner/meters";

describe("the meter model", () => {
  test("the six exercise meters, as the spec tables them", () => {
    expect(
      EXERCISE_METERS.map((m) => [m.name, m.beatUnits, m.beatsPerMeasure, m.subdivision, m.tsPerMeasure, m.kind])
    ).toEqual([
      ["2/4", 8, 2, 2, 16, "simple"],
      ["3/4", 8, 3, 2, 24, "simple"],
      ["4/4", 8, 4, 2, 32, "simple"],
      ["6/8", 12, 2, 3, 24, "compound"],
      ["9/8", 12, 3, 3, 36, "compound"],
      ["12/8", 12, 4, 3, 48, "compound"],
    ]);
    expect(SIMPLE_METER_NAMES).toEqual(["2/4", "3/4", "4/4"]);
    expect(COMPOUND_METER_NAMES).toEqual(["6/8", "9/8", "12/8"]);
  });

  test("one model: the metronome's table agrees beat for beat", () => {
    for (const m of EXERCISE_METERS) {
      const tuner = METERS.find((t) => t.id === m.name)!;
      expect([m.name, tuner.beats, tuner.kind]).toEqual([m.name, m.beatsPerMeasure, m.kind]);
    }
  });

  test("3/4 and 6/8 are the same length and different meters", () => {
    expect(meterByName("3/4")!.tsPerMeasure).toBe(meterByName("6/8")!.tsPerMeasure);
    expect(beatsOf("3/4")).toBe(3);
    expect(beatsOf("6/8")).toBe(2);
    expect(isCompound("3/4")).toBe(false);
    expect(isCompound("6/8")).toBe(true);
  });

  test("12/8 is four beats - not twelve, and not the one its first digit says", () => {
    expect(beatsOf("12/8")).toBe(4);
    expect(beatUnitOf("12/8")).toBe(12);
  });

  test("a time signature object is read by its name first", () => {
    expect(beatUnitOf({ name: "6/8", tsPerMeasure: 24, beatUnits: 8 })).toBe(12);
    expect(meterKindOf({ name: "4/4", tsPerMeasure: 32 })).toBe("simple");
  });

  test("an unknown name falls back to the object's own fields, the old beam field included", () => {
    expect(resolveMeter({ name: "x", tsPerMeasure: 24, beamGroupSize: 12 })).toMatchObject({
      beatUnits: 12, beatsPerMeasure: 2, subdivision: 3, kind: "compound",
    });
    expect(resolveMeter({ name: "x", tsPerMeasure: 32 })).toMatchObject({
      beatUnits: 8, beatsPerMeasure: 4, subdivision: 2, kind: "simple",
    });
  });

  test("the metronome's other meters and junk still have beats", () => {
    expect(beatsOf("5/4")).toBe(5);
    expect(beatsOf("7/8")).toBe(7);
    expect(beatsOf("not a meter")).toBe(4);
  });

  test("time signatures for the generators", () => {
    expect(timeSignatureFor("9/8")).toEqual({ name: "9/8", tsPerMeasure: 36, beatUnits: 12 });
    expect(timeSignatureFor("4/4")).toEqual({ name: "4/4", tsPerMeasure: 32, beatUnits: 8 });
    expect(() => timeSignatureFor("5/4")).toThrow();
    expect(Object.keys(timeSignaturesFor(["4/4", "3/4", "2/4"]))).toEqual(["4/4", "3/4", "2/4"]);
  });

  test("the tempo mark and symbol count the beat", () => {
    expect(tempoField("6/8", 60)).toBe("Q:3/8=60");
    expect(tempoField("12/8", 80)).toBe("Q:3/8=80");
    expect(tempoField("4/4", 72)).toBe("Q:1/4=72");
    expect(beatSymbolOf("9/8")).toBe("♩.");
    expect(beatSymbolOf("3/4")).toBe("♩");
  });
});
