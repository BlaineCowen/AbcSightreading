import { expect, test } from "bun:test";
import { generateChoralExercise } from "../../src/lib/generateChoral";
import { uilPresets } from "../../src/lib/uil-presets";
import { chords } from "../../src/resources/chords";
import { rhythms } from "../../src/resources/rhythms";
import { textureFor, voicingKind } from "../../src/lib/part-writer";
import { skipLevelFor } from "../../src/lib/uil-skips";
import { TIME_SIGS, choralSelectable, presetVoicing } from "../../scripts/generation-fixtures";
import type { VoiceNote } from "../../src/lib/types";

/**
 * Every other voicing written melody first (part-writer.ts), each part its
 * job in Blaine's pieces. The rates are loose floors under what the writer
 * measures against "Our Hero" (SATB Level 3: alto on do 62%, bass on do or
 * sol 84%, chords complete 83%).
 */
const quiet = () => {};
const ORDER: Record<string, string[]> = {
  "4 Part Mixed": ["Soprano", "Alto", "Tenor", "Bass"],
  "3 Part Mixed": ["Soprano", "Alto", "Baritone"],
  "3 Part Tenor/Bass": ["Tenor", "Baritone", "Bass"],
  "3 Part Treble": ["Soprano1", "Soprano2", "Alto"],
};

function write(n: number, voicing: string, levelKey: keyof typeof uilPresets, nct = 0, rhyme = 0) {
  const level = uilPresets[levelKey];
  const saved = { log: console.log, warn: console.warn };
  Object.assign(console, { log: quiet, warn: quiet });
  try {
    return Array.from({ length: n }, () =>
      generateChoralExercise({
        key: level.allowedKeys[0], timeSig: TIME_SIGS["4/4"], partsObject: presetVoicing(voicing, level)!, measures: 16,
        maxSkip: level.maxSkip, bpm: 72, nctProbability: nct, stepwiseEighths: true, accidentalsByStep: true,
        selectedRhythms: rhythms.filter((r) => level.allowedRhythmNames.includes(r.name) && choralSelectable(r) && !r.rest),
        chords, allowedChordNames: level.allowedChordNames, rhymeProbability: rhyme,
        partWriterLevel: level.level, skipLevel: skipLevelFor(levelKey), breathRests: !level.noRests,
        cadenceTypes: level.allowedCadenceTypes, dottedOnStrongBeats: !!level.dottedOnStrongBeats,
      } as any),
    );
  } finally {
    Object.assign(console, saved);
  }
}

/** The sounding notes at every onset, top part first. */
function sonorities(ex: { voiceNotes: VoiceNote[][]; voiceNames: string[] }, order: string[]) {
  const lines = order.map((name) => {
    let t = 0;
    return ex.voiceNotes[ex.voiceNames.indexOf(name)].map((n) => ({ t: (t += n.length) - n.length, end: t, n }));
  });
  const onsets = [...new Set(lines.flat().map((x) => x.t))].sort((a, b) => a - b);
  return onsets.map((t) => lines.map((l) => l.find((x) => x.t <= t && t < x.end)?.n)).filter((ns) => ns.every((n) => n && !n.rest)) as VoiceNote[][];
}

test("each voicing knows its kind and has a job for every part, at every level", () => {
  const parts = (o: any) => Object.keys(o.parts).map((name) => ({ name }));
  const level = uilPresets["UIL 3"];
  expect(voicingKind(parts(presetVoicing("4 Part Mixed", level)!))).toBe("SATB");
  expect(voicingKind(parts(presetVoicing("3 Part Mixed", level)!))).toBe("SAB");
  expect(voicingKind(parts(presetVoicing("3 Part Tenor/Bass", level)!))).toBe("TBB");
  expect(voicingKind(parts(presetVoicing("3 Part Treble", level)!))).toBe("SSA");
  expect(voicingKind(parts(presetVoicing("2 Part Treble", level)!))).toBe(null);
  for (const l of [1, 2, 3, 4, 5]) {
    expect(textureFor("SATB", l).parts.length).toBe(4);
    for (const k of ["SAB", "TBB", "SSA"] as const) expect(textureFor(k, l).parts.length).toBe(3);
  }
});

test("every UIL voicing is offered at every level", () => {
  for (const key of ["UIL 1", "UIL 2", "UIL 3", "UIL 4", "UIL 5"] as const)
    expect(new Set(uilPresets[key].allowedVoicings)).toEqual(
      new Set(["4 Part Mixed", "3 Part Mixed", "3 Part Treble", "2 Part Treble", "3 Part Tenor/Bass", "2 Part Tenor/Bass"]),
    );
});

test("never crossing, no seconds or sevenths but a suspension, no parallel fifths or octaves", () => {
  for (const [voicing, levelKey] of [["4 Part Mixed", "UIL 3"], ["3 Part Mixed", "UIL 2"], ["3 Part Tenor/Bass", "UIL 1"], ["4 Part Mixed", "UIL 5"], ["3 Part Treble", "UIL 4"]] as const) {
    const order = ORDER[voicing];
    for (const ex of write(6, voicing, levelKey)) {
      const ss = sonorities(ex, order);
      ss.forEach((ns, k) => {
        for (let x = 0; x < ns.length; x++)
          for (let y = x + 1; y < ns.length; y++) {
            const apart = ns[x].pitchValue - ns[y].pitchValue;
            expect(apart).toBeGreaterThanOrEqual(0);
            if (!ns[x].ornament && !ns[y].ornament) expect([1, 6]).not.toContain(apart % 7);
            const prev = ss[k - 1];
            if (prev && prev[x].pitchValue !== ns[x].pitchValue && prev[y].pitchValue !== ns[y].pitchValue && [0, 4, 7, 11, 14].includes(apart))
              expect(prev[x].pitchValue - prev[y].pitchValue).not.toBe(apart);
          }
      });
    }
  }
}, 120_000);

test("SATB at Level 3: the alto holds do, the bass sings roots, the chords are full", () => {
  let altoDo = 0, alto = 0, bassRoot = 0, bass = 0, full = 0, all = 0;
  for (const ex of write(12, "4 Part Mixed", "UIL 3", 0.1, 0.7)) {
    const v = (name: string) => ex.voiceNotes[ex.voiceNames.indexOf(name)].filter((n) => !n.rest);
    for (const n of v("Alto")) { alto += n.length; if (n.degree === 0) altoDo += n.length; }
    for (const n of v("Bass")) { bass += n.length; if (n.degree === 0 || n.degree === 4) bassRoot += n.length; }
    for (const ns of sonorities(ex, ORDER["4 Part Mixed"])) { all++; if (new Set(ns.map((n) => n.degree)).size >= 3) full++; }
  }
  expect(altoDo / alto).toBeGreaterThan(0.45);
  expect(bassRoot / bass).toBeGreaterThan(0.6);
  expect(full / all).toBeGreaterThan(0.65);
}, 120_000);
