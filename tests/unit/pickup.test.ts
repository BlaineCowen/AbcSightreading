import { expect, test } from "bun:test";
import { generateChoralExercise } from "../../src/lib/generateChoral";
import { uilPresets } from "../../src/lib/uil-presets";
import { chords } from "../../src/resources/chords";
import { rhythms } from "../../src/resources/rhythms";
import { skipLevelFor } from "../../src/lib/uil-skips";
import { melodyFirstFor } from "../../src/lib/two-part-treble";
import { ssaLevelFor } from "../../src/lib/three-part-treble";
import { parallelFaults } from "../../src/lib/parallel-check";
import { TENOR_REACH } from "../../src/lib/octave-opening";
import { fromPayload, toPayload } from "../../src/lib/exercise-link";
import { renderChoral } from "../../src/lib/generateChoral";
import { TIME_SIGS, choralSelectable, presetVoicing } from "../../scripts/generation-fixtures";

/**
 * The pickup (pickup.ts) and four parts opening on the tune in octaves
 * (octave-opening.ts, part-writer `octaveOpening`), both from Blaine's pieces.
 */
const quiet = () => {};

function write(n: number, voicing: string, levelKey: keyof typeof uilPresets, opts: { key?: string; meter?: string; pickup?: boolean } = {}) {
  const level = uilPresets[levelKey];
  const timeSig = TIME_SIGS[opts.meter ?? "4/4"];
  const saved = { log: console.log, warn: console.warn };
  Object.assign(console, { log: quiet, warn: quiet });
  try {
    return Array.from({ length: n }, () =>
      generateChoralExercise({
        key: opts.key ?? level.allowedKeys[0], timeSig, partsObject: presetVoicing(voicing, level)!, measures: 8,
        maxSkip: level.maxSkip, bpm: 72, nctProbability: 0.1, stepwiseEighths: true, accidentalsByStep: true,
        selectedRhythms: rhythms.filter((r) => level.allowedRhythmNames.includes(r.name) && choralSelectable(r) && !r.rest && r.totalValue <= timeSig.tsPerMeasure),
        chords, allowedChordNames: level.allowedChordNames, melodyFirst: melodyFirstFor(levelKey), ssaLevel: ssaLevelFor(levelKey),
        partWriterLevel: level.level, skipLevel: skipLevelFor(levelKey), breathRests: !level.noRests,
        cadenceTypes: level.allowedCadenceTypes, dottedOnStrongBeats: !!level.dottedOnStrongBeats, pickup: opts.pickup ?? true,
      } as any),
    );
  } finally {
    Object.assign(console, saved);
  }
}

const topOf = (ex: ReturnType<typeof write>[number]) =>
  ex.renderInput.voiceParts.map((p, i) => [p.order, i] as const).sort((a, b) => b[0] - a[0])[0][1];

