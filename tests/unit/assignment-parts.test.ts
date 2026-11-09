import { describe, expect, test } from "bun:test";
import { checkParts, noteName, partKeys, partReader, partsOf } from "../../src/lib/assignment-parts";
import { checkAssignmentRequest } from "../../src/lib/practice";
import { readerById } from "../../src/lib/readers";

describe("one assignment for every part", () => {
  test("parts are known readers; a range is kept only where it differs", () => {
    expect(checkParts(undefined)).toEqual({ ok: true, value: null });
    expect(checkParts({ readers: [] }).ok).toBe(false);
    expect(checkParts({ readers: ["soprano", "kazoo"] }).ok).toBe(false);
    const own = readerById.alto.range;
    const r = checkParts({ readers: ["soprano", "alto", "alto"], ranges: { soprano: { min: 14, max: 23 }, alto: own } });
    expect(r).toEqual({ ok: true, value: { readers: ["soprano", "alto"], ranges: { soprano: { min: 14, max: 23 } } } });
    expect(checkParts({ readers: ["bass"], ranges: { bass: { min: 7, max: 9 } } }).ok).toBe(false);
    expect(partsOf({ parts: { readers: ["tenor"] } })).toEqual({ readers: ["tenor"], ranges: {} });
    expect(partsOf({})).toBeNull();
  });

  test("a part takes the teacher's range, with do placed inside it", () => {
    const parts = { readers: ["bass", "soprano"], ranges: { bass: { min: 7, max: 14 } } };
    const bass = partReader(parts, "bass")!;
    expect(bass.clef).toBe("bass");
    expect(bass.range).toEqual({ min: 7, max: 14 });
    expect(bass.anchor).toBeGreaterThanOrEqual(7);
    expect(partReader(parts, "soprano")!.range).toEqual(readerById.soprano.range);
    expect(partReader(parts, "alto")).toBeNull();
  });

  test("transposing parts read the concert keys in their own", () => {
    const voice = readerById.tenor;
    expect(partKeys(["F", "Dm"], voice)).toEqual({ keys: ["F", "Dm"], missing: [] });
    const clarinet = Object.values(readerById).find((r) => r.family === "band" && r.transposeSemitones === -2)!;
    expect(partKeys(["F", "Bb", "Gm"], clarinet)).toEqual({ keys: ["G", "C", "Am"], missing: [] });
    // Concert E for a B♭ instrument is F♯ major, which the page does not write.
    expect(partKeys(["E", "F"], clarinet)).toEqual({ keys: ["G"], missing: ["E"] });
  });

  test("an assignment request carries parts, never with one exercise for everyone", () => {
    const ok = checkAssignmentRequest({ presetKey: "step:sbs-01-rhythm", minutes: 10, parts: { readers: ["soprano", "bass"] } });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.value.parts).toEqual({ readers: ["soprano", "bass"], ranges: {} });
    const fixed = checkAssignmentRequest({ presetKey: "step:sbs-01-rhythm", minutes: 10, exercise: "0abc", parts: { readers: ["soprano"] } });
    expect(fixed.ok).toBe(false);
  });

  test("note names count C4 as 14", () => {
    expect([0, 14, 18, 25].map(noteName)).toEqual(["C2", "C4", "G4", "G5"]);
  });
});
