# Compound Meter (6/8, 9/8, 12/8) in Unison Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teachers can generate Unison and rhythm-only sight reading in 6/8, 9/8 and 12/8, felt and counted in dotted-quarter beats, with a compound rhythm vocabulary, compound syllables, a dotted-quarter tempo and click - while every simple-meter exercise (Unison and Choral) comes out byte for byte as before.

**Architecture:** One meter model (`src/lib/meter.ts`, derived from the metronome's table in `src/lib/tuner/meters.ts`) replaces the copied meter tables, the literal `8` beats and the numerator-as-beats parsing. Compound meter gets its own beat-by-beat rhythm fill (`src/lib/compound-rhythm.ts`) that `generateRandomRhythm` branches to before touching any simple-meter code, plus a matching branch in the feasibility solver. The Unison writer, the syllable resolver, the tempo marks and the Unison page read beats and subdivision from the model. A fixed-seed snapshot of simple-meter output, committed first, guards every later task.

**Tech Stack:** Astro 4 + Svelte 4 + TypeScript, abcjs 6, bun (test runner, scripts), LilyPond 2.26 (rhythm icons).

**Spec:** `docs/superpowers/specs/2026-10-01-compound-meter-unison-design.md`

## Global Constraints

- bun only: `bun run test` (never bare `bun test` for the suite - it needs `--timeout 30000`), `bunx astro check`, `bun run check:rhythm`, `bun run sweep`. Do not run `npm install`.
- Baseline on this machine before Task 3: `bun run test` reports **928 pass, 5 skip, 1 fail, 1 error** - the fail/error is `tests/unit/exercise-link.test.ts`, which bun 1.3.0 cannot parse because of raw control characters in a regex at `src/lib/exercise-link.ts:373`. That is expected; do not chase it before Task 3, which fixes it. From Task 3 on, expect **0 fail**.
- `bunx astro check` must report **0 errors and 0 warnings** after every task.
- Units are 32nds (`L:1/32`) everywhere. A quarter is 8, a dotted quarter 12, a dotted half 24.
- **Simple-meter output must not change.** `tests/unit/meter-regression.test.ts` (Task 1) must pass unchanged after every task. Never run it with `--update-snapshots` after Task 1. If it fails, your change altered simple meter: fix the code, not the snapshot. Compound code must not call `Math.random` on any simple-meter path (that alone shifts every later draw).
- "3/4 and 6/8 share `tsPerMeasure` 24: nothing may tell meters apart by bar length. Always go through the model." (spec section 1)
- "The two vocabularies never mix: the generator and picker only use figures of the selected meter's kind." (spec section 2)
- Choral: "compound meters are absent from the Choral meter picker, so Choral generation never receives one. No compound logic in Choral code this round." UIL presets unchanged - simple meter only.
- Compound vocabulary is exactly the spec table (Core, Rests, Sixteenths). "No siciliano (dotted eighth-sixteenth-eighth) yet."
- BPM in compound counts dotted quarters; "click once per dotted-quarter beat, downbeat accented: 2 per bar in 6/8, 3 in 9/8, 4 in 12/8."
- Randomised generators: loop any new generator test 20 times before trusting it: `for i in $(seq 20); do bun test --timeout 30000 <file> >/dev/null || { echo "failed on run $i"; break; }; done`.
- Another agent is editing `src/components/PlaybackBar.svelte`, `src/lib/voice-texture.ts`, `src/components/AbcjsChoral.svelte`, `src/components/AbcjsSingle.svelte` (and has an uncommitted comment change in `src/lib/form-plan.ts`). Before editing any file, run `git diff --stat -- <file>`. If it shows changes you did not make, do not edit or stage it: stop and report. (`git add -p` is unavailable - interactive flags are not supported.)
- Untracked files (`scripts/test-bach-sr.ts`, `scripts/detect-parallels.ts`, `scripts/analyze-bach-*.ts`, `src/lib/bach-sr/`, `src/pages/bach-sightreading.astro`) are someone else's work in progress: never edit or stage them.
- Commits: stage explicit paths only (never `git add -A` / `git add .`). Message style is the repo's: a type and a plain sentence, e.g. `feat: 6/8, 9/8 and 12/8 rhythms fill beat by beat`. **No `Co-Authored-By` or any other trailer** - Blaine is the sole author. Do not commit this plan or the spec.
- UI: colours only through `sr-*` tokens (never Tailwind's palette); "practice", not "practise".

## Review Focus

1. **A preset, link or old localStorage naming the other kind's rhythms** (`?timeSignature=6/8&rhythms=quarter,half`) - expect the page to fall back to that meter's defaults (Core in compound), never an empty selection or a refused Generate. Test: Task 11, `resolveRhythmSelection` cross-kind cases.
2. **Playback tempo in compound** - at ♩. = 60 a 6/8 bar must last 2 s. abcjs's `qpm` already counts the meter's own beat (verified: `millisecondsPerMeasure(60)` is 2000 for 6/8), so the spec's `qpm = bpm * 1.5` would play 1.5x too fast; this plan passes the BPM unchanged. Test: Task 10, the abcjs tempo pin.
3. **MIDI export of a compound Unison exercise** - Unison ABC has no `Q:` line, and abcjs's MIDI writer ignores the `qpm` option for */8 meters, so the file came out at 180 per quarter. Expect a dotted quarter at the page's BPM. Test: Task 9, `midiFileFor` 6/8 tempo.
4. **Odd-beat bars with only two-beat figures** (9/8, dotted halves only, 1 bar, or no ties) - expect a clean "can't fill" refusal with the ties hint, never a hang or a malformed bar; and with ties on over 4 bars, success. Tests: Task 6 (`compound-rhythm.test.ts` opt-out and refusal), Task 7 (Unison 1-bar refusal).
5. **A teacher's own syllables saved before compound existed** (no `compoundSlots`) used on a 6/8 exercise - expect Counting (1 la li), not an error or Kodály; and a half-filled compound row refused with a clear message. Test: Task 8.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/lib/meter.ts` | create | The meter model: table, lookups, `resolveMeter`, `timeSignatureFor`, `tempoField`, `beatSymbolOf` |
| `src/lib/compound-rhythm.ts` | create | Compound rhythm fill: beat-by-beat exact search, phrase cadences |
| `src/lib/types.ts` | modify | `TimeSignature.beatUnits` (was `beamGroupSize`); `Rhythm.meterKind`, `Rhythm.pickerGroup` |
| `src/resources/rhythms.ts` | modify | Rest data fixes, `meterKind` on every figure, the 12 new compound figures |
| `src/lib/selectable-rhythms.ts` | modify | Simple vs compound selectable sets, picker groups, per-kind selection memory |
| `src/lib/rhythm-generation.ts` | modify | Beat from the model; compound branch; simple path ignores compound figures |
| `src/lib/rhythm-feasibility.ts` | modify | `beatUnits` parameter; compound branch |
| `src/lib/generateUnison.ts` | modify | Writer: beats from model, compound beaming and beat splits; syllables by subdivision |
| `src/resources/rhythm-syllables.ts` | modify | `compoundSlots` for systems, custom sets and templates |
| `src/lib/abc-assembly.ts`, `src/lib/exports.ts`, `src/lib/abc-score-file.ts`, `src/lib/musicxml.ts` | modify | Meter-aware tempo marks; quarter-never-beams rule |
| `src/lib/count-in.ts`, `src/lib/form-plan.ts` | modify | Beats from the model |
| `src/lib/exercise-link.ts` | modify | `beatUnits`; control-character regex escaped |
| `src/lib/rhythm-labels.ts` | modify | "six"; `Compound` suffix |
| `src/components/AbcjsSingle.svelte` | modify | Meter picker (Simple/Compound), rhythm picker per kind, beats, tempo label |
| `src/components/AbcjsChoral.svelte`, `src/components/AbcjsBachSR.svelte` | modify | Meter table and drum beats from the model (simple only) |
| `src/components/PlaybackBar.svelte` | modify | Optional `beatSymbol` tempo label |
| `src/components/SyllableEditor.svelte` | modify | Six compound inputs, compound preview |
| `scripts/render-rhythm-icons.mjs`, `src/assets/svgs/*.svg` | modify/create | 12 compound icons |
| `scripts/check-rhythm.ts`, `scripts/sweep.ts`, `scripts/generation-fixtures.ts`, `scripts/test-generation.ts`, `scripts/test-step-constraints.ts` | modify | Meter tables from the model; compound coverage |
| `src/pages/how-to-use.astro`, `notes/uil-criteria.md`, `docs/ROADMAP.md`, `src/lib/uil-presets.ts`, `tests/unit/uil-presets.test.ts`, `CLAUDE.md` | modify | Docs |

`src/lib/voice-texture.ts:246` (named in the spec) is deliberately left alone: its `[16, 8, 4, 2, 1]` are rest *notation* values for Choral, which only ever sees simple meter, and the file is being edited by another agent. `src/lib/playback-click.ts:16` (`barClicks`) already takes `beats` from its caller; the numerator parse it was blamed for lives in `AbcjsChoral.svelte`'s `drumFor`, fixed in Task 4.

---

### Task 1: Freeze simple-meter output for fixed seeds

**Files:**
- Create: `tests/unit/meter-regression.test.ts`
- Create (generated): `tests/unit/__snapshots__/meter-regression.test.ts.snap`

**Interfaces:**
- Consumes: `generateChoralExercise` (`src/lib/generateChoral.ts`), `createNewSr` (`src/lib/generateUnison.ts`), `TIME_SIGS`, `choralSelectable`, `presetVoicing` (`scripts/generation-fixtures.ts`), `canFillExercise` (`src/lib/rhythm-feasibility.ts`, 4 arguments today).
- Produces: the regression guard every later task must keep green, unchanged.

- [ ] **Step 1: Write the snapshot test**

```ts
import { describe, expect, test } from "bun:test";
import { generateChoralExercise } from "../../src/lib/generateChoral";
import { createNewSr } from "../../src/lib/generateUnison";
import { canFillExercise } from "../../src/lib/rhythm-feasibility";
import { uilPresets } from "../../src/lib/uil-presets";
import { chords as fullChordSet } from "../../src/resources/chords";
import { rhythms as allRhythms } from "../../src/resources/rhythms";
import { TIME_SIGS, choralSelectable, presetVoicing } from "../../scripts/generation-fixtures";

/**
 * Simple-meter output, frozen for fixed seeds.
 *
 * Compound meter arrives by moving every meter onto one model and adding a
 * branch for 6/8, 9/8 and 12/8. None of that may change a single byte of a 2/4,
 * 3/4 or 4/4 exercise, Unison or Choral. With Math.random seeded, both
 * generators are deterministic, so the ABC they write is the contract.
 *
 * NEVER update this snapshot to make it pass. A failure means a change reached
 * simple meter - including a compound branch that draws a random number before
 * it knows the meter is compound, which shifts every later draw.
 */

/** Runs fn with a seeded Math.random and a quiet console. A throw is recorded, not raised: it is deterministic too. */
function seeded(seed: number, fn: () => string): string {
  const real = Math.random;
  const { log, warn, error } = console;
  let s = seed;
  Math.random = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  Object.assign(console, { log: () => {}, warn: () => {}, error: () => {} });
  try {
    return fn();
  } catch (e) {
    return `ERROR: ${e instanceof Error ? e.message : String(e)}`;
  } finally {
    Math.random = real;
    Object.assign(console, { log, warn, error });
  }
}

const SIMPLE_METERS = ["2/4", "3/4", "4/4"] as const;

describe("Choral in simple meter, fixed seeds", () => {
  for (const level of ["UIL 1", "UIL 3", "UIL 5"]) {
    const preset = (uilPresets as any)[level];
    const voicing = preset.allowedVoicings[0];
    const key = preset.allowedKeys[0];
    for (const meter of SIMPLE_METERS) {
      const timeSig = TIME_SIGS[meter];
      const usable = allRhythms.filter(
        (r) =>
          preset.allowedRhythmNames.includes(r.name) &&
          choralSelectable(r) &&
          !r.rest &&
          r.totalValue <= timeSig.tsPerMeasure
      );
      if (!usable.length || !canFillExercise(usable, timeSig.tsPerMeasure, 8 * timeSig.tsPerMeasure, false)) continue;
      for (const seed of [11, 4242]) {
        test(`${level} | ${voicing} | ${key} | ${meter} | seed ${seed}`, () => {
          const abc = seeded(seed, () =>
            generateChoralExercise({
              key,
              timeSig,
              partsObject: presetVoicing(voicing, preset),
              measures: 8,
              maxSkip: preset.maxSkip,
              bpm: 72,
              selectedRhythms: usable,
              chords: fullChordSet,
              accidentalsByStep: true,
              nctProbability: 0.25,
              chromaticFrequency: 1,
              allowedChordNames: preset.allowedChordNames,
              voiceTexture: "full",
              stepwiseEighths: true,
            } as any).abcString
          );
          expect(abc).toMatchSnapshot();
        }, 60000);
      }
    }
  }
});

const UNISON_RHYTHMS = [
  "quarter", "half", "dotHalf", "whole", "eighthEighth", "dotQuarterEighth",
  "eighthQuarterEighth", "fourSixteenths", "quarterRest", "eighthRestEighth",
];

describe("Unison in simple meter, fixed seeds", () => {
  for (const meter of SIMPLE_METERS) {
    const timeSig = TIME_SIGS[meter];
    const names = UNISON_RHYTHMS.filter(
      (n) => allRhythms.find((r) => r.name === n)!.totalValue <= timeSig.tsPerMeasure
    );
    for (const rhythmOnly of [false, true]) {
      for (const ties of [false, true]) {
        const syllableSystemId = ties ? "counting" : "kodaly";
        test(`${meter} | ${rhythmOnly ? "rhythm" : "pitched"} | ties ${ties} | ${syllableSystemId}`, () => {
          const abc = seeded(ties ? 99 : 7, () =>
            createNewSr({
              bpm: 60,
              tempo: 60,
              clef: "treble",
              selectedClef: "treble",
              key: "F",
              timeSig,
              selectedTimeSignature: meter,
              measures: 8,
              maxSkip: 4,
              range: { min: 14, max: 21 },
              scaleDegrees: [1, 2, 3, 4, 5, 6, 7],
              selectedSharpDegrees: [],
              selectedFlatDegrees: [],
              rhythms: allRhythms.filter((r) => names.includes(r.name)),
              selectedRhythms: names,
              rhythmOnly,
              showSolfege: !rhythmOnly,
              lyricSystem: "movable",
              showRhythmSyllables: true,
              syllableSystemId,
              allowTiesAcrossBarline: ties,
              moveOnEighthNotes: !ties,
              accidentalsFollowStep: false,
              partsObject: { numofParts: 1, parts: { Unison: { order: 0, smallName: "U" } } },
            } as any)[0]
          );
          expect(abc).toMatchSnapshot();
        }, 60000);
      }
    }
  }
});
```

- [ ] **Step 2: Run it to write the snapshot**

Run: `bun test --timeout 30000 tests/unit/meter-regression.test.ts`
Expected: every test passes and bun reports snapshots written; `tests/unit/__snapshots__/meter-regression.test.ts.snap` now exists.

- [ ] **Step 3: Check the snapshot is real music and deterministic**

Run: `grep -c "ERROR:" tests/unit/__snapshots__/meter-regression.test.ts.snap; grep -c "^X:1" tests/unit/__snapshots__/meter-regression.test.ts.snap`
Expected: `0` errors (if any case recorded `ERROR:`, change that case's seed and delete the .snap, then repeat Step 2), and one `X:1` per test.

Run: `for i in 1 2 3; do bun test --timeout 30000 tests/unit/meter-regression.test.ts 2>&1 | tail -3; done; git status --short tests/unit/__snapshots__`
Expected: all three runs pass with nothing written; the .snap is the only new file.

- [ ] **Step 4: Commit**

```bash
git add tests/unit/meter-regression.test.ts tests/unit/__snapshots__/meter-regression.test.ts.snap
git commit -m "test: simple-meter Unison and Choral output frozen for fixed seeds"
```

---

### Task 2: The meter model

**Files:**
- Create: `src/lib/meter.ts`
- Test: `tests/unit/meter.test.ts`

**Interfaces:**
- Consumes: `METERS`, `BeatNote` from `src/lib/tuner/meters.ts` (unchanged).
- Produces (later tasks rely on these exact names):
  - `type MeterKind = "simple" | "compound"`
  - `interface ExerciseMeter { name: string; beatUnits: number; beatsPerMeasure: number; subdivision: 2 | 3; tsPerMeasure: number; kind: MeterKind }`
  - `interface ExerciseTimeSignature { name: string; tsPerMeasure: number; beatUnits: number }`
  - `type MeterRef = string | { name: string; tsPerMeasure?: number; beatUnits?: number; beamGroupSize?: number }`
  - `EXERCISE_METER_NAMES` (`["2/4","3/4","4/4","6/8","9/8","12/8"]`), `EXERCISE_METERS: ExerciseMeter[]`, `SIMPLE_METER_NAMES: string[]`, `COMPOUND_METER_NAMES: string[]`
  - `meterByName(name: string): ExerciseMeter | undefined`
  - `resolveMeter(ref: MeterRef): ExerciseMeter` (never throws)
  - `beatsOf(ref: MeterRef): number`, `beatUnitOf(ref: MeterRef): number`, `isCompound(ref: MeterRef): boolean`, `meterKindOf(ref: MeterRef): MeterKind`
  - `timeSignatureFor(name: string): ExerciseTimeSignature` (throws for a non-exercise meter), `timeSignaturesFor(names: readonly string[]): Record<string, ExerciseTimeSignature>`
  - `tempoField(ref: MeterRef, bpm: number): string` (`"Q:3/8=60"` / `"Q:1/4=72"`), `beatSymbolOf(ref: MeterRef): "♩." | "♩"`

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test --timeout 30000 tests/unit/meter.test.ts`
Expected: FAIL - `Cannot find module '../../src/lib/meter'`.

- [ ] **Step 3: Write the model**

`src/lib/meter.ts`:

```ts
/**
 * The meters an exercise can be written in, and what a beat is in each - the
 * one source of truth for meter. Units are 32nds (L:1/32), as everywhere else.
 *
 * Grown out of the metronome's table (tuner/meters.ts), which already counted
 * 6/8, 9/8 and 12/8 in dotted-quarter beats: one model, not two. A meter is
 * counted in beats, not by its top number - 6/8 is two beats of three eighths,
 * 12/8 four - and 3/4 and 6/8 are both 24 units a bar, so nothing may tell
 * meters apart by bar length. Ask this module.
 */
import { METERS, type BeatNote } from "./tuner/meters";

export type MeterKind = "simple" | "compound";

export interface ExerciseMeter {
  name: string;
  /** One beat, in 32nds: 8 (quarter) in simple meter, 12 (dotted quarter) in compound. */
  beatUnits: number;
  beatsPerMeasure: number;
  /** Eighths to a beat: 2 in simple meter, 3 in compound. */
  subdivision: 2 | 3;
  tsPerMeasure: number;
  kind: MeterKind;
}

/** What the generators are handed: the shape of `TimeSignature` in types.ts. */
export interface ExerciseTimeSignature {
  name: string;
  tsPerMeasure: number;
  beatUnits: number;
}

/**
 * A meter by name, or a time signature object. Objects from before the beat
 * was stored as `beatUnits` carried `beamGroupSize`; both are still read when
 * the name is not one this model knows.
 */
export type MeterRef =
  | string
  | { name: string; tsPerMeasure?: number; beatUnits?: number; beamGroupSize?: number };

const BEAT_UNITS: Record<BeatNote, number> = { half: 16, quarter: 8, dottedQuarter: 12, eighth: 4 };

function fromMetronomeMeter(name: string): ExerciseMeter | undefined {
  const m = METERS.find((x) => x.id === name);
  if (!m) return undefined;
  const beatUnits = BEAT_UNITS[m.beatNote];
  const compound = m.kind === "compound";
  return {
    name: m.id,
    beatUnits,
    beatsPerMeasure: m.beats,
    subdivision: compound ? 3 : 2,
    tsPerMeasure: m.beats * beatUnits,
    kind: compound ? "compound" : "simple",
  };
}

/** The meters an exercise is offered in, in picker order: simple, then compound. */
export const EXERCISE_METER_NAMES = ["2/4", "3/4", "4/4", "6/8", "9/8", "12/8"] as const;

export const EXERCISE_METERS: ExerciseMeter[] = EXERCISE_METER_NAMES.map((name) => {
  const m = fromMetronomeMeter(name);
  if (!m) throw new Error(`The metronome has no ${name}.`);
  return m;
});

export const SIMPLE_METER_NAMES: string[] = EXERCISE_METERS.filter((m) => m.kind === "simple").map((m) => m.name);
export const COMPOUND_METER_NAMES: string[] = EXERCISE_METERS.filter((m) => m.kind === "compound").map((m) => m.name);

export function meterByName(name: string): ExerciseMeter | undefined {
  return EXERCISE_METERS.find((m) => m.name === name);
}

/**
 * Any meter, as the model reads it. Exercise meters come from the table; the
 * metronome's others (5/4, 7/8...) from its table; anything else from the
 * object's own fields, then the meter's numbers, then 4/4. Never throws: a
 * count-in or a click must still work on a score from somewhere else.
 */
export function resolveMeter(ref: MeterRef): ExerciseMeter {
  const name = typeof ref === "string" ? ref : ref.name;
  const known = meterByName(name) ?? fromMetronomeMeter(name);
  if (known) return known;
  const obj = typeof ref === "string" ? undefined : ref;
  const [top, bottom] = name.split("/").map((n) => parseInt(n, 10));
  const unitOfBottom = bottom > 0 ? 32 / bottom : 8;
  const beatUnits = obj?.beatUnits ?? obj?.beamGroupSize ?? unitOfBottom;
  const tsPerMeasure = obj?.tsPerMeasure ?? (top > 0 ? top * unitOfBottom : 4 * beatUnits);
  const compound = beatUnits === 12;
  return {
    name,
    beatUnits,
    beatsPerMeasure: Math.max(1, Math.round(tsPerMeasure / beatUnits)),
    subdivision: compound ? 3 : 2,
    tsPerMeasure,
    kind: compound ? "compound" : "simple",
  };
}

export const beatsOf = (ref: MeterRef): number => resolveMeter(ref).beatsPerMeasure;
export const beatUnitOf = (ref: MeterRef): number => resolveMeter(ref).beatUnits;
export const isCompound = (ref: MeterRef): boolean => resolveMeter(ref).kind === "compound";
export const meterKindOf = (ref: MeterRef): MeterKind => resolveMeter(ref).kind;

export function timeSignatureFor(name: string): ExerciseTimeSignature {
  const m = meterByName(name);
  if (!m) throw new Error(`"${name}" is not a meter exercises are written in.`);
  return { name: m.name, tsPerMeasure: m.tsPerMeasure, beatUnits: m.beatUnits };
}

/** A picker's table, in the order the names are given. */
export function timeSignaturesFor(names: readonly string[]): Record<string, ExerciseTimeSignature> {
  return Object.fromEntries(names.map((n) => [n, timeSignatureFor(n)]));
}

/**
 * The ABC tempo field. Compound meter counts dotted quarters, Q:3/8=60, which
 * is how abcjs and every other reader takes "60" to mean the beat. The bpm is
 * written as given - callers round where they need to.
 */
export function tempoField(ref: MeterRef, bpm: number): string {
  return `Q:${isCompound(ref) ? "3/8" : "1/4"}=${bpm}`;
}

/** The note the tempo counts: ♩. in compound meter, ♩ in simple. */
export const beatSymbolOf = (ref: MeterRef): "♩." | "♩" => (isCompound(ref) ? "♩." : "♩");
```

- [ ] **Step 4: Run tests**

Run: `bun test --timeout 30000 tests/unit/meter.test.ts tests/unit/metronome-meters.test.ts tests/unit/meter-regression.test.ts`
Expected: PASS, snapshot unchanged.

Run: `bunx astro check 2>&1 | tail -3`
Expected: `0 errors`, `0 warnings`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/meter.ts tests/unit/meter.test.ts
git commit -m "feat: one meter model, simple and compound, grown from the metronome's"
```

---

### Task 3: A time signature carries its beat, and the copied tables go

**Files:**
- Modify: `src/lib/exercise-link.ts:373` (control-character regex), `:260-262`, `:293`, `:420-422`, `:503-511` (by rename)
- Modify: `src/lib/types.ts:127-135` (`TimeSignature`)
- Modify: `src/lib/abc-assembly.ts:137`
- Modify: `src/lib/generateUnison.ts:1821`, `:1904-1916`, `:1971-1984`, `:2009-2014`
- Modify: `src/components/AbcjsSingle.svelte:104-108`, `src/components/AbcjsChoral.svelte:204-208`, `src/components/AbcjsBachSR.svelte:117-121`
- Modify: `scripts/check-rhythm.ts:28-34`, `scripts/generation-fixtures.ts:8-12`, `scripts/test-generation.ts:70-73`, `scripts/test-step-constraints.ts:65-68`, `scripts/analysis/*.ts` (rename only)
- Modify (rename only): every tracked test under `tests/unit/` that writes `beamGroupSize`
- Test: `tests/unit/exercise-link.test.ts`

**Interfaces:**
- Consumes: `beatUnitOf`, `timeSignatureFor`, `timeSignaturesFor`, `ExerciseTimeSignature` (Task 2).
- Produces: `TimeSignature = { name: string; tsPerMeasure: number; beatUnits: number }` in `src/lib/types.ts`; `UnisonScore.timeSig: { name: string; tsPerMeasure: number; beatUnits?: number }`. Exercise links keep the wire shape `m: [name, tsPerMeasure, beatUnits?]` (the third slot used to be called `beamGroupSize`; old links decode unchanged).

- [ ] **Step 1: Make `exercise-link.ts` parseable by bun 1.3**

Line 373 holds a regex with a raw NUL and a raw 0x1F byte. Replace them with escapes (same characters, same meaning):

```bash
perl -pi -e 's/\\\\\x00-\x1f\]/\\\\\\x00-\\x1f]/' src/lib/exercise-link.ts
sed -n 373p src/lib/exercise-link.ts
```

Expected line:

```ts
  check(typeof raw === "string" && raw.length >= 1 && raw.length <= 16 && !/["%\\\x00-\x1f]/.test(raw));
```

Run: `bun test --timeout 30000 tests/unit/exercise-link.test.ts`
Expected: PASS (it could not even load before).

- [ ] **Step 2: Write the failing link test**

Append to `tests/unit/exercise-link.test.ts`:

```ts
describe("the meter in a unison link", () => {
  const opened = (m: unknown[]) => {
    const result = fromPayload({ v: 1, t: "u", st: "r", m, pt: [["Unison", "U", [["B", 8], ["B", 16]]]] });
    if (!result.ok || result.exercise.kind !== "unison") throw new Error("did not open");
    return result.exercise.score.timeSig;
  };

  test("reads back with its beat", () => {
    expect(opened(["3/4", 24, 8])).toEqual({ name: "3/4", tsPerMeasure: 24, beatUnits: 8 });
  });

  test("compound meters carry the dotted-quarter beat", () => {
    expect(opened(["6/8", 24, 12])).toEqual({ name: "6/8", tsPerMeasure: 24, beatUnits: 12 });
    expect(opened(["12/8", 48, 12])).toEqual({ name: "12/8", tsPerMeasure: 48, beatUnits: 12 });
  });

  test("a link from before the beat was stored still opens", () => {
    expect(opened(["4/4", 32])).toEqual({ name: "4/4", tsPerMeasure: 32 });
  });
});
```

Run: `bun test --timeout 30000 tests/unit/exercise-link.test.ts -t "the meter in a unison link"`
Expected: FAIL - the decoded objects have `beamGroupSize`, not `beatUnits`.

- [ ] **Step 3: Rename the field everywhere it is tracked**

```bash
git ls-files src scripts tests | xargs grep -l "beamGroupSize" \
  | grep -v -e '^src/lib/meter.ts$' -e '^tests/unit/meter.test.ts$' \
  | xargs sed -i '' 's/beamGroupSize/beatUnits/g'
git ls-files src scripts tests | xargs grep -n "beamGroupSize"
```

Expected: the second command prints only lines in `src/lib/meter.ts` and `tests/unit/meter.test.ts` (the legacy field `resolveMeter` still accepts). Untracked files are untouched by design.

- [ ] **Step 4: Reword the type**

In `src/lib/types.ts`, the interface now reads (rewrite its doc comment):

```ts
// A time signature, as the generators are handed it. Build one with
// timeSignatureFor (src/lib/meter.ts) rather than writing it out.
export interface TimeSignature {
  name: string; // e.g., "4/4", "3/4", "6/8"
  tsPerMeasure: number; // Number of base units (e.g., 32nd notes if L:1/32) per measure
  /** One beat in 32nd-note units: 8 (quarter) in simple time, 12 (dotted
   *  quarter) in compound. Beams group by it. Was `beamGroupSize`. */
  beatUnits: number;
}
```

- [ ] **Step 5: Read the beat through the model in the writers**

`src/lib/abc-assembly.ts` - add `import { beatUnitOf } from "./meter";` and change line 137:

```ts
  const beamUnit = beatUnitOf(timeSig);
```

`src/lib/generateUnison.ts` - add `import { beatUnitOf } from "./meter";` to the imports. In `createConcatString`, the `timeSig` parameter type becomes:

```ts
    timeSig: { name: string; tsPerMeasure: number; beatUnits?: number };
```

and directly after `var concatString = "";` add:

```ts
  /** One beat in 32nds, from the meter model: beams and syllables follow it. */
  const beatUnits = beatUnitOf(params.timeSig);
```

Replace both remaining `params.timeSig.beatUnits ?? 8` (the `rhythmSyllableFor` argument and the `const beatUnits = ...` inside the note loop) with the outer `beatUnits`: delete the inner `const beatUnits = params.timeSig.beatUnits ?? 8;` line (it shadowed the old name) and change `tsCount % beatUnits === 0` to use the outer constant. Fix the comment above that test so it says "beatUnits drives this".

- [ ] **Step 6: Replace the copied meter tables with the model**

`src/components/AbcjsSingle.svelte` - add `import { timeSignaturesFor } from "../lib/meter";` beside the other `../lib` imports, and replace the literal at lines 104-108:

```ts
  // Simple meter only until the compound vocabulary lands (the meter picker
  // shows these keys, in this order).
  const timeSignatures = timeSignaturesFor(["4/4", "3/4", "2/4"]);
```

`src/components/AbcjsChoral.svelte` - add `import { timeSignaturesFor } from "../lib/meter";` and replace lines 204-208:

```ts
  /** Choral is simple meter only: compound meter is Unison's for now. */
  let timeSignatures: Record<string, TimeSignature> = timeSignaturesFor(["4/4", "3/4", "2/4"]);
```

`src/components/AbcjsBachSR.svelte` - same import, and replace lines 117-121:

```ts
  let timeSignatures: Record<string, TimeSignature> = timeSignaturesFor(["4/4", "3/4", "2/4"]);
```

`scripts/check-rhythm.ts` - replace lines 28-34:

```ts
import { timeSignaturesFor, type ExerciseTimeSignature } from "../src/lib/meter";

const TIME_SIGS = timeSignaturesFor(["4/4", "3/4", "2/4"]);

type TimeSig = ExerciseTimeSignature;
```

(move the `import` up with the others.)

`scripts/generation-fixtures.ts` - replace lines 8-12:

```ts
import { timeSignaturesFor } from "../src/lib/meter";

/** Simple meters: the sweep's Choral cells and the ladder. Compound is Unison's - see COMPOUND_TIME_SIGS in sweep.ts. */
export const TIME_SIGS: Record<string, any> = timeSignaturesFor(["4/4", "3/4", "2/4"]);
```

`scripts/test-generation.ts` and `scripts/test-step-constraints.ts` - add `import { timeSignatureFor } from "../src/lib/meter";` and replace each two-entry array:

```ts
const timeSignatures: TimeSignature[] = ["4/4", "3/4"].map(timeSignatureFor);
```

- [ ] **Step 7: Run everything**

Run: `bun test --timeout 30000 tests/unit/exercise-link.test.ts tests/unit/meter-regression.test.ts`
Expected: PASS; the regression snapshot is byte-identical (no snapshot written).

Run: `bun run test 2>&1 | tail -6`
Expected: `0 fail` (the exercise-link parse error is gone).

Run: `bunx astro check 2>&1 | tail -3`
Expected: `0 errors`, `0 warnings`.

Run: `bun run check:rhythm 2>&1 | tail -3`
Expected: `all checks passed`.

- [ ] **Step 8: Commit**

```bash
git add src/lib/exercise-link.ts src/lib/types.ts src/lib/abc-assembly.ts src/lib/generateUnison.ts \
  src/components/AbcjsSingle.svelte src/components/AbcjsChoral.svelte src/components/AbcjsBachSR.svelte \
  scripts/check-rhythm.ts scripts/generation-fixtures.ts scripts/test-generation.ts scripts/test-step-constraints.ts \
  $(git ls-files scripts/analysis tests/unit | xargs grep -l "beatUnits")
git commit -m "refactor: a time signature carries its beat, and every meter table comes from the model"
```

---

### Task 4: Beats come from the model

**Files:**
- Modify: `src/lib/count-in.ts:14`
- Modify: `src/lib/form-plan.ts:112-119`
- Modify: `src/lib/rhythm-generation.ts:188`, `:478-487`
- Modify: `src/lib/rhythm-feasibility.ts:18-45`
- Modify: `src/components/AbcjsSingle.svelte:1559`
- Modify: `src/components/AbcjsChoral.svelte:680-686` (`drumFor`)
- Test: `tests/unit/count-in.test.ts`, `tests/unit/form-plan.test.ts`

**Interfaces:**
- Consumes: `beatsOf`, `beatUnitOf`, `meterByName` (Task 2).
- Produces: `canFillExercise(rhythms: Rhythm[], tsPerMeasure: number, totalUnits: number, allowTies: boolean, beatUnits = 8): boolean` - the fifth parameter is new; existing 3- and 4-argument callers keep working.

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/count-in.test.ts`:

```ts
describe("compound meter counts dotted-quarter beats", () => {
  test("6/8 is two beats, so it is counted in over two bars like 2/4", () => {
    expect(countInMeasures("6/8")).toBe(2);
    expect(countInWords("6/8")).toEqual(["1", "2", "Ready", "Go"]);
  });

  test("9/8 is three beats and 12/8 four, one bar each", () => {
    expect(countInWords("9/8")).toEqual(["1", "Ready", "Go"]);
    expect(countInMeasures("12/8")).toBe(1);
    expect(countInWords("12/8")).toEqual(["1", "2", "Ready", "Go"]);
  });
});
```

Append to `tests/unit/form-plan.test.ts` (it already imports from `../../src/lib/form-plan`; add `requiredMeasures` to that import if it is not there):

```ts
test("12/8 is four beats a bar, so a level wants as many bars as in 4/4", () => {
  // Read by its top number it was twelve beats, a third of the bars.
  expect(requiredMeasures(3, "12/8")).toEqual(requiredMeasures(3, "4/4"));
});
```

Run: `bun test --timeout 30000 tests/unit/count-in.test.ts tests/unit/form-plan.test.ts`
Expected: FAIL - 6/8 counts six words in one bar; 12/8 asks for a third of the bars.

- [ ] **Step 2: Count-in and form plan read the model**

`src/lib/count-in.ts` - add `import { beatsOf } from "./meter";` and replace line 14:

```ts
/** Beats in a bar, from the meter model: 6/8 is two dotted-quarter beats, not six. */
const beatsPerBar = (meter: string) => beatsOf(meter);
```

`src/lib/form-plan.ts` - add `import { meterByName } from "./meter";` and make `beatsPerMeasure` consult it first:

```ts
/** Beats in a bar, from the meter model; any other meter by its top number. */
function beatsPerMeasure(meter: string): number {
  const known = meterByName(meter);
  if (known) return known.beatsPerMeasure;
  const top = parseInt(meter.split("/")[0], 10);
  if (!Number.isFinite(top) || top <= 0) {
    throw new Error(`Unrecognised meter "${meter}".`);
  }
  return top;
}
```

- [ ] **Step 3: The rhythm grid's beat comes from the model**

`src/lib/rhythm-generation.ts` - add `import { beatUnitOf } from "./meter";`. Line 188 becomes:

```ts
  const BEAT_UNIT = beatUnitOf(timeSig); // one beat in 32nds - a quarter in simple meter
```

and the placement rules at lines 478-487 become:

```ts
        // In L:1/32 a beat starts at every multiple of BEAT_UNIT; the "and"
        // falls half a beat in, the sixteenth off-beats a quarter and three
        // quarters in. Allow up to a dotted quarter on an "and", nothing a beat
        // long or longer on a sixteenth.
        if (timeSig.tsPerMeasure >= BEAT_UNIT) {
          const pos = currentMeasurePosition % BEAT_UNIT;
          if (pos === BEAT_UNIT / 4 || pos === (3 * BEAT_UNIT) / 4) {
            // 16th-note off-beats: block quarter-note or longer
            if (r.totalValue >= 8) return false;
          } else if (pos === BEAT_UNIT / 2) {
            // "and" of each beat: block half-note or longer (allow quarter/dotted-quarter)
            if (r.totalValue >= 16) return false;
          }
        }
```

`src/lib/rhythm-feasibility.ts` - the signature and the grid test become:

```ts
export function canFillExercise(
  rhythms: Rhythm[],
  tsPerMeasure: number,
  totalUnits: number,
  allowTies: boolean,
  /** One beat in 32nds, from the meter model (beatUnitOf): 8 in simple meter. */
  beatUnits = 8
): boolean {
```

```ts
    const p = (pos % tsPerMeasure) % beatUnits;
    if (tsPerMeasure >= beatUnits) {
      if ((p === beatUnits / 4 || p === (3 * beatUnits) / 4) && r.totalValue >= 8) return false;
      if (p === beatUnits / 2 && r.totalValue >= 16) return false;
    }
```

- [ ] **Step 4: The pages' beats come from the model**

`src/components/AbcjsSingle.svelte` - add `beatsOf` to the `../lib/meter` import, and replace line 1559:

```ts
    // From the meter model: 6/8 is two beats and 12/8 four. The first digit
    // read 12/8 as one beat a bar.
    const beatsPerMeasure = beatsOf(playedMeter());
```

`src/components/AbcjsChoral.svelte` - add `beatsOf` to the `../lib/meter` import, and in `drumFor`:

```ts
  const drumFor = (timeSignature: string) =>
    drumPatternFor({
      beats: beatsOf(timeSignature),
      subdivision: $tuner.subdivision,
      accent: $tuner.accent,
      sound: $tuner.clickSound,
    });
```

- [ ] **Step 5: Run tests**

Run: `bun test --timeout 30000 tests/unit/count-in.test.ts tests/unit/form-plan.test.ts tests/unit/rhythm-feasibility.test.ts tests/unit/meter-regression.test.ts`
Expected: PASS; regression snapshot unchanged.

Run: `bun run test 2>&1 | tail -6 && bunx astro check 2>&1 | tail -3 && bun run check:rhythm 2>&1 | tail -1`
Expected: `0 fail`; `0 errors`, `0 warnings`; `all checks passed`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/count-in.ts src/lib/form-plan.ts src/lib/rhythm-generation.ts src/lib/rhythm-feasibility.ts \
  src/components/AbcjsSingle.svelte src/components/AbcjsChoral.svelte \
  tests/unit/count-in.test.ts tests/unit/form-plan.test.ts
git commit -m "refactor: beats in a bar come from the meter model, not the top number"
```

---

### Task 5: The compound rhythm vocabulary

**Files:**
- Modify: `src/resources/rhythms.ts` (interface, rest fixes, `meterKind` on all, 12 new figures appended at the end)
- Modify: `src/lib/types.ts:94-110` (`Rhythm`)
- Modify: `src/lib/selectable-rhythms.ts`
- Modify: `src/lib/rhythm-labels.ts`
- Modify: `scripts/render-rhythm-icons.mjs:55-76` (`MUSIC`), `:170-173` (`DECORATE`)
- Create: `src/assets/svgs/{threeEighths,quarterEighth,eighthQuarter,dotHalfCompound,quarterEighthRest,eighthRestTwoEighths,twoEighthsEighthRest,sixSixteenths,twoSixteenthsTwoEighths,eighthTwoSixteenthsEighth,twoEighthsTwoSixteenths,quarterTwoSixteenths,dotQuarterRest,dotHalfRest}.svg`
- Test: `tests/unit/rhythm-catalogue.test.ts` (create), `tests/unit/rhythm-picker-order.test.ts`, `tests/unit/rhythm-labels.test.ts`

**Interfaces:**
- Consumes: `MeterKind` (Task 2) - written as the literal union in the interfaces to keep `resources/` free of `lib/` imports.
- Produces:
  - `Rhythm.meterKind?: "simple" | "compound"` and `Rhythm.pickerGroup?: "Core" | "Rests" | "Sixteenths"` on both `Rhythm` interfaces (optional, so `nct-patterns.ts` and synthesized notes still type-check; a test holds every catalogue entry to declaring `meterKind`).
  - Compound figure names (stable identifiers - they go into presets and links): `dotQuarter`, `threeEighths`, `quarterEighth`, `eighthQuarter`, `dotHalfCompound`, `dotQuarterRest`, `quarterEighthRest`, `eighthRestTwoEighths`, `twoEighthsEighthRest`, `dotHalfRest`, `sixSixteenths`, `twoSixteenthsTwoEighths`, `eighthTwoSixteenthsEighth`, `twoEighthsTwoSixteenths`, `quarterTwoSixteenths`.
  - From `src/lib/selectable-rhythms.ts`: `isSelectableRhythm(r)` (now simple only), `selectableRhythms` (simple, unchanged contents), `isSelectableCompoundRhythm(r)`, `selectableCompoundRhythms: Rhythm[]`, `selectableRhythmsFor(kind: MeterKind): Rhythm[]`, and `rhythmPickerGroups` whose label type is `"Notes" | "Rests" | "Core" | "Sixteenths"`.

- [ ] **Step 1: Write the failing tests**

`tests/unit/rhythm-catalogue.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { rhythms } from "../../src/resources/rhythms";
import {
  selectableCompoundRhythms,
  selectableRhythms,
  selectableRhythmsFor,
} from "../../src/lib/selectable-rhythms";

const by = (name: string) => {
  const r = rhythms.find((x) => x.name === name);
  if (!r) throw new Error(`no rhythm named ${name}`);
  return r;
};
const units = (v: string) => parseInt(v.replace(/^z/, ""), 10);

describe("the rhythm catalogue", () => {
  test("every figure's parts add up to its length", () => {
    for (const r of rhythms) {
      expect([r.name, r.abcValue.reduce((s, v) => s + units(v), 0)]).toEqual([r.name, r.totalValue]);
    }
  });

  test("every figure's meter values match its written lengths", () => {
    for (const r of rhythms) {
      expect([r.name, r.meterValue.map((m) => Math.round(m * 32))]).toEqual([r.name, r.abcValue.map(units)]);
    }
  });

  test("a rest is written as a rest", () => {
    for (const r of rhythms.filter((x) => x.rest)) {
      for (const v of r.abcValue) expect([r.name, v]).toEqual([r.name, v.startsWith("z") ? v : `z${v}`]);
    }
  });

  test("the dotted rests compound meter leans on", () => {
    expect(by("dotEighthRest")).toMatchObject({ abcValue: ["z6"], meterValue: [3 / 16], totalValue: 6 });
    expect(by("dotQuarterRest")).toMatchObject({ abcValue: ["z12"], meterValue: [3 / 8], totalValue: 12 });
    expect(by("dotHalfRest")).toMatchObject({ abcValue: ["z24"], meterValue: [3 / 4], totalValue: 24 });
  });

  test("every figure says which meter it belongs to", () => {
    for (const r of rhythms) expect([r.name, r.meterKind === "simple" || r.meterKind === "compound"]).toEqual([r.name, true]);
  });

  test("every compound figure fills whole dotted-quarter beats", () => {
    for (const r of rhythms.filter((x) => x.meterKind === "compound")) {
      expect([r.name, r.totalValue === 12 || r.totalValue === 24]).toEqual([r.name, true]);
    }
  });

  test("the compound vocabulary is the spec's, in its three groups", () => {
    const group = (g: string) =>
      selectableCompoundRhythms.filter((r) => r.pickerGroup === g).map((r) => r.name).sort();
    expect(group("Core")).toEqual(["dotHalfCompound", "dotQuarter", "eighthQuarter", "quarterEighth", "threeEighths"]);
    expect(group("Rests")).toEqual(["dotHalfRest", "dotQuarterRest", "eighthRestTwoEighths", "quarterEighthRest", "twoEighthsEighthRest"]);
    expect(group("Sixteenths")).toEqual([
      "eighthTwoSixteenthsEighth", "quarterTwoSixteenths", "sixSixteenths", "twoEighthsTwoSixteenths", "twoSixteenthsTwoEighths",
    ]);
    expect(selectableCompoundRhythms.length).toBe(15);
  });

  test("the vocabularies never mix", () => {
    expect(selectableRhythms.some((r) => r.meterKind === "compound")).toBe(false);
    expect(selectableCompoundRhythms.every((r) => r.meterKind === "compound")).toBe(true);
    expect(selectableRhythmsFor("simple")).toBe(selectableRhythms);
    expect(selectableRhythmsFor("compound")).toBe(selectableCompoundRhythms);
  });
});
```

Append to `tests/unit/rhythm-picker-order.test.ts` (add `selectableCompoundRhythms` to its import):

```ts
describe("the compound picker", () => {
  const groups = rhythmPickerGroups(selectableCompoundRhythms);

  test("Core, then Rests, then Sixteenths, nothing lost", () => {
    expect(groups.map((g) => g.label)).toEqual(["Core", "Rests", "Sixteenths"]);
    expect(groups.flatMap((g) => g.rhythms.map((r) => r.name)).sort()).toEqual(
      selectableCompoundRhythms.map((r) => r.name).sort()
    );
  });

  test("each group runs shortest to longest", () => {
    for (const g of groups) {
      const lengths = g.rhythms.map((r) => r.totalValue);
      expect(lengths).toEqual([...lengths].sort((a, b) => a - b));
    }
  });
});
```

In `tests/unit/rhythm-labels.test.ts`, add `"six"` to the `WORDS` set, and append:

```ts
  test("the compound figures", () => {
    expect(rhythmLabel("threeEighths")).toBe("three eighths");
    expect(rhythmLabel("sixSixteenths")).toBe("six sixteenths");
    expect(rhythmLabel("quarterEighthRest")).toBe("quarter, eighth rest");
    expect(rhythmLabel("eighthRestTwoEighths")).toBe("eighth rest, two eighths");
    expect(rhythmLabel("dotHalfCompound")).toBe("dotted half");
  });
```

(place it inside the existing `describe("rhythm labels", ...)`.)

Run: `bun test --timeout 30000 tests/unit/rhythm-catalogue.test.ts tests/unit/rhythm-picker-order.test.ts tests/unit/rhythm-labels.test.ts`
Expected: FAIL - `selectableCompoundRhythms` is not exported; `dotEighthRest` totals 5.

- [ ] **Step 2: The interfaces**

In `src/resources/rhythms.ts` and in `src/lib/types.ts`, add to `interface Rhythm` (after `symbol`):

```ts
  /**
   * The meter this figure belongs to. Compound figures fill whole
   * dotted-quarter beats and are only offered, and only generated, in 6/8,
   * 9/8 and 12/8; simple figures only in 2/4, 3/4 and 4/4. Optional only so
   * figures built elsewhere (nct-patterns, cadence notes) type-check: every
   * entry in this catalogue sets it (tests/unit/rhythm-catalogue.test.ts).
   */
  meterKind?: "simple" | "compound";
  /** The compound picker's group. Simple figures group by notes and rests. */
  pickerGroup?: "Core" | "Rests" | "Sixteenths";
```

- [ ] **Step 3: The data fixes and `meterKind`**

In `src/resources/rhythms.ts`:

- Add `meterKind: "simple",` to every existing entry except `dotQuarter`, `dotQuarterRest` and `dotHalfRest`.
- `thirtySecondRest`: `abcValue: ["z1"]`. `sixteenthRest`: `abcValue: ["z2"]`. `dotSixteenthRest`: `abcValue: ["z3"]`, `meterValue: [3 / 32]`.
- `dotEighthRest`: `abcValue: ["z6"]`, `meterValue: [3 / 16]`, `totalValue: 6`.
- `dotQuarter` gains `meterKind: "compound", pickerGroup: "Core",`.
- `dotQuarterRest`: `abcValue: ["z12"]`, `meterValue: [3 / 8]`, `totalValue: 12`, `oddsWeight: 3`, `weight: 3`, plus `meterKind: "compound", pickerGroup: "Rests",`.
- `dotHalfRest`: `abcValue: ["z24"]`, `meterValue: [3 / 4]`, plus `meterKind: "compound", pickerGroup: "Rests",`.

None of these is a selectable simple figure, and the simple generator's phrase breath looks for a plain rest of 8 units (the quarter rest, unchanged), so simple output cannot move.

- [ ] **Step 4: Append the compound figures**

At the END of the `rhythms` array (after `dotHalfQuarter`, so every `.find` in simple meter still meets the old entries first):

```ts
  // ── Compound meter: 6/8, 9/8, 12/8 ────────────────────────────────────────
  // Every figure fills one dotted-quarter beat (12) or two (24), so compound
  // bars fill beat by beat and nothing lands off the beat (compound-rhythm.ts).
  // Weights are a starting point, not measured against repertoire yet.
  {
    name: "threeEighths",
    abcValue: ["4", "4", "4"],
    meterValue: [1 / 8, 1 / 8, 1 / 8],
    totalValue: 12,
    rest: false,
    oddsWeight: 8,
    maxRng: 0,
    pattern: true,
    symbol: "𝄙𝄙𝄙",
    weight: 8,
    meterKind: "compound",
    pickerGroup: "Core",
  },
  {
    name: "quarterEighth",
    abcValue: ["8", "4"],
    meterValue: [1 / 4, 1 / 8],
    totalValue: 12,
    rest: false,
    oddsWeight: 8,
    maxRng: 0,
    pattern: true,
    symbol: "𝄘𝄙",
    weight: 8,
    meterKind: "compound",
    pickerGroup: "Core",
  },
  {
    name: "eighthQuarter",
    abcValue: ["4", "8"],
    meterValue: [1 / 8, 1 / 4],
    totalValue: 12,
    rest: false,
    oddsWeight: 4,
    maxRng: 0,
    pattern: true,
    symbol: "𝄙𝄘",
    weight: 4,
    meterKind: "compound",
    pickerGroup: "Core",
  },
  {
    // The dotted half of compound meter: two beats. A separate entry from
    // the simple dotHalf, which is three quarter beats of 3/4.
    name: "dotHalfCompound",
    abcValue: ["24"],
    meterValue: [3 / 4],
    totalValue: 24,
    rest: false,
    oddsWeight: 4,
    maxRng: 0,
    pattern: false,
    symbol: "𝄗•",
    weight: 4,
    meterKind: "compound",
    pickerGroup: "Core",
  },
  {
    name: "quarterEighthRest",
    abcValue: ["8", "z4"],
    meterValue: [1 / 4, 1 / 8],
    totalValue: 12,
    rest: false,
    oddsWeight: 2,
    maxRng: 0,
    pattern: true,
    symbol: "𝄘𝄾",
    weight: 2,
    meterKind: "compound",
    pickerGroup: "Rests",
  },
  {
    name: "eighthRestTwoEighths",
    abcValue: ["z4", "4", "4"],
    meterValue: [1 / 8, 1 / 8, 1 / 8],
    totalValue: 12,
    rest: false,
    oddsWeight: 2,
    maxRng: 0,
    pattern: true,
    symbol: "𝄾𝄙𝄙",
    weight: 2,
    meterKind: "compound",
    pickerGroup: "Rests",
  },
  {
    name: "twoEighthsEighthRest",
    abcValue: ["4", "4", "z4"],
    meterValue: [1 / 8, 1 / 8, 1 / 8],
    totalValue: 12,
    rest: false,
    oddsWeight: 2,
    maxRng: 0,
    pattern: true,
    symbol: "𝄙𝄙𝄾",
    weight: 2,
    meterKind: "compound",
    pickerGroup: "Rests",
  },
  {
    name: "sixSixteenths",
    abcValue: ["2", "2", "2", "2", "2", "2"],
    meterValue: [1 / 16, 1 / 16, 1 / 16, 1 / 16, 1 / 16, 1 / 16],
    totalValue: 12,
    rest: false,
    oddsWeight: 4,
    maxRng: 0,
    pattern: true,
    symbol: "𝄚𝄚𝄚𝄚𝄚𝄚",
    weight: 4,
    meterKind: "compound",
    pickerGroup: "Sixteenths",
  },
  {
    name: "twoSixteenthsTwoEighths",
    abcValue: ["2", "2", "4", "4"],
    meterValue: [1 / 16, 1 / 16, 1 / 8, 1 / 8],
    totalValue: 12,
    rest: false,
    oddsWeight: 3,
    maxRng: 0,
    pattern: true,
    symbol: "𝄚𝄚𝄙𝄙",
    weight: 3,
    meterKind: "compound",
    pickerGroup: "Sixteenths",
  },
  {
    name: "eighthTwoSixteenthsEighth",
    abcValue: ["4", "2", "2", "4"],
    meterValue: [1 / 8, 1 / 16, 1 / 16, 1 / 8],
    totalValue: 12,
    rest: false,
    oddsWeight: 3,
    maxRng: 0,
    pattern: true,
    symbol: "𝄙𝄚𝄚𝄙",
    weight: 3,
    meterKind: "compound",
    pickerGroup: "Sixteenths",
  },
  {
    name: "twoEighthsTwoSixteenths",
    abcValue: ["4", "4", "2", "2"],
    meterValue: [1 / 8, 1 / 8, 1 / 16, 1 / 16],
    totalValue: 12,
    rest: false,
    oddsWeight: 3,
    maxRng: 0,
    pattern: true,
    symbol: "𝄙𝄙𝄚𝄚",
    weight: 3,
    meterKind: "compound",
    pickerGroup: "Sixteenths",
  },
  {
    name: "quarterTwoSixteenths",
    abcValue: ["8", "2", "2"],
    meterValue: [1 / 4, 1 / 16, 1 / 16],
    totalValue: 12,
    rest: false,
    oddsWeight: 3,
    maxRng: 0,
    pattern: true,
    symbol: "𝄘𝄚𝄚",
    weight: 3,
    meterKind: "compound",
    pickerGroup: "Sixteenths",
  },
```

- [ ] **Step 5: Selectable sets and picker groups**

In `src/lib/selectable-rhythms.ts`, add `import type { MeterKind } from "./meter";`, then:

```ts
export function isSelectableRhythm(rhythm: Rhythm): boolean {
  // Simple meter's picker. Compound figures (the dotted quarter among them)
  // have their own: selectableCompoundRhythms.
  if ((rhythm.meterKind ?? "simple") !== "simple") return false;
  if (rhythm.name.includes("thirtySecond")) return false;
  if (rhythm.rest) return SELECTABLE_RESTS.has(rhythm.name);
  return true;
}

export const selectableRhythms: Rhythm[] = rhythms.filter(isSelectableRhythm);

/** Compound meter's picker: every compound figure that has a picker group. */
export function isSelectableCompoundRhythm(rhythm: Rhythm): boolean {
  return rhythm.meterKind === "compound" && rhythm.pickerGroup !== undefined;
}

export const selectableCompoundRhythms: Rhythm[] = rhythms.filter(isSelectableCompoundRhythm);

/** The figures a meter of this kind offers - and the only ones it generates. */
export function selectableRhythmsFor(kind: MeterKind): Rhythm[] {
  return kind === "compound" ? selectableCompoundRhythms : selectableRhythms;
}
```

(The old `if (rhythm.name === "dotQuarter") return false;` goes: the dotted quarter is compound now.)

Replace `rhythmPickerGroups` with:

```ts
export type PickerGroupLabel = "Notes" | "Rests" | "Core" | "Sixteenths";

const COMPOUND_GROUPS = ["Core", "Rests", "Sixteenths"] as const;

export function rhythmPickerGroups<R extends Rhythm>(
  list: R[]
): { label: PickerGroupLabel; rhythms: R[] }[] {
  const ordered = (rs: R[]) =>
    rs
      .map((r, i) => ({ r, i }))
      .sort(
        (a, b) =>
          a.r.totalValue - b.r.totalValue ||
          a.r.abcValue.length - b.r.abcValue.length ||
          a.i - b.i
      )
      .map(({ r }) => r);
  // Compound meter groups as the spec does: the core figures, the ones with
  // rests, the ones with sixteenths.
  if (list.length > 0 && list.every((r) => r.meterKind === "compound")) {
    return COMPOUND_GROUPS.map((label) => ({
      label,
      rhythms: ordered(list.filter((r) => r.pickerGroup === label)),
    })).filter((g) => g.rhythms.length > 0);
  }
  return [
    { label: "Notes" as const, rhythms: ordered(list.filter((r) => !containsRest(r))) },
    { label: "Rests" as const, rhythms: ordered(list.filter((r) => containsRest(r))) },
  ].filter((g) => g.rhythms.length > 0);
}
```

- [ ] **Step 6: Labels**

In `src/lib/rhythm-labels.ts`: add `six: "six"` to `COUNTS`, and make the first line of `rhythmLabel`:

```ts
  // dotHalfCompound is compound meter's dotted half: the same note to a reader.
  const lower = name.replace(/Compound$/, "").toLowerCase();
```

- [ ] **Step 7: Icons**

In `scripts/render-rhythm-icons.mjs`, add to `MUSIC`:

```js
  dotQuarterRest: "r4.",
  dotHalfRest: "r2.",
  dotHalfCompound: "c2.",
  threeEighths: "c8[ c8 c8]",
  quarterEighth: "c4 c8",
  eighthQuarter: "c8 c4",
  quarterEighthRest: "c4 r8",
  eighthRestTwoEighths: "r8 c8[ c8]",
  twoEighthsEighthRest: "c8[ c8] r8",
  sixSixteenths: "c16[ c16 c16 c16 c16 c16]",
  twoSixteenthsTwoEighths: "c16[ c16 c8 c8]",
  eighthTwoSixteenthsEighth: "c8[ c16 c16 c8]",
  twoEighthsTwoSixteenths: "c8[ c8 c16 c16]",
  quarterTwoSixteenths: "c4 c16[ c16]",
```

and to `DECORATE`:

```js
  dotHalfRest: (f) => withRestLine(f, "dotHalfRest", true),
```

Run: `bun run icons:rhythm && git status --short src/assets/svgs`
Expected: `wrote 34 icons ...`; `git status` lists the 14 new `??` files only. If any existing icon shows as modified, restore it with `git checkout -- src/assets/svgs/<name>.svg` (same LilyPond, so they should be identical). Open `src/assets/svgs/dotHalfRest.svg` and `dotQuarterRest.svg` in a browser and check the rest sits on its line with its dot; if the line is misplaced, remove the `dotHalfRest` `DECORATE` entry and render again.

- [ ] **Step 8: Run tests**

Run: `bun test --timeout 30000 tests/unit/rhythm-catalogue.test.ts tests/unit/rhythm-picker-order.test.ts tests/unit/rhythm-labels.test.ts tests/unit/custom-syllables.test.ts tests/unit/meter-regression.test.ts`
Expected: PASS; regression snapshot unchanged.

Run: `bun run test 2>&1 | tail -6 && bunx astro check 2>&1 | tail -3 && bun run check:rhythm 2>&1 | tail -1`
Expected: `0 fail`; `0 errors`, `0 warnings`; `all checks passed` (check-rhythm still walks only simple figures - `selectableRhythms` is unchanged).

- [ ] **Step 9: Commit**

```bash
git add src/resources/rhythms.ts src/lib/types.ts src/lib/selectable-rhythms.ts src/lib/rhythm-labels.ts \
  scripts/render-rhythm-icons.mjs src/assets/svgs/*.svg \
  tests/unit/rhythm-catalogue.test.ts tests/unit/rhythm-picker-order.test.ts tests/unit/rhythm-labels.test.ts
git commit -m "feat: the compound rhythm vocabulary, and the dotted rests fixed to match their lengths"
```

---

### Task 6: Compound bars fill beat by beat

**Files:**
- Create: `src/lib/compound-rhythm.ts`
- Modify: `src/lib/rhythm-generation.ts:89-90` (branch + simple-only filter)
- Modify: `src/lib/rhythm-feasibility.ts` (compound branch)
- Modify: `scripts/check-rhythm.ts` (compound selections, beat check)
- Test: `tests/unit/compound-rhythm.test.ts` (create), `tests/unit/rhythm-feasibility.test.ts`

**Interfaces:**
- Consumes: `ExerciseMeter`, `resolveMeter`, `meterKindOf`, `timeSignaturesFor` (Task 2); compound figures and `selectableRhythmsFor` (Task 5); `canFillExercise(..., beatUnits)` (Task 4).
- Produces:
  - `generateCompoundRhythm(meter: ExerciseMeter, measures: number, available: Rhythm[], selectedCadences: Cadence[], allowTies: boolean): RhythmWithPattern[]` - throws `The selected rhythms can't fill N measure(s) of M. Add a shorter rhythm.` when no tiling exists, and `No M rhythms are selected...` when given no compound figure.
  - `compoundHeldNote(units: number): Rhythm` - a cadence note named `"compoundHeld"`, `meterKind: "compound"`.
  - `generateRandomRhythm` routes compound meters to `generateCompoundRhythm` before any other work; on simple meters it ignores compound figures.
  - `canFillExercise(rhythms, tsPerMeasure, totalUnits, allowTies, 12)` answers for compound meter.

Phrase shape (decided here; the spec leaves 12/8's interior cadence open): an interior cadence is a held note of a bar less one beat, then a one-beat breath (the dotted-quarter rest, or a selected dotted quarter as a pickup, 60/40) - a dotted half + breath in 9/8, and in 12/8 a held 36 written as a dotted half tied to a dotted quarter (Task 7) + breath. 6/8 is two beats, so like 2/4 it takes a held dotted half and no breath. The final bar is one note of a whole bar (24, 36, 48). As in simple meter, cadences are only enforced when a plain note (dotted quarter or dotted half) is selected, and a block whose cadence would leave an unfillable remainder is filled without it. A block is only written when the selection can fill it on its own, so the meter-made held notes never make possible what the solver calls impossible (one bar of 9/8 from dotted halves stays refused).

- [ ] **Step 1: Write the failing tests**

`tests/unit/compound-rhythm.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { generateCompoundRhythm } from "../../src/lib/compound-rhythm";
import { meterByName, timeSignatureFor } from "../../src/lib/meter";
import { generateRandomRhythm } from "../../src/lib/rhythm-generation";
import type { RhythmWithPattern } from "../../src/lib/types";
import { rhythms } from "../../src/resources/rhythms";

const by = (...names: string[]) =>
  names.map((n) => {
    const r = rhythms.find((x) => x.name === n);
    if (!r) throw new Error(`no rhythm named ${n}`);
    return r;
  });
const CORE = ["dotQuarter", "threeEighths", "quarterEighth", "eighthQuarter", "dotHalfCompound"];
const ALL = [
  ...CORE, "dotQuarterRest", "quarterEighthRest", "eighthRestTwoEighths", "twoEighthsEighthRest", "dotHalfRest",
  "sixSixteenths", "twoSixteenthsTwoEighths", "eighthTwoSixteenthsEighth", "twoEighthsTwoSixteenths", "quarterTwoSixteenths",
];
const cadences = (measures: number) => Array(Math.ceil(measures / 4)).fill({ type: "V-I" });
const meter = (name: string) => meterByName(name)!;

/** Each note with where it starts in its bar, bar by bar. */
function layout(notes: RhythmWithPattern[], tsPerMeasure: number) {
  const bars: { at: number; len: number; note: RhythmWithPattern }[][] = [];
  let pos = 0;
  for (const note of notes) {
    (bars[Math.floor(pos / tsPerMeasure)] ??= []).push({ at: pos % tsPerMeasure, len: note.totalValue, note });
    pos += note.totalValue;
  }
  return { bars, total: pos };
}

describe("compound rhythm fill", () => {
  for (const name of ["6/8", "9/8", "12/8"]) {
    for (const ties of [false, true]) {
      test(`${name}, ties ${ties}: whole bars, and every figure keeps to its beat`, () => {
        const m = meter(name);
        for (let run = 0; run < 20; run++) {
          const notes = generateCompoundRhythm(m, 8, by(...ALL), cadences(8), ties);
          const { bars, total } = layout(notes, m.tsPerMeasure);
          expect(total).toBe(8 * m.tsPerMeasure);
          for (const bar of bars) {
            for (const { at, len, note } of bar) {
              const into = at % m.beatUnits;
              const startsFigure = !note.isPatternNote || note.patternIndex === 0;
              if (startsFigure) expect(into).toBe(0);
              if (into !== 0) expect(into + len).toBeLessThanOrEqual(m.beatUnits);
            }
          }
        }
      });
    }
  }

  test("the last bar is one note, held for the whole bar", () => {
    for (const name of ["6/8", "9/8", "12/8"]) {
      const m = meter(name);
      const notes = generateCompoundRhythm(m, 8, by(...CORE), cadences(8), false);
      const last = notes[notes.length - 1];
      expect([name, last.totalValue, last.isCadenceEnd, last.rest]).toEqual([name, m.tsPerMeasure, true, false]);
    }
  });

  test("an interior cadence: a held note and a one-beat breath (6/8: a dotted half alone)", () => {
    const expected: Record<string, number[]> = { "6/8": [24], "9/8": [24, 12], "12/8": [36, 12] };
    for (const name of ["6/8", "9/8", "12/8"]) {
      const m = meter(name);
      for (let run = 0; run < 10; run++) {
        const notes = generateCompoundRhythm(m, 8, by(...CORE), cadences(8), false);
        const bar4 = layout(notes, m.tsPerMeasure).bars[3].map((n) => n.note);
        expect([name, bar4.map((n) => n.totalValue)]).toEqual([name, expected[name]]);
        expect(bar4[0].isCadenceEnd).toBe(true);
        if (bar4[1]) {
          expect(bar4[1].isPhraseBreath).toBe(true);
          expect(bar4[1].isCadenceEnd).toBe(false);
          expect(bar4[1].name === "dotQuarterRest" || bar4[1].name === "dotQuarter").toBe(true);
        }
      }
    }
  });

  test("no plain note selected, no cadence: eighths all the way", () => {
    const notes = generateCompoundRhythm(meter("6/8"), 4, by("threeEighths"), cadences(4), false);
    expect(notes.every((n) => n.name === "threeEighths")).toBe(true);
    expect(notes.filter((n) => n.isPatternStart).length).toBe(8);
  });

  test("a cadence that would leave the block unfillable is dropped, as in simple meter", () => {
    // 9/8, dotted halves only, ties on: the last bar's 36 leaves nine beats of
    // two-beat notes. Without the cadence the twelve beats tie through.
    const m = meter("9/8");
    for (let run = 0; run < 10; run++) {
      const notes = generateCompoundRhythm(m, 4, by("dotHalfCompound"), cadences(4), true);
      expect(layout(notes, m.tsPerMeasure).total).toBe(4 * 36);
    }
  });

  test("refuses what cannot be filled", () => {
    expect(() => generateCompoundRhythm(meter("9/8"), 4, by("dotHalfCompound"), cadences(4), false)).toThrow(/can't fill/);
    expect(() => generateCompoundRhythm(meter("9/8"), 1, by("dotHalfCompound"), cadences(1), true)).toThrow(/can't fill/);
    expect(() => generateCompoundRhythm(meter("6/8"), 4, by("quarter", "half"), cadences(4), false)).toThrow(/No 6\/8 rhythms/);
  });

  test("generateRandomRhythm sends compound meters here", () => {
    const notes = generateRandomRhythm(timeSignatureFor("6/8"), 4, by(...CORE), cadences(4), true, false);
    expect(notes.reduce((s, n) => s + n.totalValue, 0)).toBe(96);
    expect(notes.every((n) => n.meterKind === "compound")).toBe(true);
  });

  test("simple meter never writes a compound figure", () => {
    for (let run = 0; run < 10; run++) {
      const notes = generateRandomRhythm(timeSignatureFor("4/4"), 4, by("quarter", "threeEighths"), cadences(4), true, false);
      expect(notes.some((n) => n.name === "threeEighths")).toBe(false);
    }
  });
});
```

Append to `tests/unit/rhythm-feasibility.test.ts`:

```ts
describe("compound meter fills by dotted-quarter beats", () => {
  test("a dotted half alone fills 6/8, but not 9/8 without ties", () => {
    expect(canFillExercise([by("dotHalfCompound")], 24, 4 * 24, false, 12)).toBe(true);
    expect(canFillExercise([by("dotHalfCompound")], 36, 4 * 36, false, 12)).toBe(false);
  });

  test("with ties a dotted half crosses the 9/8 barline; a rest never does", () => {
    // Split dotted quarter + dotted quarter: plainly written in compound meter.
    expect(canFillExercise([by("dotHalfCompound")], 36, 4 * 36, true, 12)).toBe(true);
    expect(canFillExercise([by("dotHalfRest"), by("threeEighths")], 36, 36, true, 12)).toBe(true);
    expect(canFillExercise([by("dotHalfRest")], 36, 4 * 36, true, 12)).toBe(false);
  });

  test("one bar of 9/8 is three beats: two-beat notes cannot make it", () => {
    expect(canFillExercise([by("dotHalfCompound")], 36, 36, true, 12)).toBe(false);
  });

  test("any one-beat figure fills every compound meter", () => {
    for (const ts of [24, 36, 48]) {
      expect(canFillExercise([by("threeEighths")], ts, 8 * ts, false, 12)).toBe(true);
    }
  });
});
```

Run: `bun test --timeout 30000 tests/unit/compound-rhythm.test.ts tests/unit/rhythm-feasibility.test.ts`
Expected: FAIL - `Cannot find module '../../src/lib/compound-rhythm'`; the ties cases read `false` (the simple solver refuses a dotted split).

- [ ] **Step 2: The compound fill**

`src/lib/compound-rhythm.ts`:

```ts
import { rhythms as catalogue, type Rhythm } from "../resources/rhythms";
import type { ExerciseMeter } from "./meter";
import type { Cadence, RhythmWithPattern } from "./types";

/**
 * Rhythm for 6/8, 9/8 and 12/8, felt in dotted-quarter beats.
 *
 * Every compound figure fills one beat or two, so a bar fills beat by beat and
 * nothing can land off the beat - beat alignment holds by construction. That
 * also makes the search small enough to be exact: it backtracks over beat
 * positions and remembers the ones that dead-end, so it fails exactly where
 * rhythm-feasibility's solver finds no tiling. check-rhythm holds the two to
 * that.
 *
 * The phrase shape is simple meter's (rhythm-generation.ts): a cadence closes
 * every four bars - a held note and a one-beat breath - and the last bar is one
 * note. Those held notes come from the meter, not the picker: a 9/8 bar is a
 * dotted half tied to a dotted quarter, which nobody selects.
 *
 * Kept apart from generateRandomRhythm's simple-meter fill on purpose: that
 * fill's every random draw is frozen by tests/unit/meter-regression.test.ts.
 */

const PHRASE_BARS = 4;
/** A figure that fills the bar, mid-phrase, stands the music still - as in simple meter. */
const MID_PHRASE_FULL_BAR_PENALTY = 0.1;
/** The breath rests a little more often than it picks up, as in simple meter. */
const BREATH_REST_ODDS = 0.6;

/** A held cadence note, `units` long: made from the meter rather than chosen. */
export function compoundHeldNote(units: number): Rhythm {
  return {
    name: "compoundHeld",
    abcValue: [String(units)],
    meterValue: [units / 32],
    totalValue: units,
    rest: false,
    oddsWeight: 0,
    maxRng: 0,
    pattern: false,
    symbol: "",
    weight: 0,
    meterKind: "compound",
  };
}

const unitsOf = (v: string) => parseInt(String(v).replace(/^[a-z]+/i, ""), 10);
const isRestValue = (v: string) => String(v).startsWith("z");

/** A figure as the notes the writer reads: a pattern split note by note, as rhythm-generation does. */
function expand(r: Rhythm): RhythmWithPattern[] {
  if (!r.pattern) {
    return [{ ...r, isPatternNote: false, isPatternStart: false, isPatternEnd: false, patternIndex: null }];
  }
  // The pattern's chord starts on its first sung note, not on a leading rest.
  const firstSung = Math.max(0, r.abcValue.findIndex((v) => !isRestValue(v)));
  return r.abcValue.map((v, i) => ({
    ...r,
    abcValue: [v],
    totalValue: unitsOf(v),
    meterValue: [r.meterValue[i]],
    rest: isRestValue(v),
    isPatternNote: true,
    isPatternStart: i === firstSung,
    isPatternEnd: i === r.abcValue.length - 1,
    patternIndex: i,
  }));
}

/** The list in a weighted random order, sampled without replacement. */
function weightedOrder(list: Rhythm[], weightOf: (r: Rhythm) => number): Rhythm[] {
  const pool = list.map((r) => ({ r, w: Math.max(0.001, weightOf(r)) }));
  const out: Rhythm[] = [];
  while (pool.length > 0) {
    const total = pool.reduce((s, p) => s + p.w, 0);
    let x = Math.random() * total;
    let i = 0;
    for (; i < pool.length - 1; i++) {
      x -= pool[i].w;
      if (x <= 0) break;
    }
    out.push(pool.splice(i, 1)[0].r);
  }
  return out;
}

/**
 * Whether [start, end) can be filled at all: fillSpan's rules, with no weights
 * and no randomness. A position shown to dead-end is never tried again, which
 * is what makes both exact - whether a position can be finished depends only
 * on the position.
 */
function spanFits(start: number, end: number, figures: Rhythm[], meter: ExerciseMeter, allowTies: boolean): boolean {
  const dead = new Set<number>();
  const walk = (pos: number): boolean => {
    if (pos === end) return true;
    if (pos > end || dead.has(pos)) return false;
    const room = meter.tsPerMeasure - (pos % meter.tsPerMeasure);
    for (const r of figures) {
      if (r.totalValue > end - pos) continue;
      if (r.totalValue > room && !(allowTies && !r.pattern && !r.rest)) continue;
      if (walk(pos + r.totalValue)) return true;
    }
    dead.add(pos);
    return false;
  };
  return walk(start);
}

/** Fills [start, end) with figures, weighted and random, or returns null when nothing can. */
function fillSpan(
  start: number,
  end: number,
  figures: Rhythm[],
  meter: ExerciseMeter,
  measures: number,
  allowTies: boolean,
  timeUsed: Map<string, number>
): Rhythm[] | null {
  const dead = new Set<number>();
  const walk = (pos: number): Rhythm[] | null => {
    if (pos === end) return [];
    if (dead.has(pos)) return null;
    const room = meter.tsPerMeasure - (pos % meter.tsPerMeasure);
    // Only a plain note may run past the barline, and only with ties on -
    // split at a beat it is two dotted values, plainly written in compound.
    const legal = figures.filter(
      (r) => r.totalValue <= end - pos && (r.totalValue <= room || (allowTies && !r.pattern && !r.rest))
    );
    const bar = Math.floor(pos / meter.tsPerMeasure);
    const endsPhrase = bar % PHRASE_BARS === PHRASE_BARS - 1 || bar === measures - 1;
    const weightOf = (r: Rhythm) => {
      // Variety by time used, not count, as in simple meter.
      const variety = Math.max(1, 5 - (timeUsed.get(r.name) ?? 0) / meter.tsPerMeasure);
      const stillness = r.totalValue >= meter.tsPerMeasure && !endsPhrase ? MID_PHRASE_FULL_BAR_PENALTY : 1;
      return r.weight * variety * stillness;
    };
    for (const r of weightedOrder(legal, weightOf)) {
      timeUsed.set(r.name, (timeUsed.get(r.name) ?? 0) + r.totalValue);
      const rest = walk(pos + r.totalValue);
      if (rest) return [r, ...rest];
      timeUsed.set(r.name, (timeUsed.get(r.name) ?? 0) - r.totalValue);
    }
    dead.add(pos);
    return null;
  };
  return walk(start);
}

/** How a phrase ends in this meter. */
function cadenceFor(meter: ExerciseMeter, final: boolean, pickup: Rhythm | null, breathRest: Rhythm): Rhythm[] {
  // The last bar is one note; 6/8 is two beats, so like 2/4 it keeps no breath.
  if (final || meter.beatsPerMeasure === 2) return [compoundHeldNote(meter.tsPerMeasure)];
  const breath = pickup && Math.random() >= BREATH_REST_ODDS ? pickup : breathRest;
  return [compoundHeldNote(meter.tsPerMeasure - meter.beatUnits), breath];
}

export function generateCompoundRhythm(
  meter: ExerciseMeter,
  measures: number,
  available: Rhythm[],
  selectedCadences: Cadence[],
  allowTies: boolean
): RhythmWithPattern[] {
  const figures = available.filter(
    (r) =>
      r.meterKind === "compound" &&
      r.totalValue > 0 &&
      r.totalValue % meter.beatUnits === 0 &&
      r.totalValue <= meter.tsPerMeasure
  );
  if (figures.length === 0) {
    throw new Error(`No ${meter.name} rhythms are selected. Choose from the compound rhythms.`);
  }
  const plain = figures.filter((r) => !r.pattern && !r.rest);
  // As in simple meter: a phrase ends on a held note only when a held note is
  // something the reader has selected.
  const enforceCadence = plain.length > 0;
  const pickup = plain.find((r) => r.totalValue === meter.beatUnits) ?? null;
  const breathRest = catalogue.find((r) => r.name === "dotQuarterRest");
  if (!breathRest) throw new Error("The rhythm catalogue has no dotted-quarter rest.");

  const total = measures * meter.tsPerMeasure;
  const blockUnits = PHRASE_BARS * meter.tsPerMeasure;
  const timeUsed = new Map<string, number>();
  const result: RhythmWithPattern[] = [];
  let cadenceIndex = 0;

  for (let start = 0; start < total; start += blockUnits) {
    const end = Math.min(start + blockUnits, total);
    const cadence = enforceCadence ? cadenceFor(meter, end >= total, pickup, breathRest) : [];
    const cadenceUnits = cadence.reduce((s, r) => s + r.totalValue, 0);
    const cantFill = () =>
      new Error(`The selected rhythms can't fill ${measures} measure(s) of ${meter.name}. Add a shorter rhythm.`);
    // The block must fill from the selection alone. The cadence's held notes
    // are the meter's, not the reader's, and must not make possible what the
    // selection is not - one bar of 9/8 from dotted halves stays refused, as
    // rhythm-feasibility says.
    if (!spanFits(start, end, figures, meter, allowTies)) throw cantFill();
    // The cadence can leave a remainder nothing fills even when the whole
    // block tiles; then the block goes without it, as simple meter does.
    const closes =
      cadence.length > 0 &&
      cadenceUnits <= end - start &&
      spanFits(start, end - cadenceUnits, figures, meter, allowTies);
    const body = fillSpan(start, closes ? end - cadenceUnits : end, figures, meter, measures, allowTies, timeUsed);
    if (!body) throw cantFill();
    for (const r of body) result.push(...expand(r));
    if (closes) {
      const [held, breath] = cadence;
      result.push({
        ...expand(held)[0],
        isCadenceEnd: true,
        cadenceType: selectedCadences[cadenceIndex]?.type || "Unknown",
      });
      // NOT isCadenceEnd: that flag advances the cadence plan, once per phrase.
      if (breath) result.push({ ...expand(breath)[0], isCadenceEnd: false, isPhraseBreath: true });
      cadenceIndex++;
    }
  }
  return result;
}
```

- [ ] **Step 3: Route compound meters, and keep simple meter simple**

In `src/lib/rhythm-generation.ts`, add `import { generateCompoundRhythm } from "./compound-rhythm";` and extend Task 4's meter import to:

```ts
import { beatUnitOf, resolveMeter } from "./meter";
```

and replace the first line of the function body (`let rhythms = [...availableRhythms]; // Start with all available rhythms`) with:

```ts
  // Compound meter fills beat by beat with its own vocabulary. Branch before
  // anything else - above all before any Math.random draw - so simple meter's
  // sequence of draws, and so its output, cannot move.
  const meter = resolveMeter(timeSig);
  if (meter.kind === "compound") {
    return generateCompoundRhythm(meter, measures, availableRhythms, selectedCadences, allowTiesAcrossBarline);
  }

  // The vocabularies never mix: simple meter never writes a compound figure.
  let rhythms = availableRhythms.filter((r) => (r.meterKind ?? "simple") === "simple");
```

and in the filter block below, change `rhythms = availableRhythms.filter((r) => {` to `rhythms = rhythms.filter((r) => {`.

- [ ] **Step 4: The solver's compound branch**

In `src/lib/rhythm-feasibility.ts`, at the top of `canFillExercise`'s body:

```ts
  // Compound meter: every figure is whole beats, so walk beat positions. A
  // plain note may cross the barline when ties are on; split at a beat it is
  // two dotted values, which compound meter writes plainly - so no dotted-split
  // rule here. Kept in step with compound-rhythm.ts's fill.
  if (beatUnits === 12) {
    const usable = rhythms.filter((r) => r.totalValue > 0 && r.totalValue % beatUnits === 0);
    const seenAt = new Set<number>();
    const walkBeats = (pos: number): boolean => {
      if (pos === totalUnits) return true;
      if (pos > totalUnits || seenAt.has(pos)) return false;
      seenAt.add(pos);
      const room = tsPerMeasure - (pos % tsPerMeasure);
      for (const r of usable) {
        if (r.totalValue > room && !(allowTies && !r.pattern && !r.rest)) continue;
        if (walkBeats(pos + r.totalValue)) return true;
      }
      return false;
    };
    return walkBeats(0);
  }
```

- [ ] **Step 5: check-rhythm walks compound selections**

In `scripts/check-rhythm.ts`:

Imports become:

```ts
import { selectableRhythms, selectableRhythmsFor } from "../src/lib/selectable-rhythms";
import { meterKindOf, timeSignaturesFor, type ExerciseTimeSignature } from "../src/lib/meter";
```

Below `TIME_SIGS`:

```ts
const COMPOUND_TIME_SIGS = timeSignaturesFor(["6/8", "9/8", "12/8"]);
const EVERY_TIME_SIG = [...Object.values(TIME_SIGS), ...Object.values(COMPOUND_TIME_SIGS)];
```

`selections` reads the meter's own vocabulary:

```ts
function selections(timeSig: TimeSig): Rhythm[][] {
  const usable = selectableRhythmsFor(meterKindOf(timeSig)).filter(
    (r) => r.totalValue <= timeSig.tsPerMeasure
  );
```

(rest of the function unchanged). Add, after `durationsIn`:

```ts
/**
 * Compound only: a figure that starts inside a beat ends inside it, and a note
 * that starts on a beat lasts whole beats. Every compound figure fills whole
 * beats, so a failure here is a figure placed off the beat.
 */
function crossesABeat(measure: string, beatUnits: number): boolean {
  let at = 0;
  for (const d of durationsIn(measure)) {
    const into = at % beatUnits;
    if (into !== 0 && into + d > beatUnits) return true;
    if (into === 0 && d > beatUnits && d % beatUnits !== 0) return true;
    at += d;
  }
  return false;
}
```

In `checkMeasuresAndCompleteness`, loop over `EVERY_TIME_SIG` instead of `Object.values(TIME_SIGS)`, pass the beat to the solver:

```ts
        const canSolve = canFillExercise(set, timeSig.tsPerMeasure, total, ties, timeSig.beatUnits);
```

and inside the per-measure loop, after the sum check:

```ts
          if (meterKindOf(timeSig) === "compound" && crossesABeat(measure, timeSig.beatUnits)) {
            fail(`beats: ${label} a figure crosses a dotted-quarter beat  (${measure})`);
            break;
          }
```

Update the header comment's list: item 1 becomes "every emitted measure sums to exactly one measure, and in compound meter no figure crosses a beat".

- [ ] **Step 6: Run tests and the checks**

Run: `bun test --timeout 30000 tests/unit/compound-rhythm.test.ts tests/unit/rhythm-feasibility.test.ts tests/unit/meter-regression.test.ts`
Expected: PASS; regression snapshot unchanged.

Run: `for i in $(seq 20); do bun test --timeout 30000 tests/unit/compound-rhythm.test.ts >/dev/null || { echo "failed on run $i"; break; }; done; echo looped`
Expected: `looped` with no failure line.

Run: `bun run check:rhythm 2>&1 | tail -8`
Expected: the selection count roughly doubles (simple + about 700 compound) and `all checks passed`.

Run: `bun run test 2>&1 | tail -6 && bunx astro check 2>&1 | tail -3`
Expected: `0 fail`; `0 errors`, `0 warnings`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/compound-rhythm.ts src/lib/rhythm-generation.ts src/lib/rhythm-feasibility.ts scripts/check-rhythm.ts \
  tests/unit/compound-rhythm.test.ts tests/unit/rhythm-feasibility.test.ts
git commit -m "feat: 6/8, 9/8 and 12/8 bars fill beat by beat, exactly where a tiling exists"
```

- [ ] **Step 8: Mutation-test the compound half of check-rhythm**

In `src/lib/rhythm-feasibility.ts`, temporarily change the compound branch's `(allowTies && !r.pattern && !r.rest)` to `false`.

Run: `bun run check:rhythm 2>&1 | grep -c "completeness: 9/8"`
Expected: a non-zero count (e.g. `9/8 [dotHalfCompound] ties=true generator=ok solver=impossible`).

Restore the solver: `git checkout -- src/lib/rhythm-feasibility.ts`.

Now in `src/lib/compound-rhythm.ts`, temporarily change `fillSpan`'s `if (rest) return [r, ...rest];` to `if (rest || true) return [r, ...(rest ?? [])];` (it stops after one figure).

Run: `bun run check:rhythm 2>&1 | grep -c -e "well-formed" -e "completeness"`
Expected: non-zero.

Restore: `git checkout -- src/lib/compound-rhythm.ts src/lib/rhythm-feasibility.ts && git status --short src/lib`
Expected: no changes listed.

---

### Task 7: Unison writes compound meter

**Files:**
- Modify: `src/lib/generateUnison.ts` (`createConcatString`, around `:1904-2028`)
- Modify: `scripts/check-rhythm.ts` (`checkTieShapes`, `checkLyricAlignment`)
- Test: `tests/unit/unison-compound.test.ts` (create), `tests/unit/exercise-link.test.ts`

**Interfaces:**
- Consumes: `resolveMeter` (Task 2), `generateCompoundRhythm` via `createNewSr` (Task 6).
- Produces: compound ABC as the page draws it - beams by dotted-quarter beat, nothing a quarter or longer beamed, rests break beams, a 36-unit note written `B24-B12`. Simple-meter writing is unchanged byte for byte.

- [ ] **Step 1: Write the failing tests**

`tests/unit/unison-compound.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { createNewSr } from "../../src/lib/generateUnison";
import { timeSignatureFor } from "../../src/lib/meter";
import { rhythms } from "../../src/resources/rhythms";

const CORE = ["dotQuarter", "threeEighths", "quarterEighth", "eighthQuarter", "dotHalfCompound"];

function unison(meter: string, names: string[], over: Record<string, unknown> = {}) {
  const { log, warn, error } = console;
  Object.assign(console, { log() {}, warn() {}, error() {} });
  try {
    return createNewSr({
      bpm: 60, tempo: 60, clef: "treble", selectedClef: "treble", key: "F",
      timeSig: timeSignatureFor(meter), selectedTimeSignature: meter, measures: 8, maxSkip: 4,
      range: { min: 14, max: 21 }, scaleDegrees: [1, 2, 3, 4, 5, 6, 7],
      selectedSharpDegrees: [], selectedFlatDegrees: [],
      rhythms: rhythms.filter((r) => names.includes(r.name)), selectedRhythms: names,
      showSolfege: true, lyricSystem: "movable", showRhythmSyllables: false,
      moveOnEighthNotes: false, accidentalsFollowStep: false, allowTiesAcrossBarline: false,
      partsObject: { numofParts: 1, parts: { Unison: { order: 0, smallName: "U" } } },
      ...over,
    } as any) as [string, unknown, any];
  } finally {
    Object.assign(console, { log, warn, error });
  }
}

const music = (abc: string) =>
  abc.split("start of tune body: \n")[1].split("\n").filter((l) => !l.startsWith("w:")).join(" ");
const measuresOf = (body: string) => body.split("|").map((m) => m.trim()).filter(Boolean);
/** Space-free runs of notes and rests: what abcjs beams together. */
const groupsOf = (measure: string) =>
  measure
    .replace(/"[^"]*"/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .map((g) => [...g.matchAll(/[_^=]*([A-Ga-gz])[,']*(\d+)/g)].map((m) => ({ rest: m[1] === "z", len: Number(m[2]) })));
const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0);

describe("Unison in compound meter", () => {
  test("6/8: eighths beam in threes, one group to a beat", () => {
    const [abc] = unison("6/8", ["threeEighths"], { rhythmOnly: true });
    for (const m of measuresOf(music(abc))) {
      expect(groupsOf(m).map((g) => g.map((n) => n.len))).toEqual([[4, 4, 4], [4, 4, 4]]);
    }
  });

  test("a quarter never beams", () => {
    const [abc] = unison("6/8", ["quarterEighth", "eighthQuarter", "quarterTwoSixteenths"], { rhythmOnly: true });
    for (const m of measuresOf(music(abc))) {
      for (const g of groupsOf(m)) if (g.some((n) => n.len >= 8)) expect(g.length).toBe(1);
    }
  });

  test("a rest ends the beam", () => {
    const [abc] = unison("6/8", ["twoEighthsEighthRest", "eighthRestTwoEighths"], { rhythmOnly: true });
    for (const m of measuresOf(music(abc))) {
      for (const g of groupsOf(m)) if (g.some((n) => n.rest)) expect(g.length).toBe(1);
    }
  });

  test("every bar adds up in every meter, pitched, ties on", () => {
    for (const meter of ["6/8", "9/8", "12/8"]) {
      const bar = timeSignatureFor(meter).tsPerMeasure;
      for (let run = 0; run < 10; run++) {
        const [abc] = unison(meter, [...CORE, "sixSixteenths", "dotQuarterRest"], { allowTiesAcrossBarline: true });
        for (const m of measuresOf(music(abc))) {
          expect([meter, sum(groupsOf(m).flat().map((n) => n.len))]).toEqual([meter, bar]);
        }
      }
    }
  });

  test("9/8's last bar: a dotted half tied to a dotted quarter, one syllable sung through", () => {
    const [abc] = unison("9/8", CORE, { measures: 4 });
    const body = abc.split("start of tune body: \n")[1];
    const last = measuresOf(music(abc)).pop()!;
    expect(last).toMatch(/[A-Ga-g][,']*24-\s*[A-Ga-g][,']*12/);
    const notes = (music(abc).match(/[A-Ga-g][,']*\d+/g) ?? []).length;
    const lyric = body.split("\n").find((l) => l.startsWith("w:"))!;
    expect(lyric.replace(/^w:\s*/, "").trim().split(/\s+/).length).toBe(notes);
  });

  test("12/8's last bar is one dotted whole", () => {
    const [abc] = unison("12/8", CORE, { measures: 4, rhythmOnly: true });
    expect(groupsOf(measuresOf(music(abc)).pop()!).map((g) => g.map((n) => n.len))).toEqual([[48]]);
  });

  test("a note tied over the barline splits at the beat into dotted values", () => {
    for (let run = 0; run < 10; run++) {
      const [abc] = unison("9/8", ["dotHalfCompound", "dotQuarter"], { allowTiesAcrossBarline: true, rhythmOnly: true });
      for (const t of music(abc).matchAll(/(\d+)-\s*\|?\s*[A-Ga-g][,']*(\d+)/g)) {
        expect([12, 24]).toContain(Number(t[1]));
        expect([12, 24]).toContain(Number(t[2]));
      }
    }
  });

  test("Move eighths off: three eighths sung on one pitch, and only inside the figure", () => {
    let moved = 0;
    for (let run = 0; run < 10; run++) {
      const [, , held] = unison("6/8", ["threeEighths"], { moveOnEighthNotes: false });
      const notes = held.partsObject.parts.Unison.chordNoteObject;
      for (let i = 0; i < notes.length; i += 3) {
        expect(notes[i + 1].pitchValue).toBe(notes[i].pitchValue);
        expect(notes[i + 2].pitchValue).toBe(notes[i].pitchValue);
      }
      const [, , free] = unison("6/8", ["threeEighths"], { moveOnEighthNotes: true });
      const fn = free.partsObject.parts.Unison.chordNoteObject;
      for (let i = 0; i < fn.length; i += 3) if (fn[i + 1].pitchValue !== fn[i].pitchValue) moved++;
    }
    expect(moved).toBeGreaterThan(0);
  });

  test("a bar of 9/8 cannot be filled by two-beat notes, and says so", () => {
    expect(() => unison("9/8", ["dotHalfCompound"], { measures: 1, rhythmOnly: true })).toThrow(/can't fill 1 measure/);
  });
});
```

Append to `tests/unit/exercise-link.test.ts`, inside `describe("a unison exercise in a link", ...)`:

```ts
  for (const [meter, over] of [
    ["6/8", { allowTiesAcrossBarline: true }],
    ["9/8", { rhythmOnly: true }],
    ["12/8", {}],
  ] as const) {
    test(`${meter} re-renders byte for byte`, async () => {
      const names = ["dotQuarter", "threeEighths", "quarterEighth", "eighthQuarter", "dotHalfCompound", "sixSixteenths"];
      const [, , score] = quietly(() =>
        createNewSr(unisonParams({
          timeSig: timeSignatureFor(meter),
          selectedTimeSignature: meter,
          selectedRhythms: names,
          rhythms: rhythms.filter((r) => names.includes(r.name)),
          ...over,
        }) as any)
      ) as any;
      const reopened = await expectUnisonRoundTrip(score);
      expect(reopened.timeSig).toEqual(timeSignatureFor(meter));
    });
  }
```

and add `import { timeSignatureFor } from "../../src/lib/meter";` at the top.

Run: `bun test --timeout 30000 tests/unit/unison-compound.test.ts`
Expected: FAIL - "a quarter never beams" finds `B8B4`; 9/8's last bar is a single `B36`.

- [ ] **Step 2: Compound writing in `createConcatString`**

In `src/lib/generateUnison.ts`, change the meter import to `import { beatUnitOf, resolveMeter } from "./meter";` and add, above `function createConcatString`:

```ts
const QUARTER = 8;

/**
 * Lengths one compound-meter note can be written at, longest first: dotted
 * whole, dotted half, half, dotted quarter, quarter, eighth, sixteenth. 36 -
 * 9/8's whole bar, or 12/8's held cadence - is none of them, so it is written
 * as a dotted half tied to a dotted quarter: split at the beat.
 */
const COMPOUND_WRITABLE = [48, 24, 16, 12, 8, 4, 2];
const writableCompoundLength = (units: number) => COMPOUND_WRITABLE.find((w) => w <= units) ?? units;

/**
 * Whether the beam stops after this note in compound meter. A beam shows the
 * dotted-quarter beat, so it stops at each one; only eighths and shorter carry
 * a beam, so it stops either side of a quarter or longer; and a rest ends it.
 * Simple meter keeps its own rule, unchanged byte for byte.
 */
function compoundBeamBreaks(
  note: ChordNoteObject,
  segment: number,
  next: ChordNoteObject | undefined,
  tsCount: number,
  beatUnits: number
): boolean {
  if (tsCount % beatUnits === 0) return true;
  if (!note.rhythm?.pattern || note.rhythm?.rest || segment >= QUARTER) return true;
  return !next || next.rhythm?.rest === true || next.noteLength >= QUARTER;
}
```

Inside `createConcatString`, replace the Task 3 line `const beatUnits = beatUnitOf(params.timeSig);` with:

```ts
  const meter = resolveMeter(params.timeSig);
  /** One beat in 32nds, from the meter model: beams and syllables follow it. */
  const beatUnits = meter.beatUnits;
  const compound = meter.kind === "compound";
```

In the per-note loop, before `while (lengthLeft > 0)`, add:

```ts
        const next = singlePartObject.chordNoteObject[index + 1];
```

Change the segment line:

```ts
          const segment = compound
            ? writableCompoundLength(Math.min(lengthLeft, roomInMeasure))
            : Math.min(lengthLeft, roomInMeasure);
```

and the beam-space test:

```ts
          if (
            compound
              ? compoundBeamBreaks(note, segment, isFinalSegment ? next : undefined, tsCount, beatUnits)
              : tsCount % beatUnits === 0 || !note.rhythm?.pattern
          ) {
            measureString += " ";
          }
```

`segments` already counts every element written, so the `w:` line gets a `_` hold for the split, and `roomInMeasure` / the barline test keep reading `params.timeSig.tsPerMeasure` as before.

If `beatUnitOf` is now unused in the file, drop it from the import.

- [ ] **Step 3: check-rhythm checks compound ties and lyrics**

In `scripts/check-rhythm.ts`, add after `checkTieShapes`:

```ts
/** Compound meter: a tie - over a barline or inside a 9/8 bar - joins whole beats. */
function checkCompoundTieShapes() {
  let ties = 0;
  for (const timeSig of Object.values(COMPOUND_TIME_SIGS)) {
    const set = selectableRhythmsFor("compound").filter((r) => !r.rest);
    for (let i = 0; i < 40; i++) {
      const body = generate({ rhythms: set, timeSig, ties: true, measures: 8 });
      if (!body) continue;
      for (const m of body.matchAll(/[A-Ga-g][,']*(\d+)-\s*\|?\s*[A-Ga-g][,']*(\d+)/g)) {
        ties++;
        const [a, b] = [Number(m[1]), Number(m[2])];
        if (a % timeSig.beatUnits !== 0 || b % timeSig.beatUnits !== 0) {
          fail(`tie shape: ${timeSig.name} produced ${a} tied to ${b} (not whole beats)`);
        }
      }
    }
  }
  return ties;
}
```

Replace `checkLyricAlignment` with a version that also checks 9/8, whose last bar is a tied 24 + 12:

```ts
function checkLyricAlignment() {
  const cases = [
    { timeSig: TIME_SIGS["4/4"], set: selectableRhythms.filter((r) => !r.rest && !r.pattern) },
    // 9/8's last bar is a dotted half tied to a dotted quarter inside the bar.
    { timeSig: COMPOUND_TIME_SIGS["9/8"], set: selectableRhythmsFor("compound").filter((r) => !r.rest && !r.pattern) },
  ];
  let checked = 0;
  for (const { timeSig, set } of cases) {
    for (let i = 0; i < 40; i++) {
      const body = generate({ rhythms: set, timeSig, ties: true, measures: 4, solfege: true });
      if (!body) continue;
      checked++;
      const lines = body.split("\n");
      const music = lines.filter((l) => !l.startsWith("w:")).join(" ");
      const lyric = lines.find((l) => l.startsWith("w:")) ?? "";
      const noteEls = (music.match(/[A-Ga-g][,']*\d+/g) || []).length;
      const slots = lyric.replace(/^w:\s*/, "").trim().split(/\s+/).filter(Boolean).length;
      if (noteEls !== slots) {
        fail(`lyric alignment: ${timeSig.name} ${noteEls} note elements but ${slots} lyric slots`);
        break;
      }
    }
  }
  return checked;
}
```

In the run section add `const compoundTieCount = checkCompoundTieShapes();` after `checkTieShapes()`, and report it:

```ts
report(`  ${compoundTieCount} compound ties, each joining whole dotted-quarter beats`);
```

- [ ] **Step 4: Run tests and the checks**

Run: `bun test --timeout 30000 tests/unit/unison-compound.test.ts tests/unit/exercise-link.test.ts tests/unit/meter-regression.test.ts`
Expected: PASS; regression snapshot unchanged.

Run: `for i in $(seq 20); do bun test --timeout 30000 tests/unit/unison-compound.test.ts >/dev/null || { echo "failed on run $i"; break; }; done; echo looped`
Expected: `looped`, no failure.

Run: `bun run check:rhythm 2>&1 | tail -9`
Expected: a non-zero compound tie count and `all checks passed`.

Run: `bun run test 2>&1 | tail -6 && bunx astro check 2>&1 | tail -3`
Expected: `0 fail`; `0 errors`, `0 warnings`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/generateUnison.ts scripts/check-rhythm.ts tests/unit/unison-compound.test.ts tests/unit/exercise-link.test.ts
git commit -m "feat: Unison writes compound meter - beamed by the dotted-quarter beat, split at the beat"
```

---

### Task 8: Compound rhythm syllables

**Files:**
- Modify: `src/resources/rhythm-syllables.ts` (`SyllableSystem`, `kodaly`, `counting`, `CustomSyllables`, `checkCustomSyllables`, `customSyllableSystem`, `syllableTemplates`)
- Modify: `src/lib/generateUnison.ts:1711-1785` (`rhythmSyllableFor`, `syllablesForFigure`) and the call in `createConcatString`
- Modify: `src/components/SyllableEditor.svelte`
- Modify: `scripts/check-rhythm.ts` (`SYLLABLE_TABLE`, `checkSyllables`)
- Test: `tests/unit/compound-syllables.test.ts` (create), `tests/unit/custom-syllables.test.ts`

**Interfaces:**
- Consumes: `resolveMeter` (Task 2), `selectableCompoundRhythms` (Task 5).
- Produces:
  - `SyllableSystem.compoundSlots?: PositionSyllable[]` - six slots, the sixteenths of a dotted-quarter beat (eighths take 0, 2, 4).
  - `CustomSyllables.compoundSlots?: [string, string, string, string, string, string]` - optional; all six empty counts as absent.
  - `rhythmSyllableFor(note, offsetInMeasure, meter: { beatUnits: number; tsPerMeasure: number; subdivision: number }, system)`; a system without `compoundSlots` reads compound meter as Counting.
  - `syllablesForFigure(rhythm, system)` reads a compound figure from a 6/8 downbeat.

Decision: Takadimi and Gordon are custom templates in this codebase, not built-in systems, so the spec's Takadimi and Gordon rows go into their templates; the built-ins are Kodály and Counting. The "Kodály with ta-a and ti-ka" template gets `ti ka ti ka ti ka`, matching its simple-meter dialect.

- [ ] **Step 1: Write the failing tests**

`tests/unit/compound-syllables.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { syllablesForFigure } from "../../src/lib/generateUnison";
import { selectableCompoundRhythms } from "../../src/lib/selectable-rhythms";
import {
  checkCustomSyllables,
  counting,
  customSyllableSystem,
  kodaly,
  syllableTemplates,
  type SyllableSystem,
} from "../../src/resources/rhythm-syllables";

const fig = (name: string) => selectableCompoundRhythms.find((r) => r.name === name)!;
const read = (system: SyllableSystem, name: string) => syllablesForFigure(fig(name), system);
const template = (id: string) => syllableTemplates.find((t) => t.id === id)!.syllables;

describe("compound syllables, from the spec's table", () => {
  test("Counting is Eastman: 1 la li", () => {
    expect(read(counting, "threeEighths")).toEqual(["1", "la", "li"]);
    expect(read(counting, "sixSixteenths")).toEqual(["1", "ta", "la", "ta", "li", "ta"]);
    expect(read(counting, "quarterEighth")).toEqual(["1", "li"]);
    expect(read(counting, "eighthQuarter")).toEqual(["1", "la"]);
    expect(read(counting, "dotQuarter")).toEqual(["1"]);
    expect(read(counting, "dotHalfCompound")).toEqual(["1_2"]);
    expect(read(counting, "twoSixteenthsTwoEighths")).toEqual(["1", "ta", "la", "li"]);
    expect(read(counting, "eighthTwoSixteenthsEighth")).toEqual(["1", "la", "ta", "li"]);
    expect(read(counting, "quarterEighthRest")).toEqual(["1", "(li)"]);
    expect(read(counting, "dotQuarterRest")).toEqual(["(1)"]);
  });

  test("Kodály: ti ti ti", () => {
    expect(read(kodaly, "threeEighths")).toEqual(["ti", "ti", "ti"]);
    expect(read(kodaly, "sixSixteenths")).toEqual(["ti", "ri", "ti", "ri", "ti", "ri"]);
    expect(read(kodaly, "dotQuarter")).toEqual(["ta"]);
    expect(read(kodaly, "dotHalfCompound")).toEqual(["tu-u"]);
  });

  test("Takadimi: ta ki da", () => {
    const takadimi = customSyllableSystem(template("takadimi"));
    expect(read(takadimi, "threeEighths")).toEqual(["ta", "ki", "da"]);
    expect(read(takadimi, "sixSixteenths")).toEqual(["ta", "va", "ki", "di", "da", "ma"]);
    expect(read(takadimi, "quarterEighth")).toEqual(["ta", "da"]);
  });

  test("Gordon: du da di", () => {
    const gordon = customSyllableSystem(template("gordon"));
    expect(read(gordon, "threeEighths")).toEqual(["du", "da", "di"]);
    expect(read(gordon, "sixSixteenths")).toEqual(["du", "ta", "da", "ta", "di", "ta"]);
  });
});

describe("a teacher's own set in compound meter", () => {
  const { compoundSlots, ...before } = template("kodaly-ta-a");

  test("a set saved before compound meter reads it in Counting", () => {
    const checked = checkCustomSyllables(before);
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    const mine = customSyllableSystem(checked.value);
    for (const r of selectableCompoundRhythms) {
      expect([r.name, syllablesForFigure(r, mine)]).toEqual([r.name, syllablesForFigure(r, counting)]);
    }
  });

  test("six empty compound syllables are the same as none", () => {
    const checked = checkCustomSyllables({ ...before, compoundSlots: ["", "", "", "", "", ""] });
    expect(checked.ok && checked.value.compoundSlots).toBeFalsy();
  });

  test("a half-filled row is refused, and says how to fix it", () => {
    const checked = checkCustomSyllables({ ...before, compoundSlots: ["ti", "ka", "", "", "", ""] });
    expect(checked.ok).toBe(false);
    if (!checked.ok) expect(checked.error).toMatch(/all six/);
  });

  test("a filled row is used", () => {
    const checked = checkCustomSyllables({ ...before, compoundSlots: compoundSlots });
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    expect(read(customSyllableSystem(checked.value), "threeEighths")).toEqual(["ti", "ti", "ti"]);
  });
});
```

In `tests/unit/custom-syllables.test.ts`, the first test also covers compound figures - add `selectableCompoundRhythms` to its `selectable-rhythms` import and change the loop to:

```ts
    for (const r of [...selectableRhythms, ...selectableCompoundRhythms]) {
```

Run: `bun test --timeout 30000 tests/unit/compound-syllables.test.ts tests/unit/custom-syllables.test.ts`
Expected: FAIL - compound figures read with the four-slot simple grid (e.g. three eighths in Counting give `1 e &`-style labels).

- [ ] **Step 2: The syllable data**

In `src/resources/rhythm-syllables.ts`:

Add to `SyllableSystem` (after `slots`):

```ts
  /**
   * Compound meter: the six sixteenth slots of a dotted-quarter beat. Eighths
   * take the first, third and fifth. A system without them - a teacher's own
   * set from before compound meter - is read in Counting there.
   */
  compoundSlots?: PositionSyllable[];
```

`kodaly` gains `compoundSlots: ["ti", "ri", "ti", "ri", "ti", "ri"],` and `counting` gains:

```ts
  // Eastman: 1 la li, and 1 ta la ta li ta in sixteenths.
  compoundSlots: [(c) => String(c.beatNumber), "ta", "la", "ta", "li", "ta"],
```

Update `counting`'s `hint` to `"1 2 & 3 e & a 4; 6/8: 1 la li"`.

`CustomSyllables` gains:

```ts
  /** Compound meter's six sixteenths of a dotted-quarter beat. Absent: read in Counting. */
  compoundSlots?: [string, string, string, string, string, string];
```

In `checkCustomSyllables`, after `out.slots = slots as CustomSyllables["slots"];`:

```ts
  // Optional. Six empty fields, or none at all, mean "read compound meter in
  // Counting"; a row is used only when all six are filled.
  const compoundRaw = v.compoundSlots;
  if (compoundRaw !== undefined && compoundRaw !== null) {
    if (!Array.isArray(compoundRaw) || compoundRaw.length !== 6) {
      return { ok: false, error: "Expected six compound syllables." };
    }
    if (compoundRaw.some((s) => typeof s === "string" && s.trim() !== "")) {
      const compound: string[] = [];
      for (let i = 0; i < 6; i++) {
        const c = checkSyllable(compoundRaw[i], `Compound sixteenth ${i + 1}`);
        if (!c.ok) {
          return { ok: false, error: `${c.error} Fill all six compound syllables, or leave them all empty to read 6/8 in Counting.` };
        }
        compound.push(c.value);
      }
      out.compoundSlots = compound as CustomSyllables["compoundSlots"];
    }
  }
```

`customSyllableSystem` gains, after `slots: [...c.slots],`:

```ts
    ...(c.compoundSlots ? { compoundSlots: [...c.compoundSlots] } : {}),
```

Templates gain `compoundSlots`:

- `kodaly`: `["ti", "ri", "ti", "ri", "ti", "ri"]`
- `kodaly-ta-a`: `["ti", "ka", "ti", "ka", "ti", "ka"]`
- `takadimi`: `["ta", "va", "ki", "di", "da", "ma"]`
- `gordon`: `["du", "ta", "da", "ta", "di", "ta"]`

- [ ] **Step 3: The resolver reads the subdivision**

In `src/lib/generateUnison.ts`, add `counting` to the import from `../resources/rhythm-syllables`. Replace `rhythmSyllableFor`'s signature and its slot lines:

```ts
/** What the resolver needs of the meter: its beat, its bar, and eighths to a beat. */
type SyllableMeter = { beatUnits: number; tsPerMeasure: number; subdivision: number };

function rhythmSyllableFor(
  note: ChordNoteObject,
  offsetInMeasure: number,
  meter: SyllableMeter,
  system: SyllableSystem
): string {
  const { beatUnits, tsPerMeasure } = meter;
  // Compound meter divides the beat in three. A set with no words for that is
  // read in Counting, whole - not its beat word with Counting's slots.
  const compound = meter.subdivision === 3;
  const active = compound && !system.compoundSlots ? counting : system;
  const slots = compound ? active.compoundSlots! : active.slots;
  const beatsPerMeasure = Math.max(1, Math.round(tsPerMeasure / beatUnits));
```

(the beat-numbering and `crossedBeats` lines stay), then:

```ts
  const onBeat = offsetInMeasure % beatUnits === 0;
  // Each division of the beat is two sixteenth slots: four to a quarter beat,
  // six to a dotted-quarter one. From the subdivision, not the slot count.
  const slotWidth = beatUnits / (meter.subdivision * 2);
  const slot = Math.floor((offsetInMeasure % beatUnits) / slotWidth);
  const startLabel =
    onBeat && note.noteLength >= beatUnits
      ? resolveSyllable(active.beat, position)
      : resolveSyllable(slots[slot % slots.length], position);

  const ctx: SyllableContext = { ...position, startLabel };

  const named = note.rhythm?.name ? active.byName[note.rhythm.name] : undefined;
  const fromName = named?.[note.patternIndex ?? 0];
  if (fromName !== undefined) return resolveSyllable(fromName, ctx);

  if (note.rhythm?.rest) return resolveSyllable(active.rest, ctx);

  return crossedBeats.length
    ? resolveSyllable(active.sustain, ctx)
    : startLabel;
}
```

(In simple meter `slotWidth` is 8 / 4 = 2, as before.)

`syllablesForFigure`:

```ts
export function syllablesForFigure(rhythm: Rhythm, system: SyllableSystem): string[] {
  // From the downbeat of a 4/4 bar, or of a 6/8 bar for a compound figure.
  const meter = resolveMeter(rhythm.meterKind === "compound" ? "6/8" : "4/4");
  let offset = 0;
  return rhythm.meterValue.map((value, patternIndex) => {
    const noteLength = Math.round(value * 32);
    const note = {
      noteLength,
      patternIndex,
      rhythm: { name: rhythm.name, rest: rhythm.rest || String(rhythm.abcValue[patternIndex]).startsWith("z") },
    } as unknown as ChordNoteObject;
    const syllable = rhythmSyllableFor(note, offset, meter, system);
    offset += noteLength;
    return syllable;
  });
}
```

In `createConcatString`, the call becomes:

```ts
          ? rhythmSyllableFor(
              note,
              tsCount,
              { beatUnits, tsPerMeasure: params.timeSig.tsPerMeasure, subdivision: meter.subdivision },
              params.syllableSystem ?? defaultSyllableSystem
            )
```

- [ ] **Step 4: The editor**

In `src/components/SyllableEditor.svelte`:

Add `selectableCompoundRhythms` to the `selectable-rhythms` import. Give the draft a compound row it can bind to:

```ts
  type CompoundRow = [string, string, string, string, string, string];
  type Draft = Omit<CustomSyllables, "compoundSlots"> & { compoundSlots: CompoundRow };
  /** Counting's compound words, shown in the empty fields. */
  const COUNTING_COMPOUND = ["1", "ta", "la", "ta", "li", "ta"];
  const withCompoundRow = (c: CustomSyllables): Draft => ({
    ...c,
    compoundSlots: c.compoundSlots ? ([...c.compoundSlots] as CompoundRow) : ["", "", "", "", "", ""],
  });
```

Change `let draft: CustomSyllables = clone(...)` to `let draft: Draft = withCompoundRow(clone(syllableTemplates[0].syllables));`, and the two other assignments to `draft = withCompoundRow(clone($mySyllables));` and `draft = withCompoundRow(clone(t.syllables));`.

Add a compound preview beside `preview`:

```ts
  $: compoundPreview = system
    ? selectableCompoundRhythms.map((r) => ({ name: r.name, label: rhythmLabel(r.name), syllables: syllablesForFigure(r, system!) }))
    : [];
```

After the "Dividing the beat" fieldset:

```svelte
        <fieldset class="flex flex-col gap-1">
          <legend class="sr-label mb-1">Compound meter (6/8, 9/8, 12/8)</legend>
          <div class="flex flex-wrap items-center gap-1">
            {#each [0, 1, 2, 3, 4, 5] as i}
              <input
                class={input}
                bind:value={draft.compoundSlots[i]}
                placeholder={COUNTING_COMPOUND[i]}
                aria-label="Sixteenth {i + 1} of a dotted-quarter beat"
              />
            {/each}
          </div>
          <p class="text-xs text-sr-muted">
            The six sixteenths of a dotted-quarter beat; eighths take the first, third and fifth. Leave all six empty
            to read compound meter in Counting (1 la li).
          </p>
        </fieldset>
```

After the existing preview `<ul>` (inside the `{:else}`), add:

```svelte
          <ul class="grid grid-cols-1 sm:grid-cols-2 gap-1 mt-2">
            {#each compoundPreview as row (row.name)}
              <li class="flex items-center gap-2 bg-sr-raise border border-sr-hairline rounded px-2 py-1">
                <span class="rhythm-icon !w-12 !h-8 shrink-0 text-sr-ink" title={row.label}>{@html svgFor(row.name)}</span>
                <span class="text-sm text-sr-ink font-medium">{row.syllables.join(" ")}</span>
              </li>
            {/each}
          </ul>
          <p class="text-xs text-sr-muted">Compound figures from the downbeat of a 6/8 bar.</p>
```

- [ ] **Step 5: check-rhythm's syllable table covers compound**

In `scripts/check-rhythm.ts`, add:

```ts
/** Compound figures, read from a 6/8 downbeat. */
const COMPOUND_SYLLABLE_TABLE: Record<string, Record<string, string[]>> = {
  kodaly: {
    dotQuarter: ["ta"],
    dotHalfCompound: ["tu-u"],
    threeEighths: ["ti", "ti", "ti"],
    quarterEighth: ["ti", "ti"],
    sixSixteenths: ["ti", "ri", "ti", "ri", "ti", "ri"],
    twoSixteenthsTwoEighths: ["ti", "ri", "ti", "ti"],
  },
  counting: {
    dotQuarter: ["1"],
    dotHalfCompound: ["1_2"],
    threeEighths: ["1", "la", "li"],
    quarterEighth: ["1", "li"],
    eighthQuarter: ["1", "la"],
    sixSixteenths: ["1", "ta", "la", "ta", "li", "ta"],
    eighthTwoSixteenthsEighth: ["1", "la", "ta", "li"],
    quarterTwoSixteenths: ["1", "li", "ta"],
  },
};
```

Replace `checkSyllables` with:

```ts
function checkSyllables() {
  const cases = [
    { tables: SYLLABLE_TABLE, timeSig: TIME_SIGS["4/4"], pool: selectableRhythms },
    { tables: COMPOUND_SYLLABLE_TABLE, timeSig: COMPOUND_TIME_SIGS["6/8"], pool: selectableRhythmsFor("compound") },
  ];
  let checked = 0;
  for (const { tables, timeSig, pool } of cases) {
    for (const systemId of Object.keys(syllableSystems)) {
      const table = tables[systemId];
      if (!table) {
        fail(`syllables: no expected ${timeSig.name} mapping recorded for system "${systemId}"`);
        continue;
      }
      for (const [rhythmName, expected] of Object.entries(table)) {
        const rhythm = pool.find((r) => r.name === rhythmName);
        if (!rhythm) {
          fail(`syllables: "${rhythmName}" is not a selectable ${timeSig.name} rhythm`);
          continue;
        }
        // Every figure in the tables fills its meter's bar on its own, so it
        // always starts on beat 1 and the expected reading is exact.
        let seenExpected = false;
        for (let i = 0; i < 12 && !seenExpected; i++) {
          const body = generate({ rhythms: [rhythm], timeSig, measures: 2, syllables: systemId });
          if (!body) continue;
          const syllables = [...body.matchAll(/"_([^"]*)"/g)].map((m) => m[1]);
          if (syllables.slice(0, expected.length).join(" ") === expected.join(" ")) seenExpected = true;
        }
        checked++;
        if (!seenExpected) {
          fail(`syllables: ${systemId}/${rhythmName} never produced "${expected.join(" ")}" on beat 1 of ${timeSig.name}`);
        }
      }
    }
  }
  return checked;
}
```

- [ ] **Step 6: Run tests and the checks**

Run: `bun test --timeout 30000 tests/unit/compound-syllables.test.ts tests/unit/custom-syllables.test.ts tests/unit/pitched-syllables.test.ts tests/unit/meter-regression.test.ts`
Expected: PASS; regression snapshot unchanged.

Run: `bun run check:rhythm 2>&1 | tail -9`
Expected: more syllable mappings than before and `all checks passed`.

Run: `bun run test 2>&1 | tail -6 && bunx astro check 2>&1 | tail -3`
Expected: `0 fail`; `0 errors`, `0 warnings`.

- [ ] **Step 7: Commit**

```bash
git add src/resources/rhythm-syllables.ts src/lib/generateUnison.ts src/components/SyllableEditor.svelte scripts/check-rhythm.ts \
  tests/unit/compound-syllables.test.ts tests/unit/custom-syllables.test.ts
git commit -m "feat: compound syllables in every system - 1 la li, ti ti ti - and a teacher's own set falls back to counting"
```

---

### Task 9: Tempo marks and the beaming rule in the shared notation

**Files:**
- Modify: `src/lib/abc-assembly.ts:77`, `:154-165`
- Modify: `src/lib/exports.ts:24-46`
- Modify: `src/lib/abc-score-file.ts:229`
- Modify: `src/lib/musicxml.ts:139-145`, `:457-466`
- Modify: `src/components/AbcjsSingle.svelte:1246-1249` (`updateTempoInAbcString`)
- Test: `tests/unit/beaming.test.ts`, `tests/unit/exports.test.ts`, `tests/unit/abc-score-file.test.ts`, `tests/unit/musicxml.test.ts`

**Interfaces:**
- Consumes: `tempoField`, `isCompound`, `timeSignatureFor` (Task 2).
- Produces: `Q:3/8=<bpm>` in compound, `Q:1/4=<bpm>` in simple, in all four places; `midiFileFor` always writes the page's tempo into the ABC before rendering (abcjs's MIDI writer ignores `qpm` for */8 meters).

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/beaming.test.ts` (add the two imports at the top):

```ts
import { assembleAbcString } from "../../src/lib/abc-assembly";
import { timeSignatureFor } from "../../src/lib/meter";

describe("the shared assembler in a dotted-quarter beat", () => {
  // Choral never writes compound meter yet; this pins the rule for when it does.
  const note = (length: number) => ({ name: "c", degree: 0, pitchValue: 21, length, rest: false }) as any;
  const part = { name: "Soprano", smallName: "S", clef: "treble", order: 0, range: [0, 40], possibleNotes: [], chordNotes: [] } as any;
  const abc = assembleAbcString(
    [[note(8), note(4), note(4), note(4), note(4)]],
    [part],
    [],
    "C",
    timeSignatureFor("6/8"),
    { title: "t", composer: "c", tempo: 60 }
  );
  const body = abc.split("start of tune body:\n")[1];

  test("a quarter never beams inside a 12-unit group", () => {
    expect(body).toContain("c8 c4 ");
    expect(body).toContain("c4c4c4");
  });

  test("the tempo counts dotted quarters", () => {
    expect(abc).toContain("Q:3/8=60\n");
  });
});
```

Append to `tests/unit/exports.test.ts`, in `describe("withTempo", ...)`:

```ts
  test("compound meter counts dotted quarters", () => {
    expect(withTempo("X:1\nM:6/8\nL:1/32\nK:C\nB12|", 60)).toBe("X:1\nM:6/8\nL:1/32\nQ:3/8=60\nK:C\nB12|");
    expect(withTempo("X:1\nM:9/8\nL:1/32\nQ:1/4=90\nK:C\nB12|", 60)).toBe("X:1\nM:9/8\nL:1/32\nQ:3/8=60\nK:C\nB12|");
  });
```

and to the MIDI describe (the one with "unison, which has no Q: line"):

```ts
  test("a 6/8 file with no Q: line plays the dotted quarter at the tempo asked for", () => {
    // abcjs's MIDI writer reads */8 tempos from the Q: line and ignores qpm;
    // without one it wrote 180 a quarter. MIDI counts quarters: ♩. = 60 is ♩ = 90.
    const midi = readMidi(midiFileFor("X:1\nM:6/8\nL:1/32\nK:C\nB12 B12|B24|\n", { bpm: 60 }));
    expect(midi.tempos).toContain(Math.round(60_000_000 / 90));
  });
```

Append to `tests/unit/abc-score-file.test.ts` (import `buildHeader` from `../../src/lib/abc-score-file` if not already):

```ts
test("a compound score's tempo counts dotted quarters", () => {
  expect(buildHeader({ title: "Row", meter: "6/8", tempo: 60 } as any)).toContain("\nQ:3/8=60\n");
  expect(buildHeader({ title: "Row", meter: "3/4", tempo: 72 } as any)).toContain("\nQ:1/4=72\n");
});
```

Append to `tests/unit/musicxml.test.ts` (import `abcToMusicXml` if not already):

```ts
describe("tempo in compound meter", () => {
  test("a dotted-quarter metronome mark, and the sound in quarters", () => {
    const xml = abcToMusicXml("X:1\nM:6/8\nL:1/32\nQ:3/8=60\nK:C\nB12 B12|\n");
    expect(xml).toContain("<beat-unit>quarter</beat-unit>");
    expect(xml).toContain("<beat-unit-dot/>");
    expect(xml).toContain("<per-minute>60</per-minute>");
    expect(xml).toContain('<sound tempo="90"/>');
  });

  test("simple meter is unchanged", () => {
    const xml = abcToMusicXml("X:1\nM:4/4\nL:1/32\nQ:1/4=72\nK:C\nB8 B8 B8 B8|\n");
    expect(xml).not.toContain("<beat-unit-dot/>");
    expect(xml).toContain('<sound tempo="72"/>');
  });
});
```

Run: `bun test --timeout 30000 tests/unit/beaming.test.ts tests/unit/exports.test.ts tests/unit/abc-score-file.test.ts tests/unit/musicxml.test.ts`
Expected: FAIL - `c8c4` beamed; `Q:1/4=`; MIDI tempo 333333; no `<beat-unit-dot/>`.

- [ ] **Step 2: abc-assembly**

In `src/lib/abc-assembly.ts`, import `tempoField` beside `beatUnitOf` from `./meter`. Line 77:

```ts
  abcString += `${tempoField(timeSig, metadata.tempo)}\n`;
```

In `beamsTogether`, replace `if (note.length >= beamUnit || next.length >= beamUnit) return false;` with:

```ts
    // Only eighths and shorter carry a beam. Testing against the beat let a
    // quarter (8) beam inside a dotted-quarter (12) beat.
    if (note.length >= QUARTER || next.length >= QUARTER) return false;
```

and add `const QUARTER = 8;` above `beamsTogether`. (In simple meter `beamUnit` was 8, so nothing changes there.)

- [ ] **Step 3: exports**

In `src/lib/exports.ts`, `import { tempoField } from "./meter";`, then:

```ts
export function midiFileFor(abc: string, opts: { bpm: number; transpose?: number }): Uint8Array {
  // The tempo goes into the ABC as well as qpm: for */8 meters abcjs's MIDI
  // writer takes the tempo from the Q: line alone, and unison has none - a
  // 6/8 file came out at 180 a quarter whatever the page said.
  const [tune] = abcjs.parseOnly(withPlaybackTranspose(withTempo(abc, opts.bpm), opts.transpose ?? 0));
```

(rest of the function unchanged) and in `withTempo`:

```ts
  const q = tempoField(keyAndMeterOf(abc).meter, Math.round(bpm));
```

Update `withTempo`'s doc comment: "The ABC with its tempo set, counted in the meter's beat (Q:3/8 in compound), replacing a Q: line or adding one."

- [ ] **Step 4: abc-score-file and the Unison page**

`src/lib/abc-score-file.ts` - import `tempoField` from `./meter`, and line 229:

```ts
  lines.push(tempoField(meta.meter || "4/4", meta.tempo ?? 72));
```

`src/components/AbcjsSingle.svelte` - add `tempoField` to the `../lib/meter` import and:

```ts
  function updateTempoInAbcString(abcString: string, newTempo: number): string {
    // Replace the Q: (tempo) line, counted in the meter's beat.
    return abcString.replace(/Q:\d+\/\d+=\d+/g, tempoField(selectedTimeSignature, newTempo));
  }
```

- [ ] **Step 5: MusicXML**

In `src/lib/musicxml.ts`, `import { isCompound } from "./meter";`. In `scoreFromAbc`, the tempo read accepts the meter's own beat:

```ts
  const compound = isCompound(`${meter.beats}/${meter.beatType}`);
  const beatLength = compound ? 0.375 : 0.25;
  return {
    title: options.title ?? tune.metaText?.title,
    composer: options.composer ?? tune.metaText?.composer,
    tempo:
      options.tempo ??
      (tempo?.bpm && (tempo.duration?.[0] ?? beatLength) === beatLength ? tempo.bpm : undefined),
```

(`const compound` / `const beatLength` go just before `return {`.) Where the metronome mark is written:

```ts
        if (index === 0 && score.tempo) {
          // The mark counts the meter's beat; <sound tempo> is always quarter
          // notes a minute, so a dotted-quarter 60 sounds as 90.
          const compound = isCompound(`${score.time.beats}/${score.time.beatType}`);
          line(3, '<direction placement="above">');
          line(4, "<direction-type>");
          line(5, "<metronome>");
          line(6, "<beat-unit>quarter</beat-unit>");
          if (compound) line(6, "<beat-unit-dot/>");
          line(6, `<per-minute>${score.tempo}</per-minute>`);
          line(5, "</metronome>");
          line(4, "</direction-type>");
          line(4, `<sound tempo="${compound ? score.tempo * 1.5 : score.tempo}"/>`);
          line(3, "</direction>");
        }
```

- [ ] **Step 6: Run tests**

Run: `bun test --timeout 30000 tests/unit/beaming.test.ts tests/unit/exports.test.ts tests/unit/abc-score-file.test.ts tests/unit/musicxml.test.ts tests/unit/meter-regression.test.ts`
Expected: PASS; regression snapshot unchanged (Choral's `Q:1/4=72` and its beams are what they were).

Run: `bun run test 2>&1 | tail -6 && bunx astro check 2>&1 | tail -3`
Expected: `0 fail`; `0 errors`, `0 warnings`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/abc-assembly.ts src/lib/exports.ts src/lib/abc-score-file.ts src/lib/musicxml.ts src/components/AbcjsSingle.svelte \
  tests/unit/beaming.test.ts tests/unit/exports.test.ts tests/unit/abc-score-file.test.ts tests/unit/musicxml.test.ts
git commit -m "feat: compound tempo marks count dotted quarters, and a quarter never beams"
```

---

### Task 10: Playback, click and count-in in compound meter

**Files:**
- Modify: `src/components/PlaybackBar.svelte:27-36` (prop), `:332`, `:363-366`, `:389`
- Modify: `src/components/AbcjsSingle.svelte:1195`, `:1651` (comments), `:4022` (prop)
- Test: `tests/unit/compound-playback.test.ts` (create)

**Interfaces:**
- Consumes: `beatsOf`, `beatSymbolOf` (Task 2); `countInBeats` (Task 4); `metronomeClickFor`, `newMetronomeBeatState` (`src/lib/metronome-beats.ts`).
- Produces: `PlaybackBar` prop `beatSymbol: string | null = null` - when set, the tempo reads `♩. =` / `♩ =`; Choral, which does not pass it, keeps `BPM`.

Decision (deviates from the spec's wording on purpose): the spec says playback passes abcjs `qpm = bpm * 1.5`. abcjs does not count `qpm` in quarters: both `CreateSynth` (`millisecondsPerMeasure(flattened.tempo)`) and `TimingCallbacks` (`millisecondsPerBeat = 60000 / qpm`) count the meter's own beat, which `getBeatLength()` makes the dotted quarter in 6/8, 9/8 and 12/8. Measured: `millisecondsPerMeasure(60)` is 2000 ms for a 6/8 bar. So the page's BPM is passed unchanged and the dotted quarter sounds at the BPM, which is the spec's intent ("BPM counts dotted quarters"). The test below pins this so nobody "fixes" it to 1.5x. The beat subdivision (`beatSubdivisions: 16`) is per dotted-quarter beat already, so the click, cursor and count-in callbacks land on dotted quarters with no change.

- [ ] **Step 1: Write the pinning tests**

These pass on first run by design - they pin what the page relies on, and fail if abcjs or the model ever changes under it.

`tests/unit/compound-playback.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import abcjs from "abcjs";
import { countInBeats } from "../../src/lib/count-in";
import { beatsOf } from "../../src/lib/meter";
import { metronomeClickFor, newMetronomeBeatState } from "../../src/lib/metronome-beats";

describe("compound playback", () => {
  test("abcjs counts qpm in the meter's own beat, so the page passes its BPM unchanged", () => {
    // ♩. = 60: a 6/8 bar is two seconds. qpm = bpm * 1.5 would make it 1.33 s.
    for (const [meter, ms] of [["6/8", 2000], ["9/8", 3000], ["12/8", 4000], ["4/4", 4000], ["3/4", 3000]] as const) {
      const [tune] = abcjs.parseOnly(`X:1\nM:${meter}\nL:1/32\nK:C\nB12|\n`);
      expect([meter, tune.millisecondsPerMeasure(60)]).toEqual([meter, ms]);
    }
  });

  test("the count-in is two bars of two dotted quarters in 6/8: four seconds at 60", () => {
    // AbcjsSingle.getCountInDuration: (60 / tempo) * countInBeats(meter).
    expect((60 / 60) * countInBeats("6/8")).toBe(4);
    expect((60 / 60) * countInBeats("9/8")).toBe(3);
  });

  test("the click sounds once a dotted-quarter beat, beat one accented", () => {
    for (const [meter, beats] of [["6/8", 2], ["9/8", 3], ["12/8", 4]] as const) {
      const state = newMetronomeBeatState();
      const clicks: boolean[] = [];
      // abcjs calls back 16 times a beat; the click fires once on each whole beat.
      for (let tick = 0; tick < 2 * beats * 16; tick++) {
        const c = metronomeClickFor(state, tick / 16, beatsOf(meter));
        if (c.click) clicks.push(c.isDownbeat);
      }
      expect(clicks.length).toBe(2 * beats);
      expect(clicks.map((d, i) => d === (i % beats === 0)).every(Boolean)).toBe(true);
    }
  });
});
```

Run: `bun test --timeout 30000 tests/unit/compound-playback.test.ts`
Expected: PASS.

- [ ] **Step 2: The tempo label**

In `src/components/PlaybackBar.svelte`, add after `export let bpm: number = 60;`:

```ts
  /**
   * The note the tempo counts, "♩" or "♩.", shown as "♩. = 60". Omit it and
   * the bar says BPM, as Choral's does.
   */
  export let beatSymbol: string | null = null;
  $: tempoLabel = beatSymbol ? `${beatSymbol} =` : "BPM";
  $: tempoAria = beatSymbol === "♩." ? "Tempo in dotted-quarter beats per minute" : "Tempo in beats per minute";
```

Replace the text `BPM` in the two label spans (line 332 and line 389) with `{tempoLabel}`, and the number field's `aria-label="Tempo in beats per minute"` with `aria-label={tempoAria}`.

In `src/components/AbcjsSingle.svelte`, add `beatSymbolOf` to the `../lib/meter` import and pass the prop where `<PlaybackBar` is rendered (beside `bpm={tempo}`):

```svelte
    beatSymbol={beatSymbolOf(selectedTimeSignature)}
```

At `qpm: tempo,` in both `createSynth.init` options (line 1195) and the `TimingCallbacks` options (line 1651), add the comment:

```ts
        // abcjs counts qpm in the meter's beat - the dotted quarter in 6/8 -
        // so the page's BPM goes in unchanged (tests/unit/compound-playback.test.ts).
```

- [ ] **Step 3: Run checks**

Run: `bun run test 2>&1 | tail -6 && bunx astro check 2>&1 | tail -3`
Expected: `0 fail`; `0 errors`, `0 warnings`.

- [ ] **Step 4: Commit**

```bash
git add src/components/PlaybackBar.svelte src/components/AbcjsSingle.svelte tests/unit/compound-playback.test.ts
git commit -m "feat: the tempo reads ♩. = 60 in compound meter, and plays the dotted quarter at it"
```

---

### Task 11: The Unison page offers compound meter

**Files:**
- Modify: `src/lib/selectable-rhythms.ts` (selection by kind)
- Modify: `src/components/AbcjsSingle.svelte`: `:104-108` (table), `:417-451` (`filterRhythms`, `DEFAULT_RHYTHM_NAMES`, `resolveSelectedRhythms`, `rhythmSvgs`), `:482`, `:621`, `:672`, `:1030-1038` (`DEFAULTS`, `rhythmDirty`), `:3083`, `:3357-3367` (meter picker)
- Test: `tests/unit/rhythm-selection.test.ts` (create)

**Interfaces:**
- Consumes: `EXERCISE_METER_NAMES`, `SIMPLE_METER_NAMES`, `COMPOUND_METER_NAMES`, `meterKindOf`, `timeSignaturesFor`, `MeterKind` (Task 2); `selectableRhythmsFor`, `selectableCompoundRhythms` (Task 5).
- Produces, in `src/lib/selectable-rhythms.ts`:
  - `DEFAULT_RHYTHM_NAMES: Record<MeterKind, string[]>` - simple `["eighthEighth", "quarter"]`, compound the Core set.
  - `resolveRhythmSelection(names: unknown, kind: MeterKind): Rhythm[]` - names of that kind, else that kind's defaults.
  - `type RhythmMemory = Partial<Record<MeterKind, string[]>>`
  - `switchRhythmKind(memory: RhythmMemory, from: MeterKind, to: MeterKind, current: string[]): { memory: RhythmMemory; selection: Rhythm[] }`

- [ ] **Step 1: Write the failing tests**

`tests/unit/rhythm-selection.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import {
  DEFAULT_RHYTHM_NAMES,
  resolveRhythmSelection,
  selectableRhythmsFor,
  switchRhythmKind,
} from "../../src/lib/selectable-rhythms";

const names = (rs: { name: string }[]) => rs.map((r) => r.name);
const CORE = ["dotHalfCompound", "dotQuarter", "eighthQuarter", "quarterEighth", "threeEighths"];

describe("the rhythm selection follows the meter's kind", () => {
  test("Core is compound's default, eighths and quarters simple's", () => {
    expect([...DEFAULT_RHYTHM_NAMES.compound].sort()).toEqual(CORE);
    expect(DEFAULT_RHYTHM_NAMES.simple).toEqual(["eighthEighth", "quarter"]);
  });

  test("the first switch to compound selects the Core set", () => {
    const { selection } = switchRhythmKind({}, "simple", "compound", ["quarter", "half", "dotHalf"]);
    expect(names(selection).sort()).toEqual(CORE);
  });

  test("4/4 -> 6/8 -> 4/4 restores the simple selection, and back restores the compound one", () => {
    let step = switchRhythmKind({}, "simple", "compound", ["quarter", "half", "dotHalf"]);
    step = switchRhythmKind(step.memory, "compound", "simple", ["threeEighths", "sixSixteenths"]);
    expect(names(step.selection)).toEqual(["quarter", "half", "dotHalf"]);
    step = switchRhythmKind(step.memory, "simple", "compound", ["quarter", "half", "dotHalf"]);
    expect(names(step.selection)).toEqual(["threeEighths", "sixSixteenths"]);
  });

  test("moving within a kind keeps the selection", () => {
    const { selection } = switchRhythmKind({}, "compound", "compound", ["threeEighths"]);
    expect(names(selection)).toEqual(["threeEighths"]);
  });

  test("a preset or link naming the other kind's rhythms falls back to this kind's defaults", () => {
    expect(names(resolveRhythmSelection(["quarter", "half"], "compound")).sort()).toEqual(CORE);
    expect(names(resolveRhythmSelection(["threeEighths"], "simple"))).toEqual(["eighthEighth", "quarter"]);
    expect(names(resolveRhythmSelection("junk", "compound")).sort()).toEqual(CORE);
  });

  test("a preset saved in 6/8 keeps its compound selection", () => {
    expect(names(resolveRhythmSelection(["quarterEighth", "dotQuarterRest", "quarter"], "compound"))).toEqual([
      "quarterEighth",
      "dotQuarterRest",
    ]);
  });

  test("the picker shows only the meter's own figures", () => {
    expect(selectableRhythmsFor("compound").every((r) => r.meterKind === "compound")).toBe(true);
    expect(selectableRhythmsFor("simple").some((r) => r.meterKind === "compound")).toBe(false);
  });
});
```

Run: `bun test --timeout 30000 tests/unit/rhythm-selection.test.ts`
Expected: FAIL - `DEFAULT_RHYTHM_NAMES` is not exported.

- [ ] **Step 2: Selection by kind**

Append to `src/lib/selectable-rhythms.ts`:

```ts
/** What a fresh selection is, per kind: eighths and quarters, or compound's Core set. */
export const DEFAULT_RHYTHM_NAMES: Record<MeterKind, string[]> = {
  simple: ["eighthEighth", "quarter"],
  compound: selectableCompoundRhythms.filter((r) => r.pickerGroup === "Core").map((r) => r.name),
};

/**
 * Saved rhythm names, resolved against the figures this kind of meter offers.
 * A preset, link or old save can name the other kind's figures - or nothing
 * real - and a selection must never come back empty, so that falls back to the
 * kind's defaults.
 */
export function resolveRhythmSelection(names: unknown, kind: MeterKind): Rhythm[] {
  const pool = selectableRhythmsFor(kind);
  const wanted = Array.isArray(names) ? names : [];
  const resolved = wanted
    .map((name) => pool.find((r) => r.name === name))
    .filter((r): r is Rhythm => r !== undefined);
  if (resolved.length > 0) return resolved;
  return DEFAULT_RHYTHM_NAMES[kind]
    .map((name) => pool.find((r) => r.name === name))
    .filter((r): r is Rhythm => r !== undefined);
}

/** Each kind's last selection, kept while the reader moves between them. */
export type RhythmMemory = Partial<Record<MeterKind, string[]>>;

/**
 * Moving between a simple and a compound meter puts away one kind's selection
 * and brings back the other's - Core, the first time. 4/4 -> 6/8 -> 4/4
 * restores what the teacher had ticked in 4/4.
 */
export function switchRhythmKind(
  memory: RhythmMemory,
  from: MeterKind,
  to: MeterKind,
  current: string[]
): { memory: RhythmMemory; selection: Rhythm[] } {
  if (from === to) return { memory, selection: resolveRhythmSelection(current, to) };
  const next: RhythmMemory = { ...memory, [from]: [...current] };
  return { memory: next, selection: resolveRhythmSelection(next[to] ?? [], to) };
}
```

Run: `bun test --timeout 30000 tests/unit/rhythm-selection.test.ts`
Expected: PASS.

- [ ] **Step 3: The page's tables and selection**

In `src/components/AbcjsSingle.svelte`:

Imports - the `../lib/meter` import gains `COMPOUND_METER_NAMES, EXERCISE_METER_NAMES, SIMPLE_METER_NAMES, meterKindOf`; the `../lib/selectable-rhythms` import becomes:

```ts
  import {
    DEFAULT_RHYTHM_NAMES,
    resolveRhythmSelection,
    rhythmPickerGroups,
    selectableCompoundRhythms,
    selectableRhythms,
    selectableRhythmsFor,
    switchRhythmKind,
    type RhythmMemory,
  } from "../lib/selectable-rhythms";
```

Replace the Task 3 table with all six meters and the picker's grouping:

```ts
  const timeSignatures = timeSignaturesFor(EXERCISE_METER_NAMES);
  /** The meter picker: simple meters, then compound. */
  const meterGroups = [
    { label: "Simple", names: SIMPLE_METER_NAMES },
    { label: "Compound", names: COMPOUND_METER_NAMES },
  ];
```

Replace `let filterRhythms = selectableRhythms;`, `const DEFAULT_RHYTHM_NAMES = [...]` and `resolveSelectedRhythms` (lines ~417-443) with:

```ts
  /**
   * Resolve saved rhythm names against what the meter's kind offers - see
   * resolveRhythmSelection. Never empty: a bad ?rhythms= falls back to the
   * kind's defaults.
   */
  function resolveSelectedRhythms(names: unknown, meter: string = "4/4"): Rhythm[] {
    return resolveRhythmSelection(names, meterKindOf(meter));
  }
```

and `rhythmSvgs` imports icons for both vocabularies:

```ts
  const rhythmSvgs = Object.fromEntries(
    [...selectableRhythms, ...selectableCompoundRhythms].map((rhythm) => [
      rhythm.name,
      import(`../assets/svgs/${rhythm.name}.svg?raw`),
    ])
  );
```

Callers pass the meter: in `stateFromOptions`, `selectedRhythms: resolveSelectedRhythms(options.selectedRhythms, ts),`; in `applyLadderStep`, `selectedRhythms = resolveSelectedRhythms(u.selectedRhythms, u.selectedTimeSignature);`; the defaults' `resolveSelectedRhythms([])` stays (4/4).

After `let selectedTimeSignature = initialState.selectedTimeSignature;` add:

```ts
  /** The picker follows the meter's kind: compound figures in 6/8, 9/8, 12/8. */
  $: filterRhythms = selectableRhythmsFor(meterKindOf(selectedTimeSignature));
  /** Each kind's selection while the reader is in the other (switchRhythmKind). */
  let rhythmMemory: RhythmMemory = {};

  /** Choose a meter; crossing between simple and compound swaps the rhythm selection. */
  function chooseMeter(ts: string) {
    const from = meterKindOf(selectedTimeSignature);
    const to = meterKindOf(ts);
    if (from !== to) {
      const switched = switchRhythmKind(rhythmMemory, from, to, selectedRhythms.map((r: Rhythm) => r.name));
      rhythmMemory = switched.memory;
      selectedRhythms = switched.selection;
    }
    selectedTimeSignature = ts;
  }
```

`DEFAULTS.rhythmNames` and `rhythmDirty` read the kind's defaults:

```ts
  $: rhythmDirty = JSON.stringify(selectedRhythms.map((r: Rhythm) => r.name).sort()) !==
    JSON.stringify([...DEFAULT_RHYTHM_NAMES[meterKindOf(selectedTimeSignature)]].sort());
```

(remove `rhythmNames` from `DEFAULTS`.)

In `openLinkedExercise` (line ~3083):

```ts
      if (score.timeSig.name in timeSignatures) chooseMeter(score.timeSig.name);
```

- [ ] **Step 4: The meter picker**

Replace the Time Signature block (lines ~3357-3367):

```svelte
            <div class="space-y-2">
              <p class="sr-label">Time Signature</p>
              {#each meterGroups as group}
                <p class="text-xs text-sr-faint">{group.label}</p>
                <div class="flex flex-wrap gap-2" role="group" aria-label="Time Signature: {group.label}">
                  {#each group.names as ts}
                    <button
                      class="sr-tok {selectedTimeSignature === ts ? 'sr-on' : ''}"
                      aria-pressed={selectedTimeSignature === ts}
                      on:click={() => chooseMeter(ts)}
                    >{ts}</button>
                  {/each}
                </div>
              {/each}
              {#if meterKindOf(selectedTimeSignature) === "compound"}
                <p class="text-xs text-sr-faint">
                  Felt in dotted-quarter beats: the tempo counts ♩., and the rhythms are compound figures.
                </p>
              {/if}
            </div>
```

The rhythm tab already renders `rhythmPickerGroups(filterRhythms)`, which now gives Core / Rests / Sixteenths in compound meter. URL loading needs no change: `loadStateFromUrl` already accepts any key of `timeSignatures` (now all six) and any catalogue name, and `stateFromOptions` resolves the names by the meter's kind.

- [ ] **Step 5: Run checks**

Run: `bun run test 2>&1 | tail -6 && bunx astro check 2>&1 | tail -3`
Expected: `0 fail`; `0 errors`, `0 warnings`.

Run: `bun run dev` in the background, open `http://localhost:4321/sightreading`, and check: the meter picker shows Simple (2/4 3/4 4/4) and Compound (6/8 9/8 12/8); 4/4 -> 6/8 shows only Core/Rests/Sixteenths with Core ticked; tick Sixteenths' six sixteenths, go 6/8 -> 4/4 (your simple selection is back) -> 9/8 (six sixteenths still ticked); the playback bar reads `♩. =` in 9/8 and `♩ =` in 4/4 with the same number; Generate in 6/8 draws an exercise; reload keeps 6/8 and its selection; the Choral page still offers only 4/4 3/4 2/4. Stop the dev server.

- [ ] **Step 6: Commit**

```bash
git add src/lib/selectable-rhythms.ts src/components/AbcjsSingle.svelte tests/unit/rhythm-selection.test.ts
git commit -m "feat: Unison offers 6/8, 9/8 and 12/8, and the rhythm picker follows the meter's kind"
```

---

### Task 12: The sweep, the guide and the docs

**Files:**
- Modify: `scripts/sweep.ts:139-164`
- Modify: `src/pages/how-to-use.astro:38-44`
- Modify: `notes/uil-criteria.md:144`, `:175`
- Modify: `docs/ROADMAP.md:13`
- Modify: `src/lib/uil-presets.ts:21-28`
- Modify: `tests/unit/uil-presets.test.ts:30-32`
- Modify: `CLAUDE.md` (a "Meters" section; the check-rhythm list)

**Interfaces:**
- Consumes: `COMPOUND_METER_NAMES`, `timeSignatureFor` (Task 2); `DEFAULT_RHYTHM_NAMES` (Task 11); `createNewSr` compound (Tasks 6-8).
- Produces: compound Unison cells in the sweep; corrected docs.

- [ ] **Step 1: Sweep compound cells**

In `scripts/sweep.ts`, add imports:

```ts
import { COMPOUND_METER_NAMES, timeSignatureFor } from "../src/lib/meter";
import { DEFAULT_RHYTHM_NAMES } from "../src/lib/selectable-rhythms";
```

After the existing unison loop:

```ts
// ------------------------------------------------------- unison, compound
// Choral offers no compound meter; Unison and rhythm-only do, with the Core
// set the picker starts on.
const COMPOUND_UNISON_RHYTHMS = DEFAULT_RHYTHM_NAMES.compound;
for (const rhythmOnly of [false, true]) {
  for (const tsName of COMPOUND_METER_NAMES) {
    for (const clef of ["treble", "bass", "alto", "tenor"]) {
      for (const measures of [1, 2, 4, 8, 16]) {
        if (rhythmOnly && clef !== "treble") continue;
        run(`unison ${rhythmOnly ? "rhythm" : "pitched"} | ${clef} | ${tsName} | ${measures}m`, () => {
          createNewSr({
            bpm: 60, clef, selectedClef: clef,
            timeSig: timeSignatureFor(tsName), selectedTimeSignature: tsName,
            measures, maxSkip: 4, tempo: 60, range: { min: 14, max: 21 },
            selectedRhythms: COMPOUND_UNISON_RHYTHMS,
            rhythms: allRhythms.filter((r) => COMPOUND_UNISON_RHYTHMS.includes(r.name)),
            scaleDegrees: new Set([1, 2, 3, 4, 5, 6, 7]),
            key: "C", chords: ["1", "2", "3", "4", "5", "6", "7"],
            showSolfege: !rhythmOnly, rhythmOnly,
            showRhythmSyllables: true, syllableSystemId: "counting",
            partsObject: { numofParts: 1, parts: { Unison: {
              chordNoteObject: [], order: 0, smallName: "U", selectedRange: [14, 21] } } },
          } as any);
        });
      }
    }
  }
}
```

Update the header comment's first paragraph to add "and Unison's compound meters".

Run: `bun run sweep 2>&1 | tee /private/tmp/sweep-compound.txt | tail -40`
Expected: about 75 more cells than before; `grep -E "\| (6|9|12)/8 \|" /private/tmp/sweep-compound.txt` prints nothing under "worst cells" (compound cells at 0%); total failures within noise (under ~25) of the last recorded figure in CLAUDE.md.

- [ ] **Step 2: The guide**

In `src/pages/how-to-use.astro`, after the "Sight-singing one line" paragraph and before its `<div>`:

```astro
    <p>
      Unison also writes compound meter: 6/8, 9/8 and 12/8, felt in dotted-quarter beats - two, three or four to a
      bar. The tempo counts dotted quarters (♩. = 60), the click sounds once a beat, and the count-in counts beats,
      not eighths. The rhythms change with the meter: three eighths, quarter-eighth, the dotted quarter and dotted
      half, with rests and sixteenths when you want them. Counting reads 1 la li, Kodály ti ti ti, and your own
      syllables can have compound words of their own. Choral exercises stay in simple meter for now.
    </p>
```

- [ ] **Step 3: UIL docs say what UIL choir actually tests**

`notes/uil-criteria.md` - Level 4's meter list (line 144) becomes:

```markdown
- 3/4, 4/4
```

and Level 5's (line 175):

```markdown
- All simple meters
```

with this note directly under the Level 4 "### Meter" heading:

```markdown
> UIL choir sight-reading does not use compound meter. This page once listed 6/8 here and "all simple and compound meters" at level 5, which was wrong for choir.
```

`docs/ROADMAP.md:13` becomes:

```markdown
- [x] **Compound time (6/8, 9/8, 12/8)** — Unison and rhythm-only (October 2026); Choral to follow. Not a UIL choir requirement: UIL choir sight-reading is simple meter only.
```

`src/lib/uil-presets.ts` - the `allowedMeters` comment becomes:

```ts
  /**
   * Meters the level permits, from notes/uil-criteria.md.
   *
   * These were stated in the criteria and nowhere in the code, so choosing a
   * level left every meter available - level 2 and 3 are 3/4 and 4/4 only, and
   * both offered 2/4. UIL choir sight-reading is simple meter only, so no level
   * lists a compound meter (the criteria once said 6/8 at level 4, in error).
   */
```

`tests/unit/uil-presets.test.ts:30-32` - the comment becomes:

```ts
    // notes/uil-criteria.md: level 1 is 2/4, 3/4, 4/4; levels 2 to 4 are 3/4
    // and 4/4; level 5 is all simple meters. UIL choir does not use compound meter.
```

- [ ] **Step 4: CLAUDE.md**

Add after the "### The ladder" section:

```markdown
### Meters

`src/lib/meter.ts` is the one meter model: 2/4, 3/4, 4/4 and the compound 6/8,
9/8, 12/8, whose beat is the dotted quarter (`beatUnits` 12, three eighths a
beat). It is derived from the metronome's table (`src/lib/tuner/meters.ts`).
Beats, beat length, subdivision and the tempo mark (`Q:3/8=` in compound) all
come from it - never from the top number (12/8 is four beats) and never from
bar length (3/4 and 6/8 are both 24 units). A `TimeSignature` carries
`beatUnits` (it was `beamGroupSize`; old links still open).

Compound meter is Unison and rhythm-only; Choral offers simple meters only.
Compound figures (`meterKind: "compound"` in rhythms.ts) fill whole beats, and
`src/lib/compound-rhythm.ts` fills bars beat by beat with an exact search, so
it fails exactly where `rhythm-feasibility`'s compound branch finds no tiling.
abcjs counts `qpm` in the meter's own beat, so playback passes the page's BPM
unchanged; a MIDI file needs the Q: line, which `midiFileFor` writes.

`tests/unit/meter-regression.test.ts` freezes simple-meter Unison and Choral
output for fixed seeds. Never update its snapshot to make it pass: a failure
means a change reached simple meter.
```

and in the check-rhythm bullet list, change the first bullet to "every emitted measure sums to exactly one measure (2/4, 3/4, 4/4, 6/8, 9/8, 12/8), and in compound meter no figure crosses a beat" and add "a compound tie joins whole dotted-quarter beats".

- [ ] **Step 5: Run checks**

Run: `bun run test 2>&1 | tail -6 && bunx astro check 2>&1 | tail -3`
Expected: `0 fail`; `0 errors`, `0 warnings`.

- [ ] **Step 6: Commit**

```bash
git add scripts/sweep.ts src/pages/how-to-use.astro notes/uil-criteria.md docs/ROADMAP.md src/lib/uil-presets.ts \
  tests/unit/uil-presets.test.ts CLAUDE.md
git commit -m "docs: compound meter in the guide and the sweep, and UIL choir is simple meter only"
```

---

### Task 13: Verify the whole of it

**Files:** none changed (fix-forward in the owning task's files if anything fails, then re-run this task).

- [ ] **Step 1: The gates**

Run: `bun run test 2>&1 | tail -6`
Expected: `0 fail` (about 1,000 pass, 5 skip).

Run: `bunx astro check 2>&1 | tail -3`
Expected: `0 errors`, `0 warnings`.

Run: `bun run check:rhythm 2>&1 | tail -10`
Expected: `all checks passed`, with compound selections, compound ties and compound syllable mappings counted.

Run: `bun run scripts/check-ladder.ts 2>&1 | tail -5`
Expected: no failing step (the ladder is simple meter; this proves the refactor left it alone).

Run: `git log --oneline -- tests/unit/__snapshots__/meter-regression.test.ts.snap && git status --short tests/unit/__snapshots__`
Expected: exactly one commit (Task 1's) touched the snapshot, and it has no uncommitted change.

- [ ] **Step 2: The sweep**

Use the Task 12 sweep run if nothing in `src/lib` changed since; otherwise run `bun run sweep 2>&1 | tail -40` again.
Expected: no new failing cells; every compound cell at 0%.

- [ ] **Step 3: Play it in the browser**

Start `bun run dev` in the background and open `http://localhost:4321/sightreading`. For each of 6/8, 9/8 and 12/8, 8 bars, Core plus the six-sixteenths figure, pitched treble, then rhythm-only:

- Beaming: eighths beam in threes, one group per dotted-quarter beat; no quarter is beamed; a rest breaks a beam.
- 9/8's last bar shows a dotted half tied to a dotted quarter; 12/8's a dotted whole; bar 4 ends on a held note and a dotted-quarter rest (or pickup).
- Syllables: switch rhythm syllables on - Counting reads `1 la li`, `1 ta la ta li ta`; Kodály `ti ti ti`. With "Mine" saved without compound words, compound reads as Counting.
- Playback at ♩. = 60: a 6/8 bar lasts two seconds (time four bars against a clock: about 8 s), the click sounds 2 / 3 / 4 times a bar with beat one accented, the count-in says "1, 2, Ready, Go" over two bars in 6/8 and "1, Ready, Go" in 9/8.
- The tempo label reads `♩. =` in compound and `♩ =` in simple, and the number does not change when switching.
- Share the exercise link, open it in a new tab: the same exercise, meter and selection.
- Export MIDI and open it: the dotted quarter plays at 60.
- The Choral page offers 4/4, 3/4, 2/4 only and plays as before.

Stop the dev server. Record anything wrong as a fix in the owning task's files, then repeat this task.
