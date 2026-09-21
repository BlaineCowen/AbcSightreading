import { describe, expect, test } from "bun:test";
import { runChoralJob, rendererFor, type ChoralJob } from "../../src/lib/choral-jobs";
import { planForm } from "../../src/lib/form-plan";
import { createNewSr, assembleUnisonAbc, type UnisonScore } from "../../src/lib/generateUnison";
import {
  packExercise,
  unpackExercise,
  exerciseParam,
  exerciseFragment,
  choralSummary,
  fromPayload,
  toPayload,
} from "../../src/lib/exercise-link";
import { chords as fullChordSet } from "../../src/resources/chords";
import { rhythms } from "../../src/resources/rhythms";

/**
 * A link to the exercise on screen carries its notes, packed down to what the
 * assemblers read. The promise is that opening it shows the same exercise -
 * the same ABC, byte for byte, under every display option - so that is what
 * these check, rather than the shape of the payload.
 */

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

const SATB = {
  numofParts: 4,
  parts: {
    Soprano: { order: 3, smallName: "S", clef: "treble octave=-1", range: [21, 35], currentRange: [25, 32] },
    Alto: { order: 2, smallName: "A", clef: "treble octave=-1", range: [14, 32], currentRange: [21, 28] },
    Tenor: { order: 1, smallName: "T", clef: "treble transpose=-12", range: [11, 27], currentRange: [14, 23] },
    Bass: { order: 0, smallName: "B", clef: "bass octave=-1", range: [2, 24], currentRange: [9, 18] },
  },
} as any;

const choralParams = (key: string, meter: "4/4" | "3/4") => ({
  key,
  timeSig: { name: meter, tsPerMeasure: meter === "4/4" ? 32 : 24, beamGroupSize: 8 },
  partsObject: SATB,
  measures: 8,
  maxSkip: 4,
  bpm: 72,
  selectedRhythms: rhythms.filter((r) => ["half", "quarter", "eighthEighth"].includes(r.name)),
  chords: fullChordSet,
  accidentalsByStep: true,
  nctProbability: 0.3,
  chromaticFrequency: 1,
}) as any;

/** Every display option the page can ask for, in combination. */
const choralDisplays = (() => {
  const out: any[] = [];
  for (const chordSymbols of [false, true])
    for (const lyrics of [null, "movable", "fixed", "names"])
      for (const hiddenVoices of [[], ["Soprano"], ["Alto", "Tenor"]])
        for (const midiProgram of [undefined, 52])
          out.push({ chordSymbols, lyrics, hiddenVoices, ...(midiProgram === undefined ? {} : { midiProgram }) });
  return out;
})();

async function roundTrip(exercise: Parameters<typeof packExercise>[0], expect?: "choral" | "unison") {
  const value = await packExercise(exercise);
  const opened = await unpackExercise(value, expect);
  if (!opened.ok) throw new Error(`did not open: ${opened.problem}`);
  return { value, exercise: opened.exercise };
}

describe("a choral exercise in a link", () => {
  for (const [key, meter] of [["A", "4/4"], ["Eb", "3/4"], ["F#m", "4/4"], ["Cm", "3/4"]] as const) {
    test(`re-renders byte for byte - ${key}, ${meter}`, async () => {
      const result = quietly(() => runChoralJob({ kind: "exercise", params: choralParams(key, meter) }));
      const { value, exercise } = await roundTrip({ kind: "choral", result }, "choral");
      if (exercise.kind !== "choral") throw new Error("wrong kind");
      const original = rendererFor(result);
      const reopened = rendererFor({ abc: "", chordProgression: [], roughSeams: [], ...exercise.result });
      for (const display of choralDisplays) expect(reopened(display)).toBe(original(display));
      expect(value).toMatch(/^1[A-Za-z0-9_-]+$/);
      expect(value.length).toBeLessThan(1000);
    });
  }

  test("the summary names what the page has to set", async () => {
    const result = quietly(() => runChoralJob({ kind: "exercise", params: choralParams("Eb", "3/4") }));
    const { exercise } = await roundTrip({ kind: "choral", result });
    if (exercise.kind !== "choral") throw new Error("wrong kind");
    expect(choralSummary(exercise.result)).toEqual({
      key: "Eb",
      meter: "3/4",
      tempo: 72,
      voiceNames: ["Soprano", "Alto", "Tenor", "Bass"],
      bars: 8,
    });
  });

  test("a full-length piece re-renders byte for byte, restatements packed as references", async () => {
    const job: ChoralJob = {
      kind: "piece",
      params: choralParams("C", "4/4"),
      plan: planForm({ level: 4, key: "C" }),
      maxSkip: 4,
    };
    const result = quietly(() => runChoralJob(job));
    const { value, exercise } = await roundTrip({ kind: "choral", result });
    if (exercise.kind !== "choral") throw new Error("wrong kind");
    const original = rendererFor(result);
    const reopened = rendererFor({ abc: "", chordProgression: [], roughSeams: [], ...exercise.result });
    for (const display of choralDisplays.slice(0, 12)) expect(reopened(display)).toBe(original(display));

    const payload = toPayload({ kind: "choral", result }) as any;
    if (result.sections!.some((s) => s.restated)) {
      expect(payload.s.some((s: any) => "r" in s)).toBe(true);
    }
    expect(value.length).toBeLessThan(4000);
    expect(choralSummary(exercise.result).bars).toBe(
      result.sections!.reduce((sum, s) => sum + s.measures, 0)
    );
  }, 60000);
});

