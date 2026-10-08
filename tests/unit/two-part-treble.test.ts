import { expect, test } from "bun:test";
import { generateChoralExercise } from "../../src/lib/generateChoral";
import { uilPresets } from "../../src/lib/uil-presets";
import { chords } from "../../src/resources/chords";
import { rhythms } from "../../src/resources/rhythms";
import { barShapeWeight, isTwoPartTreble, melodyFirstFor } from "../../src/lib/two-part-treble";
import { TIME_SIGS, choralSelectable, presetVoicing } from "../../scripts/generation-fixtures";
import type { VoiceNote } from "../../src/lib/types";

/**
 * Two treble parts at Level 1, written melody first, held to the shape of
 * Blaine's Level 1 SA piece (two-part-treble.ts). The rates are loose
 * floors well under what the writer measures (alto on do 63%, thirds and
 * sixths 77%, soprano by step 66%), so a randomised run does not flake, and
 * well over the general writer's (38%, 61% with the minor sixth so over ti
 * a third of it, 49%), so losing the writer fails.
 */
const level = uilPresets["UIL 1"];
const quiet = () => {};

function write(n: number, melodyFirst = true, nctProbability = 0.1) {
  const saved = { log: console.log, warn: console.warn };
  Object.assign(console, { log: quiet, warn: quiet });
  try {
    return Array.from({ length: n }, () =>
      generateChoralExercise({
        key: "F", timeSig: TIME_SIGS["4/4"], partsObject: presetVoicing("2 Part Treble", level)!, measures: 16,
        maxSkip: level.maxSkip, bpm: 72, nctProbability, stepwiseEighths: true, accidentalsByStep: true,
        selectedRhythms: rhythms.filter((r) => level.allowedRhythmNames.includes(r.name) && choralSelectable(r) && !r.rest),
        chords, allowedChordNames: level.allowedChordNames, rhymeProbability: 0.85, unisonProbability: 1, melodyFirst,
      } as any),
    );
  } finally {
    Object.assign(console, saved);
  }
}

/** Each sounding pair, at every onset in either part: [soprano, alto] pitch values. */
function pairs(voices: VoiceNote[][], names: string[]) {
  const timeline = (v: VoiceNote[]) => {
    let t = 0;
    return v.map((n) => ({ t: (t += n.length) - n.length, end: t, n }));
  };
  const S = timeline(voices[names.indexOf("Soprano")]);
  const A = timeline(voices[names.indexOf("Alto")]);
  const at = (line: typeof S, t: number) => line.find((x) => x.t <= t && t < x.end)?.n;
  const onsets = [...new Set([...S, ...A].map((x) => x.t))].sort((a, b) => a - b);
  return onsets.map((t) => [at(S, t), at(A, t)] as const).filter(([s, a]) => s && a && !s.rest && !a.rest) as [VoiceNote, VoiceNote][];
}

test("only two treble parts, at Levels 1 and 2, are written melody first", () => {
  expect(melodyFirstFor("UIL 1")).toBe(true);
  expect(melodyFirstFor("UIL 2")).toBe(true);
  expect(melodyFirstFor("UIL 3")).toBe(false);
  expect(melodyFirstFor(undefined)).toBe(false);
  const sa = presetVoicing("2 Part Treble", level)!;
  const tb = presetVoicing("2 Part Tenor/Bass", level)!;
  const parts = (o: any) => Object.entries(o.parts).map(([name, p]: [string, any]) => ({ name, ...p }));
  expect(isTwoPartTreble(parts(sa) as any)).toBe(true);
  expect(isTwoPartTreble(parts(tb) as any)).toBe(false);
});

test("the alto holds do under a tune in thirds and sixths, moving by step, never crossing", () => {
  const exercises = write(20);
  let all = 0, doTime = 0, altoTime = 0, sweet = 0, crossed = 0, steps = 0, moves = 0;
  for (const ex of exercises) {
    const names = ex.voiceNames;
    for (const [s, a] of pairs(ex.voiceNotes, names)) {
      all++;
      const apart = s.pitchValue - a.pitchValue;
      if (apart < 0) crossed++;
      if (apart % 7 === 2 || apart % 7 === 5) sweet++;
    }
    for (const n of ex.voiceNotes[names.indexOf("Alto")]) if (!n.rest) { altoTime += n.length; if (n.degree === 0) doTime += n.length; }
    const sop = ex.voiceNotes[names.indexOf("Soprano")].filter((n) => !n.rest);
    for (let i = 1; i < sop.length; i++) {
      const d = Math.abs(sop[i].pitchValue - sop[i - 1].pitchValue);
      if (d === 0) continue;
      moves++;
      if (d === 1) steps++;
    }
  }
  expect(crossed).toBe(0);
  expect(doTime / altoTime).toBeGreaterThan(0.5);
  expect(sweet / all).toBeGreaterThan(0.68);
  expect(steps / moves).toBeGreaterThan(0.75);
}, 60_000);

/** Parallel fifths, octaves or unisons between consecutive sounding pairs. */
function parallels(ex: ReturnType<typeof write>[number]) {
  const ps = pairs(ex.voiceNotes, ex.voiceNames);
  let n = 0;
  for (let i = 1; i < ps.length; i++) {
    const [s0, a0] = ps[i - 1];
    const [s1, a1] = ps[i];
    const was = s0.pitchValue - a0.pitchValue;
    const now = s1.pitchValue - a1.pitchValue;
    if (s0.pitchValue !== s1.pitchValue && a0.pitchValue !== a1.pitchValue && now === was && [0, 4, 7].includes(now)) n++;
  }
  return n;
}

test("the writer itself writes no parallel fifths, octaves or unisons", () => {
  for (const ex of write(15, true, 0)) expect(parallels(ex)).toBe(0);
}, 60_000);

// The decoration pass, run after, now and then splits a note into a pair of
// eighths that lands in fifths with the other part: 3 in 60 exercises,
// measured; the general writer's path had 139 in the same 60.
test("decorated, parallels stay rare", () => {
  const exercises = write(30);
  expect(exercises.reduce((n, ex) => n + parallels(ex), 0)).toBeLessThanOrEqual(8);
}, 60_000);

test("bars open on a half, never put one across the middle, and keep eighths off the downbeat", () => {
  const half = rhythms.find((r) => r.name === "half")!;
  const quarter = rhythms.find((r) => r.name === "quarter")!;
  const eighths = rhythms.find((r) => r.name === "eighthEighth")!;
  expect(barShapeWeight(half, 0, 32)).toBeGreaterThan(barShapeWeight(quarter, 0, 32));
  expect(barShapeWeight(half, 8, 32)).toBeLessThan(0.1);
  expect(barShapeWeight(eighths, 0, 32)).toBeLessThan(barShapeWeight(eighths, 24, 32));
  // Measured: a half opens most bars (his piece: 75%; drawn without the shape, about 45%).
  let bars = 0, openHalf = 0;
  for (const ex of write(10)) {
    let t = 0;
    for (const n of ex.voiceNotes[ex.voiceNames.indexOf("Soprano")]) {
      if (t % 32 === 0) { bars++; if (n.length >= 16) openHalf++; }
      t += n.length;
    }
  }
  expect(openHalf / bars).toBeGreaterThan(0.55);
}, 60_000);
