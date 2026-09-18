import { describe, expect, test } from "bun:test";
import { runChoralJob, rendererFor, type ChoralJob } from "../../src/lib/choral-jobs";
import { generateChoralExercise } from "../../src/lib/generateChoral";
import { planForm } from "../../src/lib/form-plan";
import { chords as fullChordSet } from "../../src/resources/chords";
import { rhythms as allRhythms } from "../../src/resources/rhythms";

/**
 * Choral generation runs in a worker so a hard exercise cannot freeze the page
 * (16 bars at UIL 5 took up to 2s on a desktop, over 3 when it failed - much
 * longer on a phone, with nothing moving). Two things have to hold for that to
 * be invisible:
 *
 * - what the job returns survives the trip between threads, which is a
 *   structured clone - no functions, nothing that clones differently;
 * - the `render` rebuilt from it writes exactly what the generator's own would,
 *   so the annotation toggles and the history arrows behave as before.
 */

const PARTS = {
  numofParts: 4,
  parts: {
    Soprano: { order: 3, smallName: "S", clef: "treble", range: [21, 35], currentRange: [25, 32] },
    Alto: { order: 2, smallName: "A", clef: "treble", range: [14, 32], currentRange: [21, 28] },
    Tenor: { order: 1, smallName: "T", clef: "treble transpose=-12", range: [11, 27], currentRange: [14, 23] },
    Bass: { order: 0, smallName: "B", clef: "bass", range: [2, 24], currentRange: [9, 18] },
  },
} as any;

const params = {
  key: "C",
  timeSig: { name: "4/4", tsPerMeasure: 32, beamGroupSize: 8 },
  partsObject: PARTS,
  measures: 8,
  maxSkip: 4,
  bpm: 72,
  selectedRhythms: allRhythms.filter((r) => ["whole", "half", "quarter"].includes(r.name)),
  chords: fullChordSet,
  accidentalsByStep: true,
  nctProbability: 0.3,
  chromaticFrequency: 1,
  display: { chordSymbols: true },
} as any;

const quietly = <T>(fn: () => T): T => {
  const { log, warn, error } = console;
  Object.assign(console, { log: () => {}, warn: () => {}, error: () => {} });
  try {
    for (let i = 0; i < 30; i++) {
      try { return fn(); } catch { /* a randomised search: try again */ }
    }
    throw new Error("could not generate in 30 attempts");
  } finally {
    Object.assign(console, { log, warn, error });
  }
};

const displays = [
  {},
  { chordSymbols: true },
  { lyrics: "movable" as const },
  { lyrics: "fixed" as const, chordSymbols: true },
  { lyrics: "names" as const, midiProgram: 52 },
];

describe("a choral job", () => {
  test("an exercise survives the trip between threads", () => {
    const result = quietly(() => runChoralJob({ kind: "exercise", params }));
    expect(() => structuredClone(result)).not.toThrow();
    expect(structuredClone(result)).toEqual(result);
  });

  test("its rebuilt render writes exactly what the generator's own does", () => {
    // Run the generator directly, then feed its render input through the same
    // path a worker result takes - cloned, then rebuilt.
    const out = quietly(() => generateChoralExercise(params));
    const cloned = structuredClone({
      abc: out.abcString,
      chordProgression: out.chordProgression,
      roughSeams: [],
      exercise: out.renderInput,
    });
    const render = rendererFor(cloned);
    for (const d of displays) expect(render(d)).toBe(out.render(d));
  });

  test("the score it hands back already carries the annotations asked for", () => {
    const result = quietly(() => runChoralJob({ kind: "exercise", params }));
    expect(result.abc).toContain('"^');
    expect(rendererFor(result)({ chordSymbols: true })).toBe(result.abc);
  });

  test("a full-length piece survives the trip, and re-renders every section", () => {
    const job: ChoralJob = { kind: "piece", params, plan: planForm({ level: 2, key: "C" }), maxSkip: 4 };
    const result = quietly(() => runChoralJob(job));
    const cloned = structuredClone(result);
    expect(cloned.sections?.length).toBeGreaterThan(1);
    const render = rendererFor(cloned);
    // Chord symbols were asked for at generation, so the joined score matches.
    expect(render({ chordSymbols: true })).toBe(result.abc);
    // ...and a lyric line reaches every section, not just the first.
    const lyricLines = render({ lyrics: "movable" }).split("\n").filter((l) => l.startsWith("w:"));
    expect(lyricLines.length).toBeGreaterThanOrEqual(4);
    expect(render({})).not.toContain("w:");
  }, 60000);
});