// ── Unison ──────────────────────────────────────────────────────────────────

const unisonParams = (over: Record<string, unknown> = {}) => ({
  bpm: 60,
  clef: "treble",
  selectedClef: "treble",
  timeSig: { name: "4/4", tsPerMeasure: 32, beamGroupSize: 8 },
  selectedTimeSignature: "4/4",
  measures: 8,
  maxSkip: 4,
  tempo: 60,
  range: { min: 14, max: 23 },
  selectedRhythms: ["quarter", "eighthEighth", "half"],
  rhythms: rhythms.filter((r) => ["quarter", "eighthEighth", "half"].includes(r.name)),
  scaleDegrees: new Set([1, 2, 3, 4, 5]),
  key: "C",
  chords: ["1", "2", "3", "4", "5", "6", "7"],
  showSolfege: true,
  showRhythmSyllables: true,
  syllableSystemId: "kodaly",
  partsObject: {
    numofParts: 1,
    parts: { Unison: { chordNoteObject: [], order: 0, smallName: "U", selectedRange: [14, 23] } },
  },
  ...over,
});

const unisonDisplays = (() => {
  const out: any[] = [];
  for (const showSolfege of [false, true])
    for (const lyricSystem of ["movable", "fixed", "names"])
      for (const showRhythmSyllables of [false, true])
        for (const syllableSystemId of ["kodaly", "counting"])
          out.push({ showSolfege, lyricSystem, showRhythmSyllables, syllableSystemId });
  return out;
})();

async function expectUnisonRoundTrip(score: UnisonScore) {
  const { exercise } = await roundTrip({ kind: "unison", score }, "unison");
  if (exercise.kind !== "unison") throw new Error("wrong kind");
  for (const display of unisonDisplays) {
    expect(assembleUnisonAbc(exercise.score, display)).toBe(assembleUnisonAbc(score, display));
  }
  return exercise.score;
}

describe("a unison exercise in a link", () => {
  test("pitched, with chromatics and ties across the barline, re-renders byte for byte", async () => {
    const [, , score] = quietly(() =>
      createNewSr(unisonParams({
        key: "G",
        selectedSharpDegrees: [4],
        accidentalsFollowStep: true,
        allowTiesAcrossBarline: true,
        selectedRhythms: ["quarter", "half", "dotHalf"],
        rhythms: rhythms.filter((r) => ["quarter", "half", "dotHalf"].includes(r.name)),
      }) as any)
    ) as any;
    await expectUnisonRoundTrip(score);
  });

  test("bass clef in 3/4 re-renders byte for byte", async () => {
    const [, , score] = quietly(() =>
      createNewSr(unisonParams({
        clef: "bass",
        selectedClef: "bass",
        key: "F",
        range: { min: 2, max: 12 },
        timeSig: { name: "3/4", tsPerMeasure: 24, beamGroupSize: 8 },
        selectedTimeSignature: "3/4",
      }) as any)
    ) as any;
    const reopened = await expectUnisonRoundTrip(score);
    expect(reopened.clef).toBe(score.clef);
  });

  test("rhythm-only re-renders byte for byte", async () => {
    const [, , score] = quietly(() => createNewSr(unisonParams({ rhythmOnly: true }) as any)) as any;
    expect(score.staff).toBe("rhythm");
    await expectUnisonRoundTrip(score);
  });

  test("a link is short", async () => {
    const [, , score] = quietly(() => createNewSr(unisonParams() as any)) as any;
    const value = await packExercise({ kind: "unison", score });
    expect(value.length).toBeLessThan(600);
  });
});