test("a pickup is one beat before the first bar, and the last bar gives the beat back", () => {
  for (const [voicing, level, meter] of [
    ["4 Part Mixed", "UIL 1", "4/4"], ["2 Part Treble", "UIL 1", "3/4"], ["3 Part Treble", "UIL 3", "4/4"],
    ["3 Part Mixed", "UIL 4", "2/4"], ["4 Part Mixed", "UIL 5", "3/4"],
  ] as const) {
    const bar = TIME_SIGS[meter].tsPerMeasure;
    const exs = write(8, voicing, level, { meter });
    const withPickup = exs.filter((ex) => ex.renderInput.pickup);
    expect(withPickup.length).toBeGreaterThanOrEqual(6);
    for (const ex of withPickup) {
      expect(ex.renderInput.pickup).toBe(8);
      for (const [i, voice] of ex.voiceNotes.entries()) {
        expect(voice[0].length).toBe(8);
        expect(voice[0].rest).toBe(false);
        const total = voice.reduce((s, n) => s + n.length, 0);
        expect(total % bar).toBe(0);
        const [lo, hi] = ex.renderInput.voiceParts[i].range;
        const reach = ex.voiceNames[i] === "Tenor" && voice[0].doubled ? TENOR_REACH : 0;
        expect(voice[0].pitchValue).toBeGreaterThanOrEqual(lo - reach);
        expect(voice[0].pitchValue).toBeLessThanOrEqual(hi);
      }
      // The ABC: the first barline after the pickup, the last bar a beat short.
      const body = ex.abcString.split("\n").find((l) => l.startsWith("[V:"))!;
      const bars = body.replace(/^\[V:\S+\]\s*/, "").replace(/"[^"]*"/g, "").split(/\|\]?/).map((b) => b.trim()).filter(Boolean);
      const len = (b: string) => [...b.matchAll(/[A-Ga-gz][,']*(\d+)/g)].reduce((s, m) => s + Number(m[1]), 0);
      expect(len(bars[0])).toBe(8);
      expect(len(bars.at(-1)!)).toBe(bar - 8);
      for (const b of bars.slice(1, -1)) expect(len(b)).toBe(bar);
      expect(parallelFaults(ex.voiceNotes, ex.renderInput.key)).toBe(0);
    }
  }
}, 120_000);

test("the pickup is usually so", () => {
  let so = 0, all = 0;
  for (const level of ["UIL 1", "UIL 3", "UIL 5"] as const)
    for (const voicing of ["4 Part Mixed", "2 Part Treble", "3 Part Treble"])
      for (const ex of write(8, voicing, level, { key: "G" }).filter((e) => e.renderInput.pickup)) {
        all++;
        if (ex.voiceNotes[topOf(ex)][0].degree === 4) so++;
      }
  expect(all).toBeGreaterThan(50);
  expect(so / all).toBeGreaterThan(0.55);
}, 120_000);

test("without the option, no pickup", () => {
  for (const ex of write(4, "4 Part Mixed", "UIL 3", { pickup: false })) {
    expect(ex.renderInput.pickup).toBeUndefined();
    const total = ex.voiceNotes[0].reduce((s, n) => s + n.length, 0);
    expect(total).toBe(8 * 32);
  }
});

test("SATB opens on the tune in octaves about half the time, the tenors lower only there", () => {
  let opened = 0;
  const exs = write(40, "4 Part Mixed", "UIL 1", { pickup: false });
  for (const ex of exs) {
    const at = (name: string) => ex.voiceNotes[ex.voiceNames.indexOf(name)];
    const [s, a, t, b] = ["Soprano", "Alto", "Tenor", "Bass"].map(at);
    if (s[0].doubled) {
      opened++;
      for (let k = 0; s[k]?.doubled; k++) {
        expect(a[k].pitchValue).toBe(s[k].pitchValue);
        expect(t[k].pitchValue).toBe(s[k].pitchValue - 7);
        expect(b[k].pitchValue).toBe(s[k].pitchValue - 7);
        expect(a[k].length).toBe(s[k].length);
      }
    }
    const [lo] = ex.renderInput.voiceParts[ex.voiceNames.indexOf("Tenor")].range;
    for (const n of t) if (!n.rest) expect(n.pitchValue).toBeGreaterThanOrEqual(n.doubled ? lo - TENOR_REACH : lo);
    expect(parallelFaults(ex.voiceNotes, ex.renderInput.key)).toBe(0);
  }
  expect(opened).toBeGreaterThan(10);
  expect(opened).toBeLessThan(32);
}, 120_000);

test("a link keeps the pickup", () => {
  const ex = write(6, "4 Part Mixed", "UIL 3").find((e) => e.renderInput.pickup)!;
  const back = fromPayload(JSON.parse(JSON.stringify(toPayload({ kind: "choral", result: { exercise: ex.renderInput } }))));
  expect(back.ok).toBe(true);
  if (!back.ok || back.exercise.kind !== "choral") return;
  expect(back.exercise.result.exercise!.pickup).toBe(8);
  expect(renderChoral(back.exercise.result.exercise!)).toBe(renderChoral(ex.renderInput));
});
