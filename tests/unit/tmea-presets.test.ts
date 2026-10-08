import { expect, test } from "bun:test";
import { createNewSr } from "../../src/lib/generateUnison";
import { TMEA_LEVELS, tmeaById, tmeaGenerationParams, tmeaLevelOf, tmeaMeasures, tmeaPartLevel, tmeaVoiceLevels } from "../../src/lib/tmea-presets";
import { itemForKey } from "../../src/lib/class-course";
import { presetKeyOf, parsePresetKey } from "../../src/lib/class-validate";
import { BUILTIN_SETS, TMEA_ALLSTATE } from "../../src/lib/curriculum/catalogue";
import { noteArray } from "../../src/resources/noteArray";

/**
 * TMEA All-State Voice levels I-IV (tmea-presets.ts), against TMEA's chart
 * (Sightreading Levels, July 2025). scripts/check-tmea.ts walks every level x
 * part x key x meter; this holds the chart's facts and a sample of exercises.
 */
test("four levels, four parts each, with the chart's keys, ranges and meters", () => {
  expect(tmeaVoiceLevels.length).toBe(16);
  expect(TMEA_LEVELS.map((l) => l.id)).toEqual(["tmea-voice-1", "tmea-voice-2", "tmea-voice-3", "tmea-voice-4"]);
  expect(tmeaById["tmea-voice-1-soprano"].keys).toEqual(["F", "G"]);
  expect(tmeaById["tmea-voice-2-alto"].keys).toEqual(["C", "D", "Eb"]);
  expect(tmeaById["tmea-voice-3-bass"].keys).toEqual(["Bb", "C", "D", "Eb"]);
  expect(tmeaById["tmea-voice-1-bass"].range).toEqual({ min: 4, max: 15 }); // G2-D4
  expect(tmeaById["tmea-voice-3-tenor"].range).toEqual({ min: 8, max: 18 }); // D3-G4
  expect(tmeaById["tmea-voice-1-tenor"].clef).toBe("treble-8");
  expect(tmeaById["tmea-voice-1-soprano"].meters).toEqual(["4/4", "2/4"]);
  expect(tmeaById["tmea-voice-3-soprano"].meters).toContain("6/8");
  expect(tmeaMeasures(tmeaById["tmea-voice-3-soprano"], "2/4")).toBe(16);
  expect(tmeaMeasures(tmeaById["tmea-voice-3-soprano"], "3/4")).toBe(12);
  expect(tmeaById["tmea-voice-1-soprano"].maxSkip).toBe(3); // a 4th
  expect(tmeaById["tmea-voice-2-soprano"].maxSkip).toBe(4); // a 5th
  expect(tmeaById["tmea-voice-4-soprano"].sharpDegrees).toEqual([4, 5]); // fi, si
});

test("a subscribable set whose levels mark passed in a class", () => {
  expect(BUILTIN_SETS.some((s) => s.id === TMEA_ALLSTATE)).toBe(true);
  const key = presetKeyOf.tmea("tmea-voice-2-alto");
  expect(parsePresetKey(key)).toEqual({ kind: "tmea", id: "tmea-voice-2-alto" });
});

test("the first bar is all beat notes, the length follows the meter, no sung leap past the level's", () => {
  const quiet = () => {};
  for (const [id, key, meter] of [["tmea-voice-1-soprano", "F", "4/4"], ["tmea-voice-2-bass", "Eb", "3/4"], ["tmea-voice-3-alto", "C", "6/8"], ["tmea-voice-4-tenor", "E", "2/4"]] as const) {
    const l = tmeaById[id];
    for (let i = 0; i < 6; i++) {
      const saved = { log: console.log, warn: console.warn };
      Object.assign(console, { log: quiet, warn: quiet });
      let abc: string;
      try { abc = String((createNewSr(tmeaGenerationParams(l, { key, meter }) as any)[0])); } finally { Object.assign(console, saved); }
      const body = abc.split("\n").filter((x) => !/^[A-Za-z%]:|^%|^w:/.test(x) && x.trim()).join(" ").replace(/"[^"]*"/g, "");
      const bars = body.split("|").map((b) => b.trim()).filter((b) => b && b !== "]");
      expect(bars.length).toBe(tmeaMeasures(l, meter));
      const beat = meter === "6/8" ? 4 : 8;
      for (const t of bars[0].match(/z?[\^_=]*[A-Ga-gz][,']*\d+/g) ?? []) expect(Number(t.match(/\d+$/)![0])).toBe(beat);
      // A treble-8 part is written an octave above where it sounds (generateUnison clefFor).
      const notes = (body.match(/[\^_=]*[A-Ga-g][,']*(?=\d)/g) ?? []).map((t) => noteArray.indexOf(t.replace(/^[\^_=]+/, ""))).map((p) => (l.clef === "treble-8" ? p - 7 : p));
      for (const p of notes) expect(p >= l.range.min && p <= l.range.max).toBe(true);
      for (let k = 1; k < notes.length; k++) expect(Math.abs(notes[k] - notes[k - 1])).toBeLessThanOrEqual(l.maxSkip);
    }
  }
}, 60_000);

test("a level is one preset for every part; the first form's per-part ids still open, as their level and part", () => {
  expect(tmeaLevelOf("tmea-voice-2")).toEqual({ level: TMEA_LEVELS[1], part: null });
  expect(tmeaLevelOf("tmea-voice-3-tenor")).toEqual({ level: TMEA_LEVELS[2], part: "Tenor" });
  expect(tmeaLevelOf("tmea-voice-5")).toBeNull();
  expect(tmeaLevelOf("tmea-voice-1-baritone")).toBeNull();
  expect(tmeaPartLevel(3, "Tenor")).toBe(tmeaById["tmea-voice-3-tenor"]);
  // Class check marks: the level's key, and one kept from the first form.
  expect(parsePresetKey("tmea:tmea-voice-2")).toEqual({ kind: "tmea", id: "tmea-voice-2" });
  expect(parsePresetKey("tmea:tmea-voice-2-alto")).toEqual({ kind: "tmea", id: "tmea-voice-2-alto" });
  expect(itemForKey("tmea:tmea-voice-2", [])?.label).toBe("TMEA All-State Level II");
  expect(itemForKey("tmea:tmea-voice-2-alto", [])?.label).toBe("TMEA All-State Level II · Alto");
});