// ── The link itself ─────────────────────────────────────────────────────────

describe("the link", () => {
  test("works uncompressed too, for a browser that cannot compress", async () => {
    const [, , score] = quietly(() => createNewSr(unisonParams() as any)) as any;
    const value = await packExercise({ kind: "unison", score }, { compress: false });
    expect(value[0]).toBe("0");
    const opened = await unpackExercise(value);
    expect(opened.ok).toBe(true);
  });

  test("lives in the fragment, among anything else there", () => {
    expect(exerciseParam(exerciseFragment("1abc_-"))).toBe("1abc_-");
    expect(exerciseParam("#a=1&ex=1xyz")).toBe("1xyz");
    expect(exerciseParam("")).toBeNull();
    expect(exerciseParam("#ex=")).toBeNull();
  });

  test("names the right page when opened on the wrong one", async () => {
    const [, , score] = quietly(() => createNewSr(unisonParams() as any)) as any;
    const value = await packExercise({ kind: "unison", score });
    expect(await unpackExercise(value, "choral")).toEqual({ ok: false, problem: "wrong-page", kind: "unison" });
  });
});

describe("a bad link is a problem to show, never an exception", () => {
  /** A payload as an uncompressed link, bypassing the packer's own encoding. */
  const packJson = (payload: unknown) => "0" + Buffer.from(JSON.stringify(payload)).toString("base64url");

  let good: any;
  const goodPayload = async () => {
    if (!good) {
      const result = quietly(() => runChoralJob({ kind: "exercise", params: choralParams("C", "4/4") }));
      good = toPayload({ kind: "choral", result });
    }
    return structuredClone(good);
  };

  test("garbage", async () => {
    for (const value of ["", "1", "1@@@", "2abc", "0" + "A".repeat(5), "1" + Buffer.from("not deflate").toString("base64url")]) {
      const opened = await unpackExercise(value);
      expect(opened.ok).toBe(false);
    }
  });

  test("a truncated link", async () => {
    const result = quietly(() => runChoralJob({ kind: "exercise", params: choralParams("C", "4/4") }));
    const value = await packExercise({ kind: "choral", result });
    const opened = await unpackExercise(value.slice(0, -10));
    expect(opened).toEqual({ ok: false, problem: "corrupt" });
  });

  test("oversize", async () => {
    expect(await unpackExercise("0" + "A".repeat(40_000))).toEqual({ ok: false, problem: "corrupt" });
  });

  test("from a newer version", async () => {
    const payload = await goodPayload();
    payload.v = 99;
    expect(fromPayload(payload)).toEqual({ ok: false, problem: "too-new" });
  });

  test("with something that would break out of the ABC", async () => {
    const cases: ((p: any) => void)[] = [
      (p) => (p.x.p[0][2] = 'treble\nX:2'),
      (p) => (p.x.p[0][0] = 'Sop"rano'),
      (p) => (p.x.k = "H"),
      (p) => (p.x.t = "Title\nK:C"),
      (p) => (p.x.n[0][0] = [26, 8, 0, 0, 0, '"^oops']),
      (p) => (p.x.n[0][0] = [26, 8, 0, 0, 0, 0, "^F\n"]),
    ];
    for (const breakIt of cases) {
      const payload = await goodPayload();
      breakIt(payload);
      expect(fromPayload(payload)).toEqual({ ok: false, problem: "invalid" });
      expect((await unpackExercise(packJson(payload))).ok).toBe(false);
    }
  });

  test("with notes that do not add up", async () => {
    const cases: ((p: any) => void)[] = [
      (p) => (p.x.n[0][0][1] = Number.NaN),
      (p) => (p.x.n[0][0][1] = 7.5),
      (p) => p.x.n[1].pop(), // voices of different lengths
      (p) => (p.x.n = p.x.n.slice(1)), // fewer voices than parts
      (p) => (p.x.n[0][0][0] = 999),
    ];
    for (const breakIt of cases) {
      const payload = await goodPayload();
      breakIt(payload);
      expect(fromPayload(payload).ok).toBe(false);
    }
  });

  test("with the wrong shape altogether", () => {
    for (const payload of [null, 1, "x", [], {}, { v: 1 }, { v: 1, t: "c" }, { v: 1, t: "c", s: [{ r: 0 }] }, { v: 1, t: "u" }]) {
      expect(fromPayload(payload).ok).toBe(false);
    }
  });
});
