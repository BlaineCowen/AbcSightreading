import { expect, test } from "bun:test";
import { generateChoralExercise } from "../../src/lib/generateChoral";
import { uilPresets } from "../../src/lib/uil-presets";
import { chords } from "../../src/resources/chords";
import { rhythms } from "../../src/resources/rhythms";
import { isThreePartTreble, ssaLevelFor } from "../../src/lib/three-part-treble";
import { listedSkip, skipLevelFor } from "../../src/lib/uil-skips";
import { TIME_SIGS, choralSelectable, presetVoicing } from "../../scripts/generation-fixtures";
import type { VoiceNote } from "../../src/lib/types";

/**
 * Three treble parts at Levels 2 and 3, each part doing its job in Blaine's
 * SSA pieces (three-part-treble.ts). Floors well under the writer's measured
 * rates (Level 2: soprano 2 on do 59% of its time, the alto on do or low sol
 * 82%) and well over the general writer's (soprano 2 on do 12%, the alto 57%,
 * its tune on so 78%), so a randomised run does not flake and losing the
 * writer fails.
 */
const quiet = () => {};

function write(n: number, levelKey: "UIL 2" | "UIL 3", nctProbability = 0.1, rhymeProbability = 0.7) {
  const level = uilPresets[levelKey];
  const saved = { log: console.log, warn: console.warn };
  Object.assign(console, { log: quiet, warn: quiet });
  try {
    return Array.from({ length: n }, () =>
      generateChoralExercise({
        key: "G", timeSig: TIME_SIGS["4/4"], partsObject: presetVoicing("3 Part Treble", level)!, measures: 16,
        maxSkip: level.maxSkip, bpm: 72, nctProbability, stepwiseEighths: true, accidentalsByStep: true,
        selectedRhythms: rhythms.filter((r) => level.allowedRhythmNames.includes(r.name) && choralSelectable(r) && !r.rest),
        chords, allowedChordNames: level.allowedChordNames, rhymeProbability, ssaLevel: ssaLevelFor(levelKey), skipLevel: skipLevelFor(levelKey),
        breathRests: !level.noRests, cadenceTypes: level.allowedCadenceTypes, dottedOnStrongBeats: !!level.dottedOnStrongBeats,
      } as any),
    );
  } finally {
    Object.assign(console, saved);
  }
}

/** The sounding notes at every onset, top part first. */
function sonorities(ex: { voiceNotes: VoiceNote[][]; voiceNames: string[] }) {
  const order = ["Soprano1", "Soprano2", "Alto"].map((n) => ex.voiceNames.indexOf(n));
  const lines = order.map((i) => {
    let t = 0;
    return ex.voiceNotes[i].map((n) => ({ t: (t += n.length) - n.length, end: t, n }));
  });
  const onsets = [...new Set(lines.flat().map((x) => x.t))].sort((a, b) => a - b);
  return onsets
    .map((t) => lines.map((l) => l.find((x) => x.t <= t && t < x.end)?.n))
    .filter((ns) => ns.every((n) => n && !n.rest)) as VoiceNote[][];
}

test("SSA is written melody first at Levels 2 and 3 only", () => {
  expect(ssaLevelFor("UIL 2")).toBe(2);
  expect(ssaLevelFor("UIL 3")).toBe(3);
  expect(ssaLevelFor("UIL 4")).toBe(null);
  const parts = (o: any) => Object.keys(o.parts).map((name) => ({ name }));
  expect(isThreePartTreble(parts(presetVoicing("3 Part Treble", uilPresets["UIL 2"])!))).toBe(true);
  expect(isThreePartTreble(parts(presetVoicing("3 Part Mixed", uilPresets["UIL 2"])!))).toBe(false);
  expect(uilPresets["UIL 2"].allowedVoicings).toContain("3 Part Treble");
  expect(uilPresets["UIL 3"].allowedVoicings).toContain("3 Part Treble");
});

test("the writer never crosses, sings no seconds or sevenths between parts but a suspension, and no parallel fifths or octaves", () => {
  for (const levelKey of ["UIL 2", "UIL 3"] as const) {
    for (const ex of write(12, levelKey, 0, 0)) {
      const ss = sonorities(ex);
      ss.forEach((ns, k) => {
        for (const [x, y] of [[0, 1], [1, 2], [0, 2]]) {
          const apart = ns[x].pitchValue - ns[y].pitchValue;
          expect(apart).toBeGreaterThanOrEqual(0);
          // Only a suspension may rub: soprano 2's held do against the tune's re (The Rainbird).
          if (!ns[x].ornament && !ns[y].ornament) expect([1, 6]).not.toContain(apart % 7);
          const prev = ss[k - 1];
          if (prev && prev[x].pitchValue !== ns[x].pitchValue && prev[y].pitchValue !== ns[y].pitchValue && [0, 4, 7].includes(apart))
            expect(prev[x].pitchValue - prev[y].pitchValue).not.toBe(apart);
        }
      });
    }
  }
}, 60_000);

test("Level 2: the tune moves by step, soprano 2 holds do, the alto sings a bass on do and low sol", () => {
  let s2Do = 0, s2 = 0, aRoot = 0, a = 0, steps = 0, moves = 0;
  for (const ex of write(25, "UIL 2")) {
    const v = (name: string) => ex.voiceNotes[ex.voiceNames.indexOf(name)].filter((n) => !n.rest);
    for (const n of v("Soprano2")) { s2 += n.length; if (n.degree === 0) s2Do += n.length; }
    for (const n of v("Alto")) { a += n.length; if (n.degree === 0 || n.degree === 4) aRoot += n.length; }
    const tune = v("Soprano1");
    for (let i = 1; i < tune.length; i++) {
      const d = Math.abs(tune[i].pitchValue - tune[i - 1].pitchValue);
      if (d === 0) continue;
      moves++;
      if (d === 1) steps++;
    }
  }
  expect(s2Do / s2).toBeGreaterThan(0.45);
  // 76% measured once IV was priced up (the alto sings la under it, unable to
  // reach fa); Spring 84%, the general writer 57%.
  expect(aRoot / a).toBeGreaterThan(0.65);
  expect(steps / moves).toBeGreaterThan(0.6);
}, 60_000);

// The cadential suspension of Spring and The Rainbird: soprano 2 holds do over
// the V's sol (a fourth), falls to ti, then home. About 0.7 an 8-bar Level 2
// exercise, measured (one authentic cadence each, when the rhythm allows);
// none before it was written in.
test("Level 2 cadences carry soprano 2's do held over sol, falling to ti", () => {
  let found = 0;
  const exercises = write(30, "UIL 2", 0, 0);
  for (const ex of exercises) {
    const s2 = ex.voiceNotes[ex.voiceNames.indexOf("Soprano2")];
    const alto = ex.voiceNotes[ex.voiceNames.indexOf("Alto")];
    for (let i = 1; i + 1 < s2.length; i++) {
      const [p, n, r] = [s2[i - 1], s2[i], s2[i + 1]];
      if (p.rest || n.rest || r.rest) continue;
      if (p.pitchValue === n.pitchValue && n.degree === 0 && r.degree === 6 && r.pitchValue === n.pitchValue - 1 && alto[i]?.degree === 4) found++;
    }
  }
  expect(found / exercises.length).toBeGreaterThan(0.3);
}, 120_000);

// "Too much skip in 8th notes" (Blaine, 7 October 2026): the restatement pass
// copied phrases and swapped notes checking maxSkip alone, and 6% of short
// notes in SSA restatements were leapt to or from. Now none in the upper parts.
test("with restatements on, the upper parts reach and leave every eighth by step", () => {
  for (const levelKey of ["UIL 2", "UIL 3"] as const) {
    for (const ex of write(15, levelKey, 0, 0.85)) {
      for (const name of ["Soprano1", "Soprano2"]) {
        const sung = ex.voiceNotes[ex.voiceNames.indexOf(name)].filter((n) => !n.rest);
        for (let i = 1; i < sung.length; i++) {
          if (sung[i].length >= 8 && sung[i - 1].length >= 8) continue;
          expect(Math.abs(sung[i].pitchValue - sung[i - 1].pitchValue)).toBeLessThanOrEqual(1);
        }
      }
    }
  }
}, 120_000);

// The half cadence at bar 4 carries it inside the long V (The Rainbird, bars 4
// and 20): soprano 2's note splits, do held over the V, then ti. "I should be
// seeing them in m 4 more often" (Blaine). 92% of 8-bar Level 2 exercises,
// measured; 0 before.
test("Level 2's half cadence at bar 4 holds do over the V, then falls to ti", () => {
  let found = 0;
  const level = uilPresets["UIL 2"];
  const saved = { log: console.log, warn: console.warn };
  Object.assign(console, { log: quiet, warn: quiet });
  const exercises = Array.from({ length: 25 }, () =>
    generateChoralExercise({
      key: "G", timeSig: TIME_SIGS["4/4"], partsObject: presetVoicing("3 Part Treble", level)!, measures: 8,
      maxSkip: level.maxSkip, bpm: 72, nctProbability: 0, stepwiseEighths: true, accidentalsByStep: true,
      selectedRhythms: rhythms.filter((r) => level.allowedRhythmNames.includes(r.name) && choralSelectable(r) && !r.rest),
      chords, allowedChordNames: level.allowedChordNames, rhymeProbability: 0, ssaLevel: 2, skipLevel: 2,
      // As the page asks for Level 2 (UIL: no rests, no deceptive cadence).
      breathRests: false, cadenceTypes: level.allowedCadenceTypes, dottedOnStrongBeats: true,
    } as any),
  );
  Object.assign(console, saved);
  for (const ex of exercises) {
    let t = 0;
    const s2 = ex.voiceNotes[ex.voiceNames.indexOf("Soprano2")].map((n: VoiceNote) => ({ n, t: (t += n.length) - n.length }));
    if (s2.some(({ n, t }, i) => t >= 96 && t < 128 && n.ornament && n.degree === 0 && s2[i + 1]?.n.degree === 6 && s2[i + 1].n.pitchValue === n.pitchValue - 1)) found++;
  }
  expect(found / exercises.length).toBeGreaterThan(0.6);
}, 120_000);

// "LVL 2 should not be jumping la to mi" (Blaine, 7 October 2026): every part,
// decoration and restatements on, skips only as UIL lists for Level 2.
test("Level 2 SSA skips only as UIL lists, in every part", () => {
  for (const ex of write(15, "UIL 2", 0.1, 0.85)) {
    for (const v of ex.voiceNotes) {
      const sung = v.filter((n) => !n.rest);
      for (let i = 1; i < sung.length; i++) expect(listedSkip(2, sung[i - 1], sung[i])).toBe(true);
    }
  }
}, 120_000);
