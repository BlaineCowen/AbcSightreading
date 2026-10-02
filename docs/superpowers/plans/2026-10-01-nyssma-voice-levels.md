# NYSSMA Voice Levels I-V (Unison) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teachers can pick NYSSMA Voice Level I-V on the Unison page and get exercises that follow that level's chart, above all its interval rules ("Do-Mi-Sol ascending", landing on quarters). Any teacher can use the same rules through a "Custom skips" mode.

**Architecture:** A new pure module `src/lib/skip-policy.ts` holds the move rule (`isAllowedMove`, `largestSkip`). Every inline `Math.abs(a - b) <= maxSkip` check in `src/lib/generateUnison.ts` goes through it, and a fixed-seed snapshot proves Max skip mode writes byte-identical output. UI state, persistence and URL encoding live in small pure modules (`skip-settings.ts`, `unison-pools.ts`, `dynamics.ts`, `nyssma-presets.ts`), each unit-tested. `AbcjsSingle.svelte` and `PresetDropdown.svelte` only wire them up. Dynamics are drawn per phrase onto the exercise's data (`UnisonScore.dynamics`) and written as ABC decorations. abcjs turns those into note velocity.

**Tech Stack:** Astro 4 + Svelte 4 + TypeScript, bun 1.3 (`bun test`), abcjs 6.4.4.

**Spec:** `docs/superpowers/specs/2026-10-01-nyssma-voice-levels-design.md`. Source chart, as the owner checked it: `/Users/blainecowen/Documents/Obsidian/Blaine-learn/Dev-stuff/NYSSMA Sight Reading Criteria (transcribed).md` (read only).

## Global Constraints

- Tooling is bun. Run unit tests with `bun run test`, not bare `bun test`, because the script passes `--timeout 30000`. Type-check with `bunx astro check`, which must report **0 errors and 0 warnings**.
- **Known baseline failure:** on this machine `bun run test` has exactly ONE pre-existing failure, `tests/unit/exercise-link.test.ts`. bun 1.3.0 cannot parse a raw control-character regex at `src/lib/exercise-link.ts:373`. Expect it and leave it alone. Every other test must pass.
- **Max skip mode must write output identical to today's.** The snapshot from Task 1 guards this, and it must stay green from Task 1 to the end without `--update-snapshots`.
- In scope: Levels I-V on the Unison page only. Out of scope: **Level VI** (it needs compound meter, triplet eighths and hairpins) and skip lists in Choral.
- A separate compound-meter plan (`2026-10-01-compound-meter-unison-design.md`) will also touch `generateUnison.ts` and `AbcjsSingle.svelte`. This plan must not depend on it. Levels I-V use the simple meters `4/4`, `3/4` and `2/4` only. If that plan lands first, re-read the files and keep its changes.
- Another agent is editing `src/` in parallel: `PlaybackBar.svelte`, `voice-texture.ts`, `AbcjsChoral.svelte` ranges and `AbcjsSingle.svelte` playback state. Re-read a file right before editing it.
- Stage explicit paths only, never `git add -A` or `git add .`. Before committing `src/components/AbcjsSingle.svelte`, run `git diff src/components/AbcjsSingle.svelte`. If it holds hunks this task did not write, stop and ask; do not commit someone else's work.
- Commit messages follow the repo's log: `feat: plain sentence` (or `test:` / `chore:`). **No `Co-Authored-By` or any other attribution trailer.** The user's global CLAUDE.md overrides the harness default.
- Units:
  - `pitchValue` indexes `src/resources/noteArray.ts`, which is **diatonic** (seven to the octave, `C` = C4 = 14). So a distance of 1 is a 2nd, 2 a 3rd, 3 a 4th, 4 a 5th and 7 an octave.
  - The generator's `degree` is **0-based** (do = 0). The UI and `SkipMove` use **1-7**.
  - Lengths are in 32nds: eighth 4, quarter 8, dotted quarter 12, half 16.
- UI copy is exactly as the spec writes it:
  - Mode toggle: `Max skip` / `Custom skips`, plus `+ Add skip` and `Skips land on`.
  - Chips: `Do-Mi-Sol ↑`, `Do-Sol ↑`, `Sol-Mi-Do ↓`, `Sol-Do ↓`, `Do-Sol ↓`, `Sol-Ti-Re ↑`, `Tonic triad ↕`, `4ths & 5ths ↕`, `Clear`.
  - Direction labels: `↑ ascending`, `↓ descending`, `↕ both`.
  - Picker tab: `NYSSMA Voice`.
- Defaults that keep current users unchanged:
  - Skips: Max skip mode. "Skips land on" has every box on, which means no limit.
  - Dynamics: Off.
  - Presets and links without the new fields load in Max skip mode, with one key and one meter.
- Colours use `sr-*` tokens only, never Tailwind's palette (CLAUDE.md "Look").
- NYSSMA presets: every level sets tempo quarter = 72 and 8 measures. Clef and pitch range stay the teacher's: the level's span around do is placed on the do at or above the teacher's range, the way ladder steps do it.

## Review Focus

1. **A rest between two notes hiding a forbidden skip** (Level II: do, rest, sol). Expected: the skip is measured between the notes actually sung, so do→sol is refused. Pinned in Task 4 (`unison-custom-skips.test.ts`, rests in the rhythm list) and checked again in Task 12 (`check-nyssma` measures sung pairs only).
2. **A key pool moving the range up or down with each Generate.** The span is re-placed on "the do at or above the current min", which ratchets. Expected: the range stays in the teacher's octave however many keys are drawn. Pinned in Task 7 (`rangeForSpan` from a fixed `rangeAnchor`; `setupSnapshot` test). Task 11 re-applies a level without moving the anchor.
3. **Generate marking a preset "edited".** Drawing a new key or meter changes `selectedKey`, `selectedTimeSignature` and `selectedRange`. Expected: the "edited" badge appears only when the teacher changes a setting. Pinned in Task 7 (`setupSnapshot` is built from the pools, never the drawn key) and checked in the browser in Task 13.
4. **A custom list that cannot connect the selected notes** (1, 3, 5 with only Do-Mi-Sol ↑). Expected: a plain message before generating, not "increase Max Skip". Pinned in Task 5 (`degreesConnected`) and wired in Task 6.
5. **Old saved presets, localStorage and links** (only `maxSkip`, one `key`, no `dynamics`). Expected: they load exactly as before (Max skip mode, that key and meter, dynamics left alone or Off). Pinned in Task 5 (`skipSettingsFrom({maxSkip: 3})`, `readSkipParams` on an old link), Task 7 (`poolFrom` with a single key) and Task 8 (`dynamicsSetFrom(undefined)`).

---

## File map

| File | Status | Responsibility |
|---|---|---|
| `src/lib/skip-policy.ts` | create | The move rule: `SkipPolicy`, `isAllowedMove`, `largestSkip`, `toSkipPolicy` |
| `src/lib/skip-settings.ts` | create | UI and persistence for skips: chips, rows, land-on, presets and URL, `degreesConnected` |
| `src/lib/unison-pools.ts` | create | Key and meter pools, span parsing, the canonical setup snapshot |
| `src/lib/dynamics.ts` | create | Marks, phrase starts, drawing, parsing and validation |
| `src/lib/nyssma-presets.ts` | create | Levels I-V as data, plus `nyssmaGenerationParams` |
| `src/lib/generateUnison.ts` | modify | Skip checks go through `isAllowedMove`; a rest holds the line in custom mode; `UnisonScore.dynamics`; `!mf!` decorations; `withDynamics` |
| `src/lib/ladder.ts` | modify | `rangeForSpan`, which `rangeForStep` then uses |
| `src/lib/exercise-link.ts` | modify | Links carry `dy` (dynamics) |
| `src/components/AbcjsSingle.svelte` | modify | Skips UI, pools, dynamics control, NYSSMA apply and restore |
| `src/components/PresetDropdown.svelte` | modify | A `NYSSMA Voice` tab |
| `scripts/check-nyssma.ts` | create | Property check per level × key × meter |
| `scripts/sweep.ts` | modify | NYSSMA cells |
| `package.json`, `CLAUDE.md` | modify | `check:nyssma` script and its docs |
| `tests/unit/unison-skip-regression.test.ts` (+ `__snapshots__/`) | create | Fixed-seed guard |
| `tests/unit/skip-policy.test.ts`, `skip-settings.test.ts`, `unison-custom-skips.test.ts`, `unison-pools.test.ts`, `dynamics.test.ts`, `nyssma-presets.test.ts` | create | Unit tests |
| `tests/unit/ladder.test.ts`, `tests/unit/exercise-link.test.ts` | modify | `rangeForSpan`; dynamics through a link |

---

### Task 1: Pin today's Unison output with a fixed-seed snapshot

**Files:**
- Create: `tests/unit/unison-skip-regression.test.ts`
- Create (generated by bun): `tests/unit/__snapshots__/unison-skip-regression.test.ts.snap`

**Interfaces:**
- Consumes: `createNewSr(params)` from `src/lib/generateUnison.ts` (today's signature, `maxSkip: number`).
- Produces: the exported helpers inside the test file, `CASES`, `generate(c, seed, maxSkip?)` and `mulberry32`. Task 3 appends a test to this file that uses them.

This must run against the code as it is now, before anything else changes. `createNewSr` draws only from `Math.random`, so swapping `Math.random` for a seeded generator makes it repeatable. This was verified: the same seed gave identical ABC twice.

- [ ] **Step 1: Write the snapshot test**

```ts
import { describe, expect, test } from "bun:test";
import { createNewSr } from "../../src/lib/generateUnison";
import { selectableRhythms } from "../../src/lib/selectable-rhythms";

/**
 * Unison output, fixed seed, Max skip mode - written BEFORE the skip checks
 * moved into src/lib/skip-policy.ts (NYSSMA Voice levels), so the move can be
 * proven to change nothing: every ABC string in the snapshot must stay
 * byte-identical. If a deliberate generator change moves it later, refresh
 * with `bun test tests/unit/unison-skip-regression.test.ts --update-snapshots`
 * and say why in the commit.
 *
 * createNewSr draws only from Math.random, so a seeded Math.random makes it
 * repeatable.
 */

/** A small seeded generator, so a run can be repeated exactly. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const METERS = {
  "4/4": { name: "4/4", tsPerMeasure: 32, beamGroupSize: 8 },
  "3/4": { name: "3/4", tsPerMeasure: 24, beamGroupSize: 8 },
  "2/4": { name: "2/4", tsPerMeasure: 16, beamGroupSize: 8 },
} as const;

export type Case = {
  label: string;
  key: string;
  meter: keyof typeof METERS;
  maxSkip: number;
  degrees: number[];
  rhythms: string[];
  measures: number;
  range?: { min: number; max: number };
  clef?: string;
  sharps?: number[];
  flats?: number[];
  moveEighths?: boolean;
  followStep?: boolean;
  ties?: boolean;
  rhythmOnly?: boolean;
};

const ALL = [1, 2, 3, 4, 5, 6, 7];
export const CASES: Case[] = [
  { label: "stepwise do-so", key: "C", meter: "4/4", maxSkip: 1, degrees: [1, 2, 3, 4, 5], rhythms: ["quarter", "half"], measures: 8, range: { min: 14, max: 18 } },
  { label: "triad skips", key: "F", meter: "4/4", maxSkip: 4, degrees: [1, 3, 5], rhythms: ["quarter", "eighthEighth"], measures: 8 },
  { label: "thirds with rests", key: "G", meter: "3/4", maxSkip: 2, degrees: ALL, rhythms: ["quarter", "half", "quarterRest"], measures: 8 },
  { label: "fourths in 2/4, eighths move", key: "D", meter: "2/4", maxSkip: 3, degrees: ALL, rhythms: ["quarter", "eighthEighth"], measures: 8, moveEighths: true },
  { label: "fifths, dotted, Eb", key: "Eb", meter: "4/4", maxSkip: 4, degrees: ALL, rhythms: ["quarter", "half", "dotQuarterEighth"], measures: 8 },
  { label: "octave, 16 bars", key: "Bb", meter: "4/4", maxSkip: 7, degrees: ALL, rhythms: ["quarter", "half", "eighthEighth", "quarterRest"], measures: 16, range: { min: 12, max: 24 } },
  { label: "ninth, bass clef", key: "A", meter: "3/4", maxSkip: 8, degrees: ALL, rhythms: ["quarter", "half", "dotHalf"], measures: 8, clef: "bass", range: { min: 7, max: 14 } },
  { label: "fi in G, step rule on", key: "G", meter: "4/4", maxSkip: 2, degrees: ALL, rhythms: ["quarter", "half"], measures: 8, sharps: [4], followStep: true, range: { min: 14, max: 25 } },
  { label: "te in F, step rule off", key: "F", meter: "4/4", maxSkip: 3, degrees: ALL, rhythms: ["quarter", "eighthEighth"], measures: 8, flats: [7], followStep: false, range: { min: 14, max: 25 } },
  { label: "ties across barline", key: "C", meter: "3/4", maxSkip: 2, degrees: [1, 2, 3, 4, 5], rhythms: ["quarter", "half", "dotHalf"], measures: 8, ties: true },
  { label: "one bar", key: "E", meter: "4/4", maxSkip: 2, degrees: [1, 2, 3, 4, 5], rhythms: ["quarter"], measures: 1 },
  { label: "rhythm only", key: "C", meter: "4/4", maxSkip: 4, degrees: [1, 3, 5], rhythms: ["quarter", "eighthEighth", "quarterRest"], measures: 4, rhythmOnly: true },
];

const quiet = () => {};

/** One exercise's ABC, or "ERROR: <message>" - a failure must stay the same failure. */
export function generate(c: Case, seed: number, maxSkip: unknown = c.maxSkip): string {
  const realRandom = Math.random;
  const saved = { log: console.log, warn: console.warn, error: console.error };
  Math.random = mulberry32(seed);
  Object.assign(console, { log: quiet, warn: quiet, error: quiet });
  try {
    const clef = c.clef ?? "treble";
    const result: any = createNewSr({
      bpm: 60, tempo: 60, clef, selectedClef: clef,
      timeSig: METERS[c.meter], selectedTimeSignature: c.meter,
      measures: c.measures, maxSkip, range: c.range ?? { min: 14, max: 21 },
      rhythms: selectableRhythms.filter((r) => c.rhythms.includes(r.name)),
      selectedRhythms: c.rhythms, scaleDegrees: c.degrees,
      selectedSharpDegrees: c.sharps ?? [], selectedFlatDegrees: c.flats ?? [],
      key: c.key, showSolfege: !c.rhythmOnly, lyricSystem: "movable",
      rhythmOnly: c.rhythmOnly === true, showRhythmSyllables: true, syllableSystemId: "kodaly",
      allowTiesAcrossBarline: c.ties === true, moveOnEighthNotes: c.moveEighths === true,
      accidentalsFollowStep: c.followStep === true,
      partsObject: { numofParts: 1, parts: { Unison: { order: 0, smallName: "U" } } },
    } as any);
    return result[0] as string;
  } catch (e) {
    return `ERROR: ${e instanceof Error ? e.message : String(e)}`;
  } finally {
    Math.random = realRandom;
    Object.assign(console, saved);
  }
}

describe("unison output in Max skip mode, fixed seed", () => {
  test("is unchanged", () => {
    const out: Record<string, string> = {};
    for (const c of CASES) for (const seed of [1, 2, 3]) out[`${c.label} #${seed}`] = generate(c, seed);
    // Mostly music, not errors: a snapshot of failures would guard nothing.
    expect(Object.values(out).filter((s) => s.startsWith("ERROR")).length).toBeLessThan(4);
    expect(out).toMatchSnapshot();
  });
});
```

- [ ] **Step 2: Run it to write the snapshot**

Run: `bun test tests/unit/unison-skip-regression.test.ts`
Expected: `1 pass`, and bun reports a snapshot written to `tests/unit/__snapshots__/unison-skip-regression.test.ts.snap`. This must not run with `CI=true`, because bun refuses to create snapshots in CI.

- [ ] **Step 3: Run it again to confirm it is deterministic**

Run: `bun test tests/unit/unison-skip-regression.test.ts` (twice more)
Expected: `1 pass` both times, with no snapshot written or updated.

- [ ] **Step 4: Commit**

```bash
git add tests/unit/unison-skip-regression.test.ts tests/unit/__snapshots__/unison-skip-regression.test.ts.snap
git commit -m "test: pin unison output in Max skip mode before the skip rules move"
```

---

### Task 2: `skip-policy.ts`, the move rule

**Files:**
- Create: `src/lib/skip-policy.ts`
- Test: `tests/unit/skip-policy.test.ts`

**Interfaces:**
- Produces:
  - `type SkipDir = "up" | "down" | "both"`
  - `interface SkipMove { from: number; to: number; dir: SkipDir }`. `from` and `to` are scale degrees 1-7.
  - `type SkipPolicy = { kind: "max"; maxSkip: number } | { kind: "custom"; moves: SkipMove[]; landOn?: number[] }`. `landOn` holds lengths in 32nds.
  - `interface SkipNote { pitchValue: number; degree: number; chromatic?: boolean }`. `degree` is 0-based, as in the generator.
  - `isAllowedMove(prev: SkipNote, next: SkipNote, nextLength: number, policy: SkipPolicy): boolean`
  - `largestSkip(policy: SkipPolicy): number`
  - `toSkipPolicy(value: unknown): SkipPolicy`. A number becomes `{kind:"max"}`; junk becomes `{kind:"max", maxSkip: 4}`.
  - `isSkipMove(v: unknown): v is SkipMove`
  - `STEP_ONLY: SkipPolicy` (`{kind:"max", maxSkip:1}`) and `DEFAULT_MAX_SKIP = 4`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, test } from "bun:test";
import {
  isAllowedMove, largestSkip, toSkipPolicy, STEP_ONLY, type SkipPolicy,
} from "../../src/lib/skip-policy";

/**
 * The move rule. A note in C major: pitchValue indexes noteArray, which is
 * diatonic (C4 = 14, so a distance of 2 is a 3rd), and degree is 0-based.
 */
const n = (pitchValue: number, chromatic = false) => ({ pitchValue, degree: pitchValue % 7, chromatic });
const [G3, C4, D4, E4, F4, G4, C5, E5] = [11, 14, 15, 16, 17, 18, 21, 23];
const EIGHTH = 4, QUARTER = 8, HALF = 16;
const LEVEL_II: SkipPolicy = {
  kind: "custom",
  moves: [{ from: 1, to: 3, dir: "up" }, { from: 3, to: 5, dir: "up" }],
  landOn: [QUARTER],
};

describe("isAllowedMove", () => {
  test("re↑fa is refused at Level II", () => {
    expect(isAllowedMove(n(D4), n(F4), QUARTER, LEVEL_II)).toBe(false);
  });

  test("do↑mi is allowed in any octave, and so is mi↑sol", () => {
    expect(isAllowedMove(n(C4), n(E4), QUARTER, LEVEL_II)).toBe(true);
    expect(isAllowedMove(n(C5), n(E5), QUARTER, LEVEL_II)).toBe(true);
    expect(isAllowedMove(n(7), n(9), QUARTER, LEVEL_II)).toBe(true); // C3 to E3
    expect(isAllowedMove(n(E4), n(G4), QUARTER, LEVEL_II)).toBe(true);
  });

  test("do↓mi and mi↓do are refused when only ↑ is listed", () => {
    expect(isAllowedMove(n(C5), n(E4), QUARTER, LEVEL_II)).toBe(false);
    expect(isAllowedMove(n(E4), n(C4), QUARTER, LEVEL_II)).toBe(false);
  });

  test("a 10th is refused for a 1↑3 row: listed skips are simple intervals", () => {
    expect(isAllowedMove(n(C4), n(E5), QUARTER, LEVEL_II)).toBe(false);
  });

  test("a skip onto an eighth (or a half) is refused when skips land on quarters", () => {
    expect(isAllowedMove(n(C4), n(E4), EIGHTH, LEVEL_II)).toBe(false);
    expect(isAllowedMove(n(C4), n(E4), HALF, LEVEL_II)).toBe(false);
    const anywhere: SkipPolicy = { kind: "custom", moves: LEVEL_II.kind === "custom" ? LEVEL_II.moves : [] };
    expect(isAllowedMove(n(C4), n(E4), EIGHTH, anywhere)).toBe(true);
  });

  test("steps and repeated notes are always allowed, on any length", () => {
    const policies: SkipPolicy[] = [LEVEL_II, { kind: "custom", moves: [] }, STEP_ONLY, { kind: "max", maxSkip: 3 }];
    for (const p of policies) {
      for (const len of [EIGHTH, QUARTER, HALF]) {
        expect(isAllowedMove(n(C4), n(D4), len, p)).toBe(true);
        expect(isAllowedMove(n(D4), n(C4), len, p)).toBe(true);
        expect(isAllowedMove(n(C4), n(C4), len, p)).toBe(true);
      }
    }
  });

  test("in custom mode a chromatic note is reached and left only by step", () => {
    const doMi: SkipPolicy = { kind: "custom", moves: [{ from: 1, to: 3, dir: "both" }] };
    expect(isAllowedMove(n(C4), n(E4, true), QUARTER, doMi)).toBe(false);
    expect(isAllowedMove(n(C4, true), n(E4), QUARTER, doMi)).toBe(false);
    expect(isAllowedMove(n(D4), n(E4, true), QUARTER, doMi)).toBe(true);
    // Max skip mode is today's rule, which never looked at alterations.
    expect(isAllowedMove(n(C4), n(E4, true), QUARTER, { kind: "max", maxSkip: 4 })).toBe(true);
  });

  test("max mode is exactly today's rule: diatonic distance <= maxSkip", () => {
    for (let d = 0; d <= 9; d++) {
      expect(isAllowedMove(n(C4), n(C4 + d), QUARTER, { kind: "max", maxSkip: 4 })).toBe(d <= 4);
      expect(isAllowedMove(n(C4), n(C4 + d), EIGHTH, STEP_ONLY)).toBe(d <= 1);
    }
  });

  test("↕ both allows either direction; Do-Sol ↓ is the 4th down to the sol below", () => {
    const both: SkipPolicy = { kind: "custom", moves: [{ from: 1, to: 5, dir: "both" }] };
    expect(isAllowedMove(n(C4), n(G4), QUARTER, both)).toBe(true); // a 5th up
    expect(isAllowedMove(n(C4), n(G3), QUARTER, both)).toBe(true); // a 4th down
    expect(isAllowedMove(n(G4), n(C4), QUARTER, both)).toBe(false); // sol→do is not listed
    const doSolDown: SkipPolicy = { kind: "custom", moves: [{ from: 1, to: 5, dir: "down" }] };
    expect(isAllowedMove(n(C4), n(G3), QUARTER, doSolDown)).toBe(true);
    expect(isAllowedMove(n(C4), n(G4), QUARTER, doSolDown)).toBe(false);
  });
});

describe("largestSkip", () => {
  test("is maxSkip, or the widest listed interval, or 1 for stepwise only", () => {
    expect(largestSkip({ kind: "max", maxSkip: 4 })).toBe(4);
    expect(largestSkip({ kind: "custom", moves: [] })).toBe(1);
    expect(largestSkip(LEVEL_II)).toBe(2);
    expect(largestSkip({ kind: "custom", moves: [{ from: 1, to: 5, dir: "up" }] })).toBe(4);
    expect(largestSkip({ kind: "custom", moves: [{ from: 1, to: 5, dir: "down" }] })).toBe(3);
    expect(largestSkip({ kind: "custom", moves: [{ from: 1, to: 5, dir: "both" }] })).toBe(4);
  });
});

describe("toSkipPolicy", () => {
  test("wraps a number as Max skip, at least a step", () => {
    expect(toSkipPolicy(3)).toEqual({ kind: "max", maxSkip: 3 });
    expect(toSkipPolicy(0)).toEqual({ kind: "max", maxSkip: 1 });
    expect(toSkipPolicy({ kind: "max", maxSkip: 2 })).toEqual({ kind: "max", maxSkip: 2 });
  });

  test("keeps only well-formed rows and lengths", () => {
    expect(
      toSkipPolicy({
        kind: "custom",
        moves: [{ from: 1, to: 3, dir: "up" }, { from: 1, to: 1, dir: "up" }, { from: 9, to: 3, dir: "up" }, "x"],
        landOn: [8, "q", -1],
      })
    ).toEqual({ kind: "custom", moves: [{ from: 1, to: 3, dir: "up" }], landOn: [8] });
    expect(toSkipPolicy({ kind: "custom", moves: [], landOn: [] })).toEqual({ kind: "custom", moves: [] });
  });

  test("falls back to the page's default Max skip", () => {
    expect(toSkipPolicy(undefined)).toEqual({ kind: "max", maxSkip: 4 });
    expect(toSkipPolicy("nonsense")).toEqual({ kind: "max", maxSkip: 4 });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun test tests/unit/skip-policy.test.ts`
Expected: FAIL. `Cannot find module '../../src/lib/skip-policy'`.

- [ ] **Step 3: Write the module**

```ts
/**
 * Which melodic moves a unison line may make (NYSSMA Voice levels spec).
 *
 * Two kinds: a largest skip (Max skip, the page's control since the start),
 * or a list of the skips allowed (Custom skips - NYSSMA's "Do-Mi-Sol
 * ascending"). A step or a repeated note is always allowed.
 *
 * Distances are diatonic: pitchValue indexes noteArray, seven to the octave,
 * so 1 is a 2nd, 2 a 3rd, 4 a 5th, 7 an octave. Moves name scale degrees 1-7;
 * the generator's own `degree` is 0-based (do = 0).
 */

export type SkipDir = "up" | "down" | "both";

/** One listed skip: from one scale degree (1-7) to another, in a direction. */
export interface SkipMove {
  from: number;
  to: number;
  dir: SkipDir;
}

export type SkipPolicy =
  | { kind: "max"; maxSkip: number }
  /** `landOn`: the note lengths (32nds) a skip may land on; unset means any. */
  | { kind: "custom"; moves: SkipMove[]; landOn?: number[] };

/** A note as the rule sees it. `degree` is 0-based, as in the generator. */
export interface SkipNote {
  pitchValue: number;
  degree: number;
  /** Altered by the chord it is sung over (a selected chromatic degree). */
  chromatic?: boolean;
}

export const DEFAULT_MAX_SKIP = 4;
/** Step or repeat only: what an altered note's neighbour gets under "accidentals follow step". */
export const STEP_ONLY: SkipPolicy = { kind: "max", maxSkip: 1 };

const OCTAVE = 7;
const mod7 = (n: number) => ((n % 7) + 7) % 7;

/**
 * May the line move from `prev` to `next`, a note `nextLength` 32nds long?
 *
 * - A step or a repeat (distance <= 1): always.
 * - max: distance <= maxSkip - exactly the rule the generator always had.
 * - custom: never onto or off a chromatic note; a simple interval (less than
 *   an octave) whose degrees and direction match a listed move, in any
 *   octave; and, when `landOn` is set, onto one of those lengths.
 */
export function isAllowedMove(
  prev: SkipNote,
  next: SkipNote,
  nextLength: number,
  policy: SkipPolicy
): boolean {
  const rise = next.pitchValue - prev.pitchValue;
  const distance = Math.abs(rise);
  if (distance <= 1) return true;
  if (policy.kind === "max") return distance <= policy.maxSkip;
  if (prev.chromatic || next.chromatic) return false;
  if (distance >= OCTAVE) return false;
  if (policy.landOn && !policy.landOn.includes(nextLength)) return false;
  const from = mod7(prev.degree) + 1;
  const to = mod7(next.degree) + 1;
  const dir: SkipDir = rise > 0 ? "up" : "down";
  return policy.moves.some(
    (m) => m.from === from && m.to === to && (m.dir === "both" || m.dir === dir)
  );
}

/**
 * The widest move the policy allows, in diatonic steps - 1 when only steps
 * are allowed. The generator divides by it to estimate how many notes it
 * needs to get home.
 */
export function largestSkip(policy: SkipPolicy): number {
  if (policy.kind === "max") return policy.maxSkip;
  let widest = 1;
  for (const m of policy.moves) {
    if (m.dir !== "down") widest = Math.max(widest, mod7(m.to - m.from));
    if (m.dir !== "up") widest = Math.max(widest, mod7(m.from - m.to));
  }
  return widest;
}

const DIRS: readonly SkipDir[] = ["up", "down", "both"];
const isDegree = (v: unknown): v is number =>
  Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 7;

/** A well-formed row. From and to differ: a unison or an octave is not a skip. */
export function isSkipMove(v: unknown): v is SkipMove {
  if (!v || typeof v !== "object") return false;
  const m = v as Record<string, unknown>;
  return isDegree(m.from) && isDegree(m.to) && m.from !== m.to && DIRS.includes(m.dir as SkipDir);
}

/**
 * Whatever arrived as `maxSkip` - a number from older callers and scripts, or
 * a policy from the page (it crosses the wire as JSON) - as a policy.
 */
export function toSkipPolicy(value: unknown): SkipPolicy {
  if (typeof value === "number" && Number.isFinite(value)) {
    return { kind: "max", maxSkip: Math.max(1, Math.round(value)) };
  }
  if (value && typeof value === "object") {
    const v = value as Record<string, unknown>;
    if (v.kind === "max") return toSkipPolicy(v.maxSkip);
    if (v.kind === "custom") {
      const moves = Array.isArray(v.moves)
        ? v.moves.filter(isSkipMove).map((m) => ({ from: m.from, to: m.to, dir: m.dir }))
        : [];
      const landOn = Array.isArray(v.landOn)
        ? v.landOn.filter((l): l is number => Number.isInteger(l) && (l as number) > 0)
        : [];
      return landOn.length ? { kind: "custom", moves, landOn } : { kind: "custom", moves };
    }
  }
  return { kind: "max", maxSkip: DEFAULT_MAX_SKIP };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test tests/unit/skip-policy.test.ts`
Expected: PASS, every test.

- [ ] **Step 5: Commit**

```bash
git add src/lib/skip-policy.ts tests/unit/skip-policy.test.ts
git commit -m "feat: a skip policy - Max skip, or a list of the skips allowed and what they land on"
```

---

### Task 3: Every skip check in `generateUnison.ts` goes through the policy

**Files:**
- Modify: `src/lib/generateUnison.ts`. Line numbers are as of commit e0e7ae4; anchor on the text.
  - imports (top)
  - `GenerateChordParams.maxSkip` (~:148)
  - `generateChordProgression` (~:475-1284)
  - `generateChord` (~:1368-1669)
  - `createNewSrOnce` (~:2628)
- Test: `tests/unit/unison-skip-regression.test.ts` (append one test)

**Interfaces:**
- Consumes: `isAllowedMove`, `largestSkip`, `toSkipPolicy`, `STEP_ONLY`, `SkipPolicy` and `SkipNote` from Task 2. Also `generate` and `CASES` from Task 1's test file.
- Produces: `createNewSr(params)` now accepts `params.maxSkip` as either a `number` or a `SkipPolicy`. `generateChordProgression`'s 4th parameter is now `policy: SkipPolicy`. Inside it there is `activePolicy` (replacing `newMaxSkip`) and the helper `reaches(note, chord, i)`.

- [ ] **Step 1: Append the failing test**

Append to `tests/unit/unison-skip-regression.test.ts`:

```ts
describe("a Max skip policy object", () => {
  test("writes exactly what its number does", () => {
    for (const c of CASES.filter((c) => !c.rhythmOnly)) {
      for (const seed of [1, 2]) {
        expect(generate(c, seed, { kind: "max", maxSkip: c.maxSkip })).toBe(generate(c, seed));
      }
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun test tests/unit/unison-skip-regression.test.ts`
Expected: the new test FAILS. Comparing a number with an object is always false, so the policy runs come back `ERROR: Could not generate a melody...`. The snapshot test still passes.

- [ ] **Step 3: Import the policy**

At the top of `src/lib/generateUnison.ts`, after the `import type { Cadence, RhythmWithPattern } from "./types";` line:

```ts
import {
  isAllowedMove,
  largestSkip,
  toSkipPolicy,
  STEP_ONLY,
  type SkipNote,
  type SkipPolicy,
} from "./skip-policy";
```

- [ ] **Step 4: `GenerateChordParams` and `generateChord`**

In `interface GenerateChordParams`, change `  maxSkip: number;` to:

```ts
  /** The skip rule (skip-policy.ts). A number from older callers is wrapped in createNewSrOnce. */
  maxSkip: SkipPolicy;
```

In `generateChord`, `var maxSkip = params.maxSkip;` stays, but it is now a `SkipPolicy`. Its three checks read `Math.abs(note.pitchValue - prevNote.pitchValue) <= maxSkip`. That exact text appears only in `generateChord`. Replace all three with:

```ts
isAllowedMove(prevNote, note, noteLength, maxSkip)
```

`noteLength` is declared above them (`var noteLength = currentChord.length;`).

- [ ] **Step 5: `generateChordProgression`: signature, `leadsHome`, `activePolicy`**

Change the parameter `  maxSkip: number,` (the 4th parameter of `generateChordProgression`) to `  policy: SkipPolicy,`.

In `leadsHome`, replace `Math.abs(n.pitchValue - note.pitchValue) <= maxSkip` with:

```ts
isAllowedMove(note, n, randNoteLengths[randNoteLengths.length - 1], policy)
```

Replace `  let newMaxSkip = maxSkip;` with:

```ts
  /** The rule for the move into the note being chosen: the policy, or a step after an altered note. */
  let activePolicy: SkipPolicy = policy;
```

The initial `bassDegrees` (right after `let prevChord = {...}`) reads `Math.abs(note.pitchValue - prevBassNote.pitchValue) <= maxSkip &&`. Replace it with:

```ts
      isAllowedMove(prevBassNote, note, randNoteLengths[1] ?? 0, policy) &&
```

Right after `  var chordProgression: any[] = [];`, add:

```ts
  /** A note as the skip rule sees it: altered when this chord makes it so. */
  const sungNote = (note: Note, chord: Chord | undefined): SkipNote => ({
    pitchValue: note.pitchValue,
    degree: note.degree,
    chromatic: isChromaticIn(chord, note),
  });
  /**
   * May the line move from note i-1 to `note`, sung over `chord` (undefined
   * while no chord is chosen yet), under the rule in force for this note?
   * In Max skip mode this is exactly the old `distance <= newMaxSkip`.
   */
  const reaches = (note: Note, chord: Chord | undefined, i: number) =>
    isAllowedMove(
      sungNote(bassNoteArray[i - 1], chordProgression[i - 1]?.chord),
      sungNote(note, chord),
      randNoteLengths[i],
      activePolicy
    );
```

In the loop:
- `      newMaxSkip = maxSkip;`, the first statement of the `for`, becomes `      activePolicy = policy;`.
- In the `if (randNoteLengths[i] <= 4)` block, `// newMaxSkip = 1;` becomes `// activePolicy = STEP_ONLY;` and `newMaxSkip = maxSkip;` becomes `activePolicy = policy;`.
- In the `accidentalsFollowStep` block, `newMaxSkip = 1;` becomes `activePolicy = STEP_ONLY;` and `newMaxSkip = maxSkip;` becomes `activePolicy = policy;`.

- [ ] **Step 6: The move filters**

Do these in this order, because the last one is a replace-all:

1. The chord-free `bassDegrees` filter (after `prevChord = chordProgression[i - 1];`):

```ts
        bassDegrees = bassRangeNoteList.filter(
          (note) =>
            Math.abs(note.pitchValue - prevBassNote.pitchValue) <= newMaxSkip
        );
```
becomes
```ts
        bassDegrees = bassRangeNoteList.filter((note) => reaches(note, undefined, i));
```

2. The final chord (`// The last chord must be "1"`):

```ts
          .filter(
            (note) =>
              Math.abs(note.pitchValue - prevBassNote.pitchValue) <= newMaxSkip
          );
```
becomes
```ts
          .filter((note) => reaches(note, chords[0], i));
```

3. There are three `let bassNoteToAdd = bassDegrees.filter((note) => usable(chords.find((c) => c.name === nextChordName), note))` chains: in the `numOfChords - 3` branch, the `numOfChords - 2` branch and the general `else` branch. Each continues with a two-line `Math.abs(...) <=` / `newMaxSkip` filter. Replace that second `.filter(...)` in each with:

```ts
            .filter((note) => reaches(note, chords.find((c) => c.name === nextChordName), i));
```

4. In each of the four `const isGenerallyReachable = bassDegrees.some((bassNote) => usable(nextChordInfo, bassNote))` (`numOfChords - 3`, both `numOfChords - 2` lists, general `else`), change `usable(nextChordInfo, bassNote)` to:

```ts
usable(nextChordInfo, bassNote) && reaches(bassNote, nextChordInfo, i)
```

Leave `isStepwiseReachable`'s `<= 2` alone. It is the "accidentals follow step" rule, not the skip rule.

5. Homing: `Math.ceil(homeDistance / Math.max(1, newMaxSkip))` becomes `Math.ceil(homeDistance / Math.max(1, largestSkip(activePolicy)))`.

6. Four checks remain, all in closures with `info` in scope: `homing`'s `closer`, `reachable`, `moving` and the `justRepeated` filter. They read exactly `Math.abs(note.pitchValue - prevBassNote.pitchValue) <= newMaxSkip`. Replace all four with `reaches(note, info, i)`.

- [ ] **Step 7: `createNewSrOnce`**

`    var maxSkip = params.maxSkip;` becomes:

```ts
    // A number (older callers, the scripts) or a policy (the page) - one rule either way.
    var maxSkip = toSkipPolicy(params.maxSkip);
```

It is already passed to `generateChordProgression(...)` and to `genChordParams`.

- [ ] **Step 8: Check nothing old is left**

Run: `grep -n "newMaxSkip\|<= maxSkip\|<= newMaxSkip" src/lib/generateUnison.ts`
Expected: no output.

- [ ] **Step 9: Run the regression tests**

Run: `bun test tests/unit/unison-skip-regression.test.ts`
Expected: PASS, both tests. If the snapshot test fails, a replacement changed behaviour: find it, fix it, and do NOT update the snapshot.

- [ ] **Step 10: Run the whole suite and the rhythm check**

Run: `bun run test`
Expected: everything passes except the known `tests/unit/exercise-link.test.ts` parse failure.
Run: `bun run check:rhythm`
Expected: it passes, as before.
Run: `bunx astro check`
Expected: `0 errors`, `0 warnings`.

- [ ] **Step 11: Commit**

```bash
git add src/lib/generateUnison.ts tests/unit/unison-skip-regression.test.ts
git commit -m "feat: the unison generator asks the skip policy, with Max skip output unchanged"
```

---

### Task 4: Custom skips in the generator: a rest holds the line

**Files:**
- Modify: `src/lib/generateUnison.ts`, in `generateChordProgression`, right after the `shouldTieEighthNotes(...)` copy block at the top of the loop
- Test: `tests/unit/unison-custom-skips.test.ts`

**Interfaces:**
- Consumes: `createNewSr` with `maxSkip: SkipPolicy` (Task 3), and `SkipPolicy` (Task 2).
- Produces: a behaviour, not a new API. In custom mode a rest takes the previous note's pitch and chord, so the next sung note's skip is measured from the note actually sung.

Rhythm is drawn before pitch, so every rest also gets a pitch in the walk, which `createConcatString` then writes as `z`. Today a rest's unsung pitch sits between two sung notes. So "do, rest, sol" passes as two legal moves (do↑mi, mi↑sol) while the singer sings do→sol.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, test } from "bun:test";
import { createNewSr } from "../../src/lib/generateUnison";
import { selectableRhythms } from "../../src/lib/selectable-rhythms";
import type { SkipPolicy } from "../../src/lib/skip-policy";

/**
 * Custom skips in the generator (skip-policy.ts). The line sings only the
 * skips listed, lands each on an allowed note value, and a rest does not hide
 * a skip: moves are measured between the notes actually sung, the way a singer
 * meets them. Rates over many runs, as for every generator test here.
 */
const quiet = () => {};
const SOLFA = ["do", "re", "mi", "fa", "sol", "la", "ti"];
const QUARTER = 8;
const DO_MI_SOL_UP: SkipPolicy = {
  kind: "custom",
  moves: [{ from: 1, to: 3, dir: "up" }, { from: 3, to: 5, dir: "up" }],
  landOn: [QUARTER],
};

function line(
  policy: SkipPolicy,
  o: { degrees: number[]; range: { min: number; max: number }; rhythms: string[]; key?: string; sharps?: number[]; moveOnEighthNotes?: boolean }
): any[] {
  const saved = { log: console.log, warn: console.warn, error: console.error };
  Object.assign(console, { log: quiet, warn: quiet, error: quiet });
  try {
    const result: any = createNewSr({
      bpm: 72, tempo: 72, clef: "treble", selectedClef: "treble",
      timeSig: { name: "4/4", tsPerMeasure: 32, beamGroupSize: 8 }, selectedTimeSignature: "4/4",
      measures: 8, maxSkip: policy, range: o.range,
      rhythms: selectableRhythms.filter((r) => o.rhythms.includes(r.name)), selectedRhythms: o.rhythms,
      scaleDegrees: o.degrees, selectedSharpDegrees: o.sharps ?? [], selectedFlatDegrees: [],
      key: o.key ?? "C", showSolfege: true, lyricSystem: "movable", rhythmOnly: false,
      showRhythmSyllables: true, syllableSystemId: "kodaly",
      moveOnEighthNotes: o.moveOnEighthNotes ?? false, accidentalsFollowStep: true,
      partsObject: { numofParts: 1, parts: { Unison: { order: 0, smallName: "U" } } },
    } as any);
    return result[2].partsObject.parts.Unison.chordNoteObject;
  } finally {
    Object.assign(console, saved);
  }
}

/** Each sung note with the sung note before it - rests skipped over. */
function sungMoves(notes: any[]) {
  const sung = notes.filter((n) => !n.rhythm?.rest);
  return sung.slice(1).map((b, k) => ({ a: sung[k], b, rise: b.pitchValue - sung[k].pitchValue }));
}
const nameOf = (m: { a: any; b: any; rise: number }) =>
  `${SOLFA[m.a.degree]}${m.rise > 0 ? "↑" : "↓"}${SOLFA[m.b.degree]}`;

describe("custom skips in the generator", () => {
  test("Do-Mi-Sol ↑ on quarters: only do↑mi and mi↑sol, each onto a quarter, rests or not", () => {
    const bad: string[] = [];
    let skips = 0;
    for (let run = 0; run < 40; run++) {
      const notes = line(DO_MI_SOL_UP, {
        degrees: [1, 2, 3, 4, 5, 6], range: { min: 14, max: 19 },
        rhythms: ["quarter", "half", "quarterRest", "eighthEighth"], moveOnEighthNotes: true,
      });
      for (const m of sungMoves(notes)) {
        if (Math.abs(m.rise) <= 1) continue;
        skips++;
        const name = nameOf(m);
        if (!["do↑mi", "mi↑sol"].includes(name)) bad.push(name);
        else if (m.b.noteLength !== QUARTER) bad.push(`${name} onto ${m.b.noteLength}`);
      }
    }
    expect(bad).toEqual([]);
    expect(skips).toBeGreaterThan(0); // not vacuous
  });

  test("an empty list sings by step only, across rests too", () => {
    const bad: string[] = [];
    for (let run = 0; run < 40; run++) {
      const notes = line({ kind: "custom", moves: [] }, {
        degrees: [1, 2, 3, 4, 5], range: { min: 14, max: 18 }, rhythms: ["quarter", "half", "quarterRest"],
      });
      for (const m of sungMoves(notes)) if (Math.abs(m.rise) > 1) bad.push(nameOf(m));
    }
    expect(bad).toEqual([]);
  });

  test("a chromatic note is reached and left by step, even where a listed skip lands on its letter", () => {
    // do↑fa and re↑fa are listed, so without the chromatic rule a skip could land on fi.
    const policy: SkipPolicy = {
      kind: "custom",
      moves: [
        { from: 1, to: 4, dir: "up" }, { from: 2, to: 4, dir: "up" },
        { from: 4, to: 1, dir: "down" }, { from: 4, to: 2, dir: "down" },
      ],
    };
    const bad: string[] = [];
    let altered = 0;
    for (let run = 0; run < 30; run++) {
      const notes = line(policy, {
        key: "G", degrees: [1, 2, 3, 4, 5, 6, 7], sharps: [4], range: { min: 18, max: 25 }, rhythms: ["quarter", "half"],
      });
      const sung = notes.filter((n) => !n.rhythm?.rest);
      sung.forEach((n, k) => {
        if (!/[_^=]/.test(n.name)) return;
        altered++;
        if (k > 0 && Math.abs(n.pitchValue - sung[k - 1].pitchValue) > 1) bad.push(`into ${n.name}`);
        if (k + 1 < sung.length && Math.abs(sung[k + 1].pitchValue - n.pitchValue) > 1) bad.push(`out of ${n.name}`);
      });
    }
    expect(bad).toEqual([]);
    expect(altered).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run them to see which fail**

Run: `bun test tests/unit/unison-custom-skips.test.ts`
Expected:
- The first two tests FAIL. A rest's unsung pitch lets two legal moves chain into one illegal sung move, so the diff shows names such as `do↑sol`, `re↑sol` or (stepwise) `do↑mi`.
- The chromatic test PASSES already. Task 3 wired the chromatic rule. Step 5 proves it bites.

- [ ] **Step 3: The rest holds the line in custom mode**

In `generateChordProgression`, directly after the block that ends:

```ts
        const prevChord = chordProgression[i - 1];
        chordProgression.push(prevChord);
        bassNoteArray.push(bassNoteArray[i - 1]);
        continue;
      }
```

add:

```ts
      // A rest is not sung. In custom mode it holds the line where it was, so
      // the next note's skip is measured from the note actually sung before
      // the rest, and a rest cannot hide a skip the list forbids: do, rest,
      // sol is do to sol. (Max skip mode is unchanged: there the snapshot in
      // unison-skip-regression.test.ts holds the walk to what it always did.)
      if (policy.kind === "custom" && i > 0 && (randRhythmObjects[i] as any)?.rest === true) {
        chordProgression.push(chordProgression[i - 1]);
        bassNoteArray.push(bassNoteArray[i - 1]);
        continue;
      }
```

- [ ] **Step 4: Run the tests to verify they pass, and that Max mode did not move**

Run: `bun test tests/unit/unison-custom-skips.test.ts tests/unit/unison-skip-regression.test.ts`
Expected: PASS, all five tests.

Loop the new file ten times, because the generator is randomised:
`for i in 1 2 3 4 5 6 7 8 9 10; do bun test tests/unit/unison-custom-skips.test.ts 2>&1 | grep -E "pass|fail" | tail -2; done`
Expected: `3 pass` and `0 fail` every time.

- [ ] **Step 5: Mutation check: the chromatic test must bite**

Temporarily delete the line `  if (prev.chromatic || next.chromatic) return false;` from `src/lib/skip-policy.ts`.
Run: `bun test tests/unit/unison-custom-skips.test.ts`
Expected: the chromatic test FAILS (`into ^c` or similar). If it still passes, raise `runs` to 60 and widen the moves before going on.
Restore the file: `git checkout -- src/lib/skip-policy.ts`.
Run the test again. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/generateUnison.ts tests/unit/unison-custom-skips.test.ts
git commit -m "feat: in custom skips a rest holds the line, so a skip is measured between sung notes"
```

---

### Task 5: `skip-settings.ts`, chips, rows, landing, presets, URL, connectivity

**Files:**
- Create: `src/lib/skip-settings.ts`
- Test: `tests/unit/skip-settings.test.ts`

**Interfaces:**
- Consumes: `SkipMove`, `SkipPolicy` and `isSkipMove` from Task 2.
- Produces:
  - `type SkipMode = "max" | "custom"`
  - `interface SkipSettings { skipMode: SkipMode; customSkips: SkipMove[]; skipLandOn: number[] }`
  - `LAND_ON_CHOICES: readonly { length: number; label: string }[]` and `ALL_LAND_ON: number[]` (`[4, 8, 12, 16]`)
  - `SKIP_DEGREES: readonly { value: number; label: string }[]` (`"1 do"` ... `"7 ti"`)
  - `type SkipChipId`, `SKIP_CHIPS: readonly { id: SkipChipId; label: string; moves: SkipMove[] }[]` and `chipMoves(id: SkipChipId): SkipMove[]`
  - `addMoves(list: SkipMove[], add: SkipMove[]): SkipMove[]`
  - `toggleLandOn(list: number[], length: number): number[]`
  - `policyFor(maxSkip: number, s: SkipSettings): SkipPolicy`
  - `skipSettingsFrom(options: unknown): SkipSettings`
  - `writeSkipParams(s: SkipSettings, params: URLSearchParams): void`
  - `readSkipParams(params: URLSearchParams): SkipSettings | null`
  - `degreesConnected(degrees: number[], policy: SkipPolicy): boolean`

Decision: `4ths & 5ths ↕` adds the perfect 4ths and 5ths only, 12 rows. Fa-ti and ti-fa are a tritone, and leaving them out matches the chart's intent of "4ths and 5ths".

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, test } from "bun:test";
import {
  ALL_LAND_ON, SKIP_CHIPS, addMoves, chipMoves, degreesConnected, policyFor, readSkipParams,
  skipSettingsFrom, toggleLandOn, writeSkipParams, type SkipSettings,
} from "../../src/lib/skip-settings";
import type { SkipMove } from "../../src/lib/skip-policy";

const code = (m: SkipMove) => `${m.from}${{ up: "↑", down: "↓", both: "↕" }[m.dir]}${m.to}`;
const codes = (ms: SkipMove[]) => ms.map(code);

describe("quick-add chips", () => {
  test("each chip adds exactly its rows (spec table)", () => {
    const want: Record<string, string[]> = {
      "Do-Mi-Sol ↑": ["1↑3", "3↑5"],
      "Do-Sol ↑": ["1↑5"],
      "Sol-Mi-Do ↓": ["5↓3", "3↓1"],
      "Sol-Do ↓": ["5↓1"],
      "Do-Sol ↓": ["1↓5"],
      "Sol-Ti-Re ↑": ["5↑7", "7↑2"],
      "Tonic triad ↕": ["1↕3", "3↕5", "1↕5"],
    };
    for (const chip of SKIP_CHIPS.filter((c) => c.id !== "fourths-fifths")) {
      expect(codes(addMoves([], chip.moves))).toEqual(want[chip.label]);
    }
  });

  test("4ths & 5ths ↕ is every perfect 4th and 5th, both directions, no tritone", () => {
    const rows = chipMoves("fourths-fifths");
    expect(rows).toHaveLength(12);
    for (const m of rows) {
      expect(m.dir).toBe("both");
      const up = (((m.to - m.from) % 7) + 7) % 7;
      expect([3, 4]).toContain(up); // a 4th or a 5th up
      expect(code(m)).not.toBe("4↕7");
      expect(code(m)).not.toBe("7↕4");
    }
  });

  test("adding a row already there changes nothing; the other direction makes it ↕", () => {
    const once = addMoves([], chipMoves("do-sol-up"));
    expect(codes(addMoves(once, chipMoves("do-sol-up")))).toEqual(["1↑5"]);
    expect(codes(addMoves(once, chipMoves("do-sol-down")))).toEqual(["1↕5"]);
  });

  test("chipMoves hands back copies, so editing a row never edits the chip", () => {
    const rows = chipMoves("do-mi-sol-up");
    rows[0].to = 6;
    expect(codes(chipMoves("do-mi-sol-up"))).toEqual(["1↑3", "3↑5"]);
  });
});

describe("skips land on", () => {
  test("toggles in note-value order and never leaves none", () => {
    expect(toggleLandOn(ALL_LAND_ON, 4)).toEqual([8, 12, 16]);
    expect(toggleLandOn([16], 8)).toEqual([8, 16]);
    expect(toggleLandOn([8], 8)).toEqual([8]);
  });
});

describe("policyFor", () => {
  const custom = (skipLandOn: number[]): SkipSettings => ({ skipMode: "custom", customSkips: chipMoves("do-sol-up"), skipLandOn });
  test("Max skip mode is the number", () => {
    expect(policyFor(3, { skipMode: "max", customSkips: chipMoves("do-sol-up"), skipLandOn: [8] })).toEqual({ kind: "max", maxSkip: 3 });
  });
  test("every box on means no landing limit; fewer is a limit", () => {
    expect(policyFor(3, custom(ALL_LAND_ON))).toEqual({ kind: "custom", moves: chipMoves("do-sol-up") });
    expect(policyFor(3, custom([8, 16]))).toEqual({ kind: "custom", moves: chipMoves("do-sol-up"), landOn: [8, 16] });
  });
});

describe("saved in presets and URLs", () => {
  const settings: SkipSettings = {
    skipMode: "custom",
    customSkips: [{ from: 1, to: 3, dir: "up" }, { from: 3, to: 5, dir: "up" }, { from: 1, to: 5, dir: "both" }],
    skipLandOn: [8, 16],
  };

  test("a preset (JSON) round-trips the custom list", () => {
    expect(skipSettingsFrom(JSON.parse(JSON.stringify(settings)))).toEqual(settings);
  });

  test("an old preset without the fields loads in Max skip mode", () => {
    expect(skipSettingsFrom({ maxSkip: 3 })).toEqual({ skipMode: "max", customSkips: [], skipLandOn: ALL_LAND_ON });
    expect(skipSettingsFrom(undefined)).toEqual({ skipMode: "max", customSkips: [], skipLandOn: ALL_LAND_ON });
  });

  test("junk rows and lengths are dropped", () => {
    const got = skipSettingsFrom({ skipMode: "custom", customSkips: [{ from: 1, to: 1, dir: "up" }, { from: 2, to: 9 }], skipLandOn: [5, "x"] });
    expect(got).toEqual({ skipMode: "custom", customSkips: [], skipLandOn: ALL_LAND_ON });
  });

  test("a URL round-trips the custom list", () => {
    const params = new URLSearchParams();
    writeSkipParams(settings, params);
    expect(params.get("skips")).toBe("1u3,3u5,1b5");
    expect(readSkipParams(new URLSearchParams(params.toString()))).toEqual(settings);
  });

  test("Max skip mode writes nothing, and an old link reads as Max skip mode", () => {
    const params = new URLSearchParams();
    writeSkipParams({ ...settings, skipMode: "max" }, params);
    expect(params.toString()).toBe("");
    expect(readSkipParams(new URLSearchParams("maxSkip=3&key=F"))).toBeNull();
  });
});

describe("degreesConnected", () => {
  test("stepwise through neighbours is connected", () => {
    expect(degreesConnected([1, 2, 3, 4, 5], { kind: "custom", moves: [] })).toBe(true);
  });
  test("1, 3, 5 with only Do-Mi-Sol ↑ cannot get back down", () => {
    expect(degreesConnected([1, 3, 5], { kind: "custom", moves: chipMoves("do-mi-sol-up") })).toBe(false);
  });
  test("1, 3, 5 with the tonic triad both ways is connected", () => {
    expect(degreesConnected([1, 3, 5], { kind: "custom", moves: chipMoves("tonic-triad") })).toBe(true);
  });
  test("Max skip mode is left to the page's own gap check", () => {
    expect(degreesConnected([1, 5], { kind: "max", maxSkip: 1 })).toBe(true);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun test tests/unit/skip-settings.test.ts`
Expected: FAIL. `Cannot find module '../../src/lib/skip-settings'`.

- [ ] **Step 3: Write the module**

```ts
import { isSkipMove, type SkipMove, type SkipPolicy } from "./skip-policy";

/**
 * The Unison page's skip controls as data (NYSSMA Voice levels spec, section 1):
 * Max skip or Custom skips, the rows, the quick-add chips, what a skip may
 * land on - and how they are kept in presets and URLs. Pure, so it is tested
 * here rather than in the component.
 */

export type SkipMode = "max" | "custom";

export interface SkipSettings {
  skipMode: SkipMode;
  /** Kept while in Max skip mode too, so switching back restores the list. */
  customSkips: SkipMove[];
  /** Lengths (32nds) a skip may land on. All four: no limit. */
  skipLandOn: number[];
}

export const LAND_ON_CHOICES: readonly { length: number; label: string }[] = [
  { length: 4, label: "Eighth" },
  { length: 8, label: "Quarter" },
  { length: 12, label: "Dotted quarter" },
  { length: 16, label: "Half" },
];
export const ALL_LAND_ON: number[] = LAND_ON_CHOICES.map((c) => c.length);

export const SKIP_DEGREES: readonly { value: number; label: string }[] = [
  "do", "re", "mi", "fa", "sol", "la", "ti",
].map((name, k) => ({ value: k + 1, label: `${k + 1} ${name}` }));

const up = (from: number, to: number): SkipMove => ({ from, to, dir: "up" });
const down = (from: number, to: number): SkipMove => ({ from, to, dir: "down" });
const both = (from: number, to: number): SkipMove => ({ from, to, dir: "both" });
/** Scale degree n, wrapped into 1-7. */
const deg = (n: number) => ((((n - 1) % 7) + 7) % 7) + 1;

/** Perfect 4ths and 5ths, both ways. Fa-ti and ti-fa are the tritone, left out. */
const FOURTHS_AND_FIFTHS: SkipMove[] = [
  ...[1, 2, 3, 5, 6, 7].map((a) => both(a, deg(a + 3))), // a 4th up, a 5th down
  ...[1, 2, 3, 4, 5, 6].map((a) => both(a, deg(a + 4))), // a 5th up, a 4th down
];

export type SkipChipId =
  | "do-mi-sol-up" | "do-sol-up" | "sol-mi-do-down" | "sol-do-down"
  | "do-sol-down" | "sol-ti-re-up" | "tonic-triad" | "fourths-fifths";

/** One click adds the rows, which stay editable. "Clear" is the page's own button. */
export const SKIP_CHIPS: readonly { id: SkipChipId; label: string; moves: SkipMove[] }[] = [
  { id: "do-mi-sol-up", label: "Do-Mi-Sol ↑", moves: [up(1, 3), up(3, 5)] },
  { id: "do-sol-up", label: "Do-Sol ↑", moves: [up(1, 5)] },
  { id: "sol-mi-do-down", label: "Sol-Mi-Do ↓", moves: [down(5, 3), down(3, 1)] },
  { id: "sol-do-down", label: "Sol-Do ↓", moves: [down(5, 1)] },
  { id: "do-sol-down", label: "Do-Sol ↓", moves: [down(1, 5)] },
  { id: "sol-ti-re-up", label: "Sol-Ti-Re ↑", moves: [up(5, 7), up(7, 2)] },
  { id: "tonic-triad", label: "Tonic triad ↕", moves: [both(1, 3), both(3, 5), both(1, 5)] },
  { id: "fourths-fifths", label: "4ths & 5ths ↕", moves: FOURTHS_AND_FIFTHS },
];

/** A chip's rows, as copies. */
export function chipMoves(id: SkipChipId): SkipMove[] {
  return (SKIP_CHIPS.find((c) => c.id === id)?.moves ?? []).map((m) => ({ ...m }));
}

/** Add rows: one already listed is left alone, and the other direction of one makes it ↕. */
export function addMoves(list: SkipMove[], add: SkipMove[]): SkipMove[] {
  const out = list.map((m) => ({ ...m }));
  for (const m of add) {
    const same = out.find((o) => o.from === m.from && o.to === m.to);
    if (!same) out.push({ ...m });
    else if (same.dir !== m.dir && same.dir !== "both") same.dir = "both";
  }
  return out;
}

/** Turn one land-on value on or off, in note-value order. The last one stays on. */
export function toggleLandOn(list: number[], length: number): number[] {
  if (list.includes(length)) return list.length > 1 ? list.filter((l) => l !== length) : [...list];
  return ALL_LAND_ON.filter((l) => l === length || list.includes(l));
}

/** The rule these controls describe. */
export function policyFor(maxSkip: number, s: SkipSettings): SkipPolicy {
  if (s.skipMode === "max") return { kind: "max", maxSkip };
  const moves = s.customSkips.filter(isSkipMove).map((m) => ({ ...m }));
  const limited = ALL_LAND_ON.some((l) => !s.skipLandOn.includes(l));
  return limited ? { kind: "custom", moves, landOn: [...s.skipLandOn] } : { kind: "custom", moves };
}

/** The settings in a saved options object; one without them is Max skip mode. */
export function skipSettingsFrom(options: unknown): SkipSettings {
  const o = (options && typeof options === "object" ? options : {}) as Record<string, unknown>;
  const customSkips = Array.isArray(o.customSkips)
    ? o.customSkips.filter(isSkipMove).map((m) => ({ from: m.from, to: m.to, dir: m.dir }))
    : [];
  const landOn = Array.isArray(o.skipLandOn)
    ? ALL_LAND_ON.filter((l) => (o.skipLandOn as unknown[]).includes(l))
    : [];
  return {
    skipMode: o.skipMode === "custom" ? "custom" : "max",
    customSkips,
    skipLandOn: landOn.length ? landOn : [...ALL_LAND_ON],
  };
}

const DIR_CODE = { up: "u", down: "d", both: "b" } as const;
const CODE_DIR = { u: "up", d: "down", b: "both" } as const;

/** Custom skips only: `skipMode=custom&skips=1u3,3u5&skipLand=8`. Max skip mode adds nothing. */
export function writeSkipParams(s: SkipSettings, params: URLSearchParams): void {
  if (s.skipMode !== "custom") return;
  params.set("skipMode", "custom");
  params.set("skips", s.customSkips.map((m) => `${m.from}${DIR_CODE[m.dir]}${m.to}`).join(","));
  params.set("skipLand", s.skipLandOn.join(","));
}

/** The settings a link carries, or null for a link in Max skip mode (every old link). */
export function readSkipParams(params: URLSearchParams): SkipSettings | null {
  if (params.get("skipMode") !== "custom") return null;
  const customSkips = (params.get("skips") ?? "").split(",").flatMap((text) => {
    const m = /^([1-7])([udb])([1-7])$/.exec(text.trim());
    if (!m) return [];
    const move = { from: Number(m[1]), to: Number(m[3]), dir: CODE_DIR[m[2] as keyof typeof CODE_DIR] };
    return isSkipMove(move) ? [move] : [];
  });
  const skipLandOn = (params.get("skipLand") ?? "").split(",").map(Number);
  return skipSettingsFrom({ skipMode: "custom", customSkips, skipLandOn });
}

/**
 * Can a line in custom mode get from every selected degree to every other,
 * by steps between selected neighbours and the listed skips? Ignores the
 * range and the landing limit - a quick check before generating, so the
 * teacher hears "add a skip", not "increase Max Skip". Max skip mode keeps
 * the page's own gap check, so this says true for it.
 */
export function degreesConnected(degrees: number[], policy: SkipPolicy): boolean {
  const selected = [...new Set(degrees.filter((d) => d >= 1 && d <= 7))];
  if (selected.length <= 1 || policy.kind === "max") return true;
  const nextOf = (d: number) => [
    ...[deg(d + 1), deg(d - 1)].filter((s) => selected.includes(s)),
    ...policy.moves.filter((m) => m.from === d && selected.includes(m.to)).map((m) => m.to),
  ];
  return selected.every((start) => {
    const seen = new Set([start]);
    const queue = [start];
    while (queue.length) for (const n of nextOf(queue.shift()!)) if (!seen.has(n)) { seen.add(n); queue.push(n); }
    return seen.size === selected.length;
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test tests/unit/skip-settings.test.ts`
Expected: PASS, every test.

- [ ] **Step 5: Commit**

```bash
git add src/lib/skip-settings.ts tests/unit/skip-settings.test.ts
git commit -m "feat: custom skip settings - chips, landing values, presets, links and a connectivity check"
```

---

### Task 6: Custom skips on the Unison page

**Files:**
- Modify: `src/components/AbcjsSingle.svelte`. Line numbers are as of commit e0e7ae4; anchor on the text:
  - imports (~:59, ~:69)
  - `loadStateFromUrl` (~:308)
  - `stateFromOptions` (~:485)
  - `applySavedPreset` (~:553)
  - `applyLadderStep` (~:627)
  - `getInitialState` defaults (~:675)
  - state vars (~:703)
  - `notesDirty` (~:1039)
  - `currentOptions` (~:1063)
  - `updateUrlFromState` (~:1127)
  - `generateExercise` (~:2092, ~:2128)
  - Notes tab markup (~:3922-3935)

**Interfaces:**
- Consumes: everything Task 5 produces, plus `SkipMove` (Task 2).
- Produces: page state `skipMode`, `customSkips`, `skipLandOn` and `$: skipPolicy`. Options and preset fields `skipMode`, `customSkips` and `skipLandOn`. URL params `skipMode`, `skips` and `skipLand`. Task 11 sets these state variables.

- [ ] **Step 1: Imports**

After `  import { UNISON_PRESET_STORE, type SavedPreset } from "../lib/preset-storage";` add:

```ts
  import type { SkipMove } from "../lib/skip-policy";
  import {
    ALL_LAND_ON, LAND_ON_CHOICES, SKIP_CHIPS, SKIP_DEGREES, addMoves, degreesConnected,
    policyFor, readSkipParams, skipSettingsFrom, toggleLandOn, writeSkipParams, type SkipMode,
  } from "../lib/skip-settings";
```

Change `  import { Piano, Minus, Plus, RefreshCw, ChevronDown, ChevronRight } from "lucide-svelte";` to include `X`:

```ts
  import { Piano, Minus, Plus, RefreshCw, ChevronDown, ChevronRight, X } from "lucide-svelte";
```

- [ ] **Step 2: Load, save and apply**

In `loadStateFromUrl`, after the `maxSkip` block (`options.maxSkip = s; }`), add:

```ts
    // Custom skips (skip-settings.ts). A link without them is in Max skip mode.
    const skips = readSkipParams(urlParams);
    if (skips) Object.assign(options, skips);
```

In `stateFromOptions`'s returned object, after `      maxSkip: options.maxSkip || 4,` add:

```ts
      // Max skip or Custom skips; presets and options from before load in Max skip.
      ...skipSettingsFrom(options),
```

In `getInitialState`'s default object, after `      maxSkip: 4,` add `      ...skipSettingsFrom({}),`.

After `  let maxSkip = initialState.maxSkip;` add:

```ts
  /** Max skip, or Custom skips: the skips allowed and what they may land on (skip-settings.ts). */
  let skipMode: SkipMode = initialState.skipMode;
  let customSkips: SkipMove[] = initialState.customSkips;
  let skipLandOn: number[] = initialState.skipLandOn;
  $: skipPolicy = policyFor(maxSkip, { skipMode, customSkips, skipLandOn });
```

In `applySavedPreset`, after `    maxSkip = next.maxSkip;` add:

```ts
    skipMode = next.skipMode;
    customSkips = next.customSkips;
    skipLandOn = next.skipLandOn;
```

In `applyLadderStep`, after `    if (u.maxSkip) maxSkip = u.maxSkip;` add:

```ts
    // A step's skip size is a Max skip.
    skipMode = "max";
```

`$: notesDirty = maxSkip !== DEFAULTS.maxSkip ||` becomes:

```ts
  $: notesDirty = maxSkip !== DEFAULTS.maxSkip || skipMode !== "max" ||
```

In `currentOptions`, after `      maxSkip,` add:

```ts
      skipMode,
      customSkips,
      skipLandOn,
```

In `updateUrlFromState`, after `    params.set("maxSkip", maxSkip.toString());` add:

```ts
    writeSkipParams({ skipMode, customSkips, skipLandOn }, params);
```

- [ ] **Step 3: Generate with the policy**

In `generateExercise`, replace:

```ts
    if (!rhythmOnly && !validateSettings(selectedScaleDegrees, maxSkip)) {
```

with:

```ts
    if (!rhythmOnly && skipMode === "custom" && !degreesConnected(Array.from(selectedScaleDegrees), skipPolicy)) {
      error =
        "With these skips the line cannot get between all the selected notes. Add a skip, or select the notes in between.";
      isLoading = false;
      return;
    }
    if (!rhythmOnly && skipMode === "max" && !validateSettings(selectedScaleDegrees, maxSkip)) {
```

The body of that `if` is unchanged. In the `params` object, `        maxSkip: maxSkip,` becomes:

```ts
        // A number in Max skip mode's form or the custom list - the generator takes either (skip-policy.ts).
        maxSkip: skipPolicy,
```

- [ ] **Step 4: The control**

In the Notes tab, replace the whole `<!-- Max Skip -->` block, from `<div class="space-y-2">` to its closing `</div>` (the one containing `aria-label="Max Melodic Skip"`), with:

```svelte
            <!-- Skips: the largest skip, or a list of the skips allowed (skip-settings.ts). -->
            <div class="space-y-2">
              <p class="sr-label">Skips</p>
              <div class="flex flex-wrap gap-2" role="group" aria-label="Skip style">
                <button class="sr-tok {skipMode === 'max' ? 'sr-on' : ''}" aria-pressed={skipMode === 'max'}
                  on:click={() => (skipMode = 'max')}>Max skip</button>
                <button class="sr-tok {skipMode === 'custom' ? 'sr-on' : ''}" aria-pressed={skipMode === 'custom'}
                  on:click={() => (skipMode = 'custom')}>Custom skips</button>
              </div>

              {#if skipMode === 'max'}
                <div class="flex flex-wrap items-center gap-3" role="group" aria-label="Max Melodic Skip">
                  <button type="button" class="sr-btn-quiet"
                    aria-label="Decrease max skip"
                    on:click={() => { if (maxSkip > 1) maxSkip -= 1; }}><Minus size={16} /></button>
                  <span class="text-sm font-bold w-6 text-center">{maxSkip}</span>
                  <button type="button" class="sr-btn-quiet"
                    aria-label="Increase max skip"
                    on:click={() => { if (maxSkip < 8) maxSkip += 1; }}><Plus size={16} /></button>
                  <span class="text-xs text-sr-faint">{skipIntervalNames[maxSkip] ?? `${maxSkip} steps`}</span>
                </div>
              {:else}
                <div class="flex flex-wrap gap-2" role="group" aria-label="Add skips">
                  {#each SKIP_CHIPS as chip}
                    <button type="button" class="sr-tok text-xs"
                      on:click={() => (customSkips = addMoves(customSkips, chip.moves))}>{chip.label}</button>
                  {/each}
                  <button type="button" class="sr-link text-xs" disabled={customSkips.length === 0}
                    on:click={() => (customSkips = [])}>Clear</button>
                </div>

                {#if customSkips.length === 0}
                  <p class="text-xs text-sr-faint">No skips listed: the line moves by step only.</p>
                {/if}
                <ul class="space-y-1.5">
                  {#each customSkips as move, k}
                    <li class="flex flex-wrap items-center gap-2 text-sm">
                      <span class="text-xs text-sr-muted">From</span>
                      <select
                        class="bg-sr-track border-0 rounded-full pl-3 pr-8 py-1 text-sm font-bold text-sr-ink-2 focus:outline-none focus:ring-2 focus:ring-sr-action"
                        aria-label="Skip {k + 1}: from"
                        value={move.from}
                        on:change={(e) => (customSkips = customSkips.map((m, j) => (j === k ? { ...m, from: Number(e.currentTarget.value) } : m)))}
                      >
                        {#each SKIP_DEGREES as d}<option value={d.value} disabled={d.value === move.to}>{d.label}</option>{/each}
                      </select>
                      <select
                        class="bg-sr-track border-0 rounded-full pl-3 pr-8 py-1 text-sm font-bold text-sr-ink-2 focus:outline-none focus:ring-2 focus:ring-sr-action"
                        aria-label="Skip {k + 1}: direction"
                        value={move.dir}
                        on:change={(e) => (customSkips = customSkips.map((m, j) => (j === k ? { ...m, dir: e.currentTarget.value as SkipMove['dir'] } : m)))}
                      >
                        <option value="up">↑ ascending</option>
                        <option value="down">↓ descending</option>
                        <option value="both">↕ both</option>
                      </select>
                      <span class="text-xs text-sr-muted">To</span>
                      <select
                        class="bg-sr-track border-0 rounded-full pl-3 pr-8 py-1 text-sm font-bold text-sr-ink-2 focus:outline-none focus:ring-2 focus:ring-sr-action"
                        aria-label="Skip {k + 1}: to"
                        value={move.to}
                        on:change={(e) => (customSkips = customSkips.map((m, j) => (j === k ? { ...m, to: Number(e.currentTarget.value) } : m)))}
                      >
                        {#each SKIP_DEGREES as d}<option value={d.value} disabled={d.value === move.from}>{d.label}</option>{/each}
                      </select>
                      <button type="button" class="p-1 text-sr-faint hover:text-sr-danger"
                        aria-label="Remove skip {k + 1}"
                        on:click={() => (customSkips = customSkips.filter((_, j) => j !== k))}><X size={14} /></button>
                    </li>
                  {/each}
                </ul>
                <button type="button" class="sr-link text-xs"
                  on:click={() => (customSkips = [...customSkips, { from: 1, to: 3, dir: 'up' }])}>+ Add skip</button>
                <p class="text-xs text-sr-faint">Steps are always allowed. Each skip listed may be sung in any octave.</p>

                <div class="space-y-1 pt-1">
                  <p class="sr-label">Skips land on</p>
                  <div class="flex flex-wrap gap-2" role="group" aria-label="Skips land on">
                    {#each LAND_ON_CHOICES as choice}
                      <button class="sr-tok {skipLandOn.includes(choice.length) ? 'sr-on' : ''}"
                        aria-pressed={skipLandOn.includes(choice.length)}
                        on:click={() => (skipLandOn = toggleLandOn(skipLandOn, choice.length))}>{choice.label}</button>
                    {/each}
                  </div>
                  <p class="text-xs text-sr-faint">
                    {skipLandOn.length === ALL_LAND_ON.length
                      ? 'A skip may land on any note.'
                      : 'A skip may only land on the values chosen. Steps land anywhere.'}
                  </p>
                </div>
              {/if}
            </div>
```

Decision: "Skips land on" uses the page's toggle tokens (`sr-tok` with `aria-pressed`), like every other multi-select on this page, rather than literal checkboxes.

- [ ] **Step 5: Type-check**

Run: `bunx astro check`
Expected: `0 errors`, `0 warnings`.

- [ ] **Step 6: Check it in the browser**

Run: `bun run dev` and open `http://localhost:4321/sightreading`. In the Notes tab:

1. With Max skip on, the control is unchanged and Generate works as before. The address has no `skipMode`.
2. Click `Custom skips`. "No skips listed: the line moves by step only." shows. Generate: every move is a step.
3. Click `Do-Mi-Sol ↑`. Two rows appear, `1 do ↑ ascending 3 mi` and `3 mi ↑ ascending 5 sol`. Click it again: still two rows. Click `Do-Sol ↓`: one more row. Click `Clear`: none.
4. Add rows with `+ Add skip`, change selects, and remove one with ×. In the To select, the From degree is disabled.
5. Select scale degrees 1, 3, 5 and only `Do-Mi-Sol ↑`, then Generate. You see the "cannot get between all the selected notes" message.
6. Turn off Eighth under `Skips land on`. The address gains `skipMode=custom&skips=...&skipLand=8,12,16`. Reload: the same settings come back. Open `/sightreading?maxSkip=3&key=F` (an old link): Max skip mode, 3.
7. Save a preset in Custom skips, switch to Max skip, then load the preset: Custom skips and its rows come back, and the preset is not marked edited.

- [ ] **Step 7: Commit**

Run `git diff src/components/AbcjsSingle.svelte` and confirm only this task's hunks, then:

```bash
git add src/components/AbcjsSingle.svelte
git commit -m "feat: Custom skips on the Unison page - rows, quick-add chips and what a skip may land on"
```

---

### Task 7: Key and meter pools, and a range that follows the key

**Files:**
- Create: `src/lib/unison-pools.ts`
- Modify: `src/lib/ladder.ts` (`rangeForStep`, ~:579)
- Modify: `src/components/AbcjsSingle.svelte`
- Test: `tests/unit/unison-pools.test.ts`, `tests/unit/ladder.test.ts` (add one test)

**Interfaces:**
- Produces, in `ladder.ts`: `rangeForSpan(span: [below: number, above: number], key: string, anchorMin: number): { min: number; max: number } | null`. `rangeForStep` now delegates to it.
- Produces, in `unison-pools.ts`:
  - `parsePool(raw: string | null | undefined, allowed: readonly string[]): string[]`
  - `poolFrom(saved: unknown, single: unknown, allowed: readonly string[], fallback: string): string[]`
  - `togglePoolMember(pool: readonly string[], item: string): string[]`
  - `drawFromPool<T>(pool: readonly T[], random?: () => number): T`
  - `type Span = [below: number, above: number]`, `spanFrom(value: unknown): Span | null` and `parseSpan(raw): Span | null`
  - `setupSnapshot(s: { keys: string[]; meters: string[]; span: Span | null; anchor: number; range: { min: number; max: number } })`. It returns `{ selectedKeys, selectedKey, selectedTimeSignatures, selectedTimeSignature, selectedRange, rangeSpan?, rangeAnchor? }`.
- Produces, on the page: state `selectedKeys: Set<string>`, `selectedTimeSignatures: Set<string>`, `rangeSpan: Span | null` and `rangeAnchor: number`. Options fields `selectedKeys`, `selectedTimeSignatures`, `rangeSpan` and `rangeAnchor`. URL `key=C,F`, `timeSignature=4/4,2/4`, `span=-3,5` and `anchor=14`. Task 11 sets them.

Unison takes one key and one meter today, so per the spec it gets Choral's random-pool behaviour (`AbcjsChoral.svelte` ~:2138-2150): click a key to add or remove it, and one is drawn on each Generate. `selectedKey` and `selectedTimeSignature` stay as "the exercise on screen". The pools are what is saved, so a draw never marks a preset edited (Review Focus 3).

The range: a level gives its range as scale steps around do. It is placed on the do at or above `rangeAnchor`, which is the teacher's range minimum when the level was applied, and placed again for each key drawn. Always from the anchor, never from the last placement, or the range would creep up an octave a key at a time (Review Focus 2).

- [ ] **Step 1: Write the failing tests**

`tests/unit/unison-pools.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import {
  drawFromPool, parsePool, parseSpan, poolFrom, setupSnapshot, spanFrom, togglePoolMember,
} from "../../src/lib/unison-pools";

const KEYS = ["Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E"];

describe("key and meter pools", () => {
  test("a link names one key (old) or several", () => {
    expect(parsePool("F", KEYS)).toEqual(["F"]);
    expect(parsePool("C,F,Q,C", KEYS)).toEqual(["C", "F"]);
    expect(parsePool(null, KEYS)).toEqual([]);
  });

  test("a saved pool wins; an old preset's single key becomes a pool of one", () => {
    expect(poolFrom(["C", "F"], "G", KEYS, "F")).toEqual(["C", "F"]);
    expect(poolFrom(undefined, "G", KEYS, "F")).toEqual(["G"]);
    expect(poolFrom(["nope"], undefined, KEYS, "F")).toEqual(["F"]);
  });

  test("a click adds or removes, and the last one stays", () => {
    expect(togglePoolMember(["C"], "F")).toEqual(["C", "F"]);
    expect(togglePoolMember(["C", "F"], "C")).toEqual(["F"]);
    expect(togglePoolMember(["C"], "C")).toEqual(["C"]);
  });

  test("a pool of one never draws; a bigger one draws by the random number", () => {
    expect(drawFromPool(["F"], () => 0.99)).toBe("F");
    expect(drawFromPool(["C", "F", "G"], () => 0.5)).toBe("F");
    expect(() => drawFromPool([])).toThrow();
  });
});

describe("a range that follows the key", () => {
  test("spans parse and are checked", () => {
    expect(parseSpan("-3,5")).toEqual([-3, 5]);
    expect(spanFrom([0, 4])).toEqual([0, 4]);
    expect(spanFrom([2, 4])).toBeNull(); // must include do
    expect(parseSpan("x")).toBeNull();
  });

  test("the saved setup is the pool's, not the key drawn - a draw is not an edit", () => {
    const s = { keys: ["C", "F"], meters: ["4/4", "2/4"], span: [0, 4] as [number, number], anchor: 14, range: { min: 17, max: 21 } };
    // range {17,21} is F's placement - what the page holds after drawing F.
    expect(setupSnapshot(s)).toEqual({
      selectedKeys: ["C", "F"], selectedKey: "C",
      selectedTimeSignatures: ["4/4", "2/4"], selectedTimeSignature: "4/4",
      selectedRange: { min: 14, max: 18 }, // C4-G4, placed for the pool's first key
      rangeSpan: [0, 4], rangeAnchor: 14,
    });
  });

  test("without a span the range is the teacher's, and no span fields are saved", () => {
    expect(setupSnapshot({ keys: ["F"], meters: ["4/4"], span: null, anchor: 14, range: { min: 14, max: 21 } })).toEqual({
      selectedKeys: ["F"], selectedKey: "F", selectedTimeSignatures: ["4/4"], selectedTimeSignature: "4/4",
      selectedRange: { min: 14, max: 21 },
    });
  });
});
```

Add to `tests/unit/ladder.test.ts`. Extend the import to `import { ladder, ladderById, ladderStages, rangeForSpan, rangeForStep, stepHref } from "../../src/lib/ladder";` and add inside the describe that holds the `rangeForStep` test:

```ts
  test("rangeForSpan places a span on the do at or above the anchor, the same for every draw", () => {
    const fifth: [number, number] = [0, 4];
    expect(rangeForSpan(fifth, "C", 14)).toEqual({ min: 14, max: 18 }); // C4-G4
    expect(rangeForSpan(fifth, "F", 14)).toEqual({ min: 17, max: 21 }); // F4-C5
    const ninth: [number, number] = [-3, 5]; // low sol to la
    expect(rangeForSpan(ninth, "C", 14)).toEqual({ min: 11, max: 19 }); // G3-A4
    expect(rangeForSpan(ninth, "Eb", 14)).toEqual({ min: 13, max: 21 });
    expect(rangeForSpan(ninth, "C", 7)).toEqual({ min: 4, max: 12 }); // bass clef
    // Draw after draw from the same anchor: no creeping up an octave.
    for (const key of ["C", "F", "G", "C", "F"]) {
      expect(rangeForSpan(fifth, key, 14)).toEqual(rangeForSpan(fifth, key, 14));
      expect(rangeForSpan(fifth, key, 14)!.min).toBeLessThan(21);
    }
    expect(rangeForSpan(fifth, "H", 14)).toBeNull();
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun test tests/unit/unison-pools.test.ts tests/unit/ladder.test.ts`
Expected: FAIL. `Cannot find module '../../src/lib/unison-pools'`, and `rangeForSpan` is not exported.

- [ ] **Step 3: `rangeForSpan` in `ladder.ts`**

Replace the body of `rangeForStep` and add `rangeForSpan` above it:

```ts
/**
 * A span of scale steps around do, placed on the first do at or above
 * `anchorMin` - so the clef and octave stay the class's. Used for a ladder
 * step, and for a NYSSMA level each time a key is drawn: always from the same
 * anchor, never from the last placement, or the range would creep.
 */
export function rangeForSpan(
  span: [below: number, above: number],
  key: string,
  anchorMin: number
): { min: number; max: number } | null {
  const letter = keySignatures[key]?.rootOffset;
  if (letter === undefined) return null;
  let doIndex = anchorMin;
  while (((doIndex % 7) + 7) % 7 !== letter) doIndex++;
  const [below, above] = span;
  return { min: Math.max(0, doIndex + below), max: doIndex + above };
}

export function rangeForStep(
  u: UnisonStepSettings,
  current: { min: number; max: number }
): { min: number; max: number } | null {
  if (!u.span || !u.selectedKey) return null;
  return rangeForSpan(u.span, u.selectedKey, current.min);
}
```

Keep the existing doc comment above `rangeForStep`.

- [ ] **Step 4: `unison-pools.ts`**

```ts
import { rangeForSpan } from "./ladder";

/**
 * Keys and meters on the Unison page as pools: one of each is drawn per
 * exercise, the way Choral's key picker works. And a range that follows the
 * key - a span of scale steps around do - for the NYSSMA levels, whose keys
 * change between exercises.
 */

/** "C,F" from a link; an old link names one key. Unknown names are dropped. */
export function parsePool(raw: string | null | undefined, allowed: readonly string[]): string[] {
  if (!raw) return [];
  return [...new Set(raw.split(",").map((s) => s.trim()).filter((s) => allowed.includes(s)))];
}

/** The pool a saved options object holds; one from before pools has a single key or meter. */
export function poolFrom(saved: unknown, single: unknown, allowed: readonly string[], fallback: string): string[] {
  const list = Array.isArray(saved)
    ? [...new Set(saved.filter((v): v is string => typeof v === "string" && allowed.includes(v)))]
    : [];
  if (list.length) return list;
  return typeof single === "string" && allowed.includes(single) ? [single] : [fallback];
}

/** A click on a key or meter: in or out of the pool. The last one stays. */
export function togglePoolMember(pool: readonly string[], item: string): string[] {
  if (!pool.includes(item)) return [...pool, item];
  return pool.length > 1 ? pool.filter((p) => p !== item) : [...pool];
}

/** One from the pool. A pool of one draws nothing, so a single key behaves as it always did. */
export function drawFromPool<T>(pool: readonly T[], random: () => number = Math.random): T {
  if (pool.length === 0) throw new Error("Nothing to draw from.");
  return pool.length === 1 ? pool[0] : pool[Math.floor(random() * pool.length)];
}

export type Span = [below: number, above: number];

/** Scale steps below and above do: do inside it, at most two octaves wide. */
export function spanFrom(value: unknown): Span | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const [below, above] = value.map(Number);
  const ok = Number.isInteger(below) && Number.isInteger(above) && below <= 0 && above >= 0 && above - below >= 1 && above - below <= 14;
  return ok ? [below, above] : null;
}

export const parseSpan = (raw: string | null | undefined): Span | null => (raw ? spanFrom(raw.split(",")) : null);

/**
 * What the page saves - presets, localStorage, "edited" - for its key, meter
 * and range: the pools, and the range placed for the pool's first key. Never
 * the key or meter last drawn, or every Generate would mark a preset edited.
 */
export function setupSnapshot(s: {
  keys: string[];
  meters: string[];
  span: Span | null;
  anchor: number;
  range: { min: number; max: number };
}) {
  return {
    selectedKeys: [...s.keys],
    selectedKey: s.keys[0],
    selectedTimeSignatures: [...s.meters],
    selectedTimeSignature: s.meters[0],
    selectedRange: (s.span && rangeForSpan(s.span, s.keys[0], s.anchor)) || { ...s.range },
    ...(s.span ? { rangeSpan: [...s.span] as Span, rangeAnchor: s.anchor } : {}),
  };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bun test tests/unit/unison-pools.test.ts tests/unit/ladder.test.ts`
Expected: PASS, including the existing `rangeForStep` test.

- [ ] **Step 6: Wire the pools into the page: state**

In `src/components/AbcjsSingle.svelte`:

Imports: change the ladder import to include `rangeForSpan`, and add the pools import:

```ts
  import { ladderById, rangeForSpan, rangeForStep, stepHref, stepLabel, STEP_PARAM, type LadderStep } from "../lib/ladder";
  import {
    drawFromPool, parsePool, parseSpan, poolFrom, setupSnapshot, spanFrom, togglePoolMember, type Span,
  } from "../lib/unison-pools";
```

In `loadStateFromUrl`, replace:

```ts
    const key = getParam("key");
    if (key && possibleKeys.includes(key)) {
      options.selectedKey = key;
    }
```
with
```ts
    // One key, or several to draw from ("C,F"). An old link names one.
    const keys = parsePool(getParam("key"), possibleKeys);
    if (keys.length > 0) {
      options.selectedKeys = keys;
      options.selectedKey = keys[0];
    }
```

and replace:

```ts
    const ts = getParam("timeSignature");
    if (ts && Object.keys(timeSignatures).includes(ts)) {
      options.selectedTimeSignature = ts;
    }
```
with
```ts
    const meters = parsePool(getParam("timeSignature"), Object.keys(timeSignatures));
    if (meters.length > 0) {
      options.selectedTimeSignatures = meters;
      options.selectedTimeSignature = meters[0];
    }
    // A range that follows the key (a NYSSMA level): scale steps around do,
    // placed on the do at or above `anchor` for each key drawn.
    const span = parseSpan(getParam("span"));
    const anchor = parseInt(getParam("anchor") || "", 10);
    if (span && !isNaN(anchor)) {
      options.rangeSpan = span;
      options.rangeAnchor = anchor;
    }
```

In `stateFromOptions`, just before `    return {`, add:

```ts
    const keys = poolFrom(options.selectedKeys, options.selectedKey, possibleKeys, "F");
    const meters = poolFrom(options.selectedTimeSignatures, ts, Object.keys(timeSignatures), "4/4");
    const selectedRange = options.selectedRange || { ...DEFAULT_TREBLE_RANGE };
```

In its returned object:
- `      selectedRange: options.selectedRange || { ...DEFAULT_TREBLE_RANGE },` becomes `      selectedRange,`
- `      selectedKey: options.selectedKey || "F",` becomes:

```ts
      selectedKeys: keys,
      selectedKey: keys[0],
```

- `      selectedTimeSignature: ts,` becomes:

```ts
      selectedTimeSignatures: meters,
      selectedTimeSignature: meters[0],
      rangeSpan: spanFrom(options.rangeSpan),
      rangeAnchor: Number.isInteger(options.rangeAnchor) ? (options.rangeAnchor as number) : selectedRange.min,
```

In `getInitialState`'s default object:
- after `      selectedKey: "F",` add `      selectedKeys: ["F"],`
- after `      selectedTimeSignature: "4/4",` add:

```ts
      selectedTimeSignatures: ["4/4"],
      rangeSpan: null as Span | null,
      rangeAnchor: DEFAULT_TREBLE_RANGE.min,
```

State vars: after `  let selectedKey = initialState.selectedKey;` add:

```ts
  /** Keys to draw from; `selectedKey` is the key of the exercise on screen. */
  let selectedKeys: Set<string> = new Set(initialState.selectedKeys);
```

after `  let selectedTimeSignature = initialState.selectedTimeSignature;` add:

```ts
  /** Meters to draw from; `selectedTimeSignature` is the exercise's own. */
  let selectedTimeSignatures: Set<string> = new Set(initialState.selectedTimeSignatures);
  /** A NYSSMA level's range: scale steps around do, placed from `rangeAnchor` for each key drawn. */
  let rangeSpan: Span | null = initialState.rangeSpan ?? null;
  let rangeAnchor: number = initialState.rangeAnchor ?? initialState.selectedRange.min;
```

`applySavedPreset`:
- after `    selectedKey = next.selectedKey;` add `    selectedKeys = new Set(next.selectedKeys);`
- after `    selectedTimeSignature = next.selectedTimeSignature;` add:

```ts
    selectedTimeSignatures = new Set(next.selectedTimeSignatures);
    rangeSpan = next.rangeSpan;
    rangeAnchor = next.rangeAnchor;
```

`applyLadderStep`:
- after `    selectedTimeSignature = u.selectedTimeSignature;` add `    selectedTimeSignatures = new Set([u.selectedTimeSignature]);`
- replace `    if (u.selectedKey) selectedKey = u.selectedKey;` with:

```ts
    if (u.selectedKey) {
      selectedKey = u.selectedKey;
      selectedKeys = new Set([u.selectedKey]);
    }
    rangeSpan = null;
```

`setupDirty`:

```ts
  $: setupDirty = [...selectedKeys].join(",") !== DEFAULTS.key || selectedClef !== DEFAULTS.clef ||
    [...selectedTimeSignatures].join(",") !== DEFAULTS.timeSig || measures !== DEFAULTS.measures;
```

`currentOptions`: replace its opening lines:

```ts
  $: currentOptions = {
      selectedClef,
      selectedRange: { ...selectedRange },
      selectedScaleDegrees: Array.from(selectedScaleDegrees),
      selectedSharpDegrees: Array.from(selectedSharpDegrees),
      selectedFlatDegrees: Array.from(selectedFlatDegrees),
      selectedKey,
      selectedRhythms: selectedRhythms.map((r: Rhythm) => r.name),
      selectedTimeSignature,
      measures,
```
with
```ts
  $: currentOptions = {
      selectedClef,
      // The pools and the range they imply - never the key and meter last
      // drawn, or every Generate would mark a preset edited (unison-pools.ts).
      ...setupSnapshot({
        keys: [...selectedKeys], meters: [...selectedTimeSignatures],
        span: rangeSpan, anchor: rangeAnchor, range: selectedRange,
      }),
      selectedScaleDegrees: Array.from(selectedScaleDegrees),
      selectedSharpDegrees: Array.from(selectedSharpDegrees),
      selectedFlatDegrees: Array.from(selectedFlatDegrees),
      selectedRhythms: selectedRhythms.map((r: Rhythm) => r.name),
      measures,
```

`updateUrlFromState`:
- `    params.set("key", selectedKey);` becomes `    params.set("key", [...selectedKeys].join(","));`
- `    params.set("timeSignature", selectedTimeSignature);` becomes `    params.set("timeSignature", [...selectedTimeSignatures].join(","));`
- after the `range` line add:

```ts
    if (rangeSpan) {
      params.set("span", rangeSpan.join(","));
      params.set("anchor", String(rangeAnchor));
    }
```

- [ ] **Step 7: Draw on Generate; range, clef and linked exercises**

In `generateExercise`, at the top of the `try {` block, before `// Validate rhythms first`:

```ts
      // One key and one meter per exercise, drawn from the pools; a range that
      // follows the key is placed for the key drawn, from the same anchor.
      selectedKey = drawFromPool([...selectedKeys]);
      selectedTimeSignature = drawFromPool([...selectedTimeSignatures]);
      if (rangeSpan) selectedRange = rangeForSpan(rangeSpan, selectedKey, rangeAnchor) ?? selectedRange;
```

`handleRangeChange`:

```ts
  function handleRangeChange(newRange: { min: number; max: number }) {
    // Set by hand, the range is the teacher's own and no longer follows the key.
    rangeSpan = null;
    selectedRange = newRange;
  }
```

`updateClef`: at the end of the function, after the `switch`:

```ts
    rangeAnchor = selectedRange.min;
    if (rangeSpan) selectedRange = rangeForSpan(rangeSpan, selectedKey, rangeAnchor) ?? selectedRange;
```

In `openLinkedExercise`, replace:

```ts
      if (score.timeSig.name in timeSignatures) selectedTimeSignature = score.timeSig.name;
      if (score.key && possibleKeys.includes(score.key)) selectedKey = score.key;
```
with
```ts
      if (score.timeSig.name in timeSignatures) {
        selectedTimeSignature = score.timeSig.name;
        // A pool of one follows the exercise, as the single setting always did.
        if (selectedTimeSignatures.size <= 1) selectedTimeSignatures = new Set([score.timeSig.name]);
      }
      if (score.key && possibleKeys.includes(score.key)) {
        selectedKey = score.key;
        if (selectedKeys.size <= 1) selectedKeys = new Set([score.key]);
      }
```

- [ ] **Step 8: The Setup and Range markup**

Key buttons: replace

```svelte
                    <button
                      class="sr-tok {selectedKey === key ? 'sr-on' : ''}"
                      on:click={() => (selectedKey = key)}
                    >{key}</button>
```
with
```svelte
                    <button
                      class="sr-tok {selectedKeys.has(key) ? 'sr-on' : ''}"
                      aria-pressed={selectedKeys.has(key)}
                      on:click={() => {
                        const next = togglePoolMember([...selectedKeys], key);
                        selectedKeys = new Set(next);
                        // The key shown follows the click, and stays inside the pool.
                        selectedKey = next.includes(key) ? key : next[0];
                        if (rangeSpan) selectedRange = rangeForSpan(rangeSpan, selectedKey, rangeAnchor) ?? selectedRange;
                      }}
                    >{key}</button>
```

After that key group's closing `</div>`, inside the same `space-y-2`, add:

```svelte
                {#if selectedKeys.size > 1}
                  <p class="text-xs text-sr-faint">
                    {selectedKeys.size} keys selected. One is drawn at random each time you generate.
                    Click a key to remove it.
                  </p>
                {/if}
```

Meter buttons: replace

```svelte
                  <button
                    class="sr-tok {selectedTimeSignature === ts ? 'sr-on' : ''}"
                    on:click={() => { selectedTimeSignature = ts; }}
                  >{ts}</button>
```
with
```svelte
                  <button
                    class="sr-tok {selectedTimeSignatures.has(ts) ? 'sr-on' : ''}"
                    aria-pressed={selectedTimeSignatures.has(ts)}
                    on:click={() => {
                      const next = togglePoolMember([...selectedTimeSignatures], ts);
                      selectedTimeSignatures = new Set(next);
                      selectedTimeSignature = next.includes(ts) ? ts : next[0];
                    }}
                  >{ts}</button>
```

After the time-signature group's `</div>` add:

```svelte
              {#if selectedTimeSignatures.size > 1}
                <p class="text-xs text-sr-faint">
                  {selectedTimeSignatures.size} meters selected. One is drawn each time you generate.
                </p>
              {/if}
```

In the Range tab, after the `<RangeSelector ... />`, add:

```svelte
            {#if rangeSpan}
              <p class="text-xs text-sr-faint">
                This range follows the key: it is placed around do for each key drawn. Change it
                here and it becomes your own.
              </p>
            {/if}
```

- [ ] **Step 9: Type-check and the full suite**

Run: `bunx astro check`
Expected: `0 errors`, `0 warnings`.
Run: `bun run test`
Expected: everything passes except the known `exercise-link.test.ts` failure.

- [ ] **Step 10: Check it in the browser**

At `http://localhost:4321/sightreading`:

1. One key (F) and one meter (4/4) behave as before. Clicking C adds it ("2 keys selected..."), and clicking F then removes F. The last key cannot be removed.
2. With C, F, G and 4/4, 2/4 selected, Generate six times: key and meter vary within the pools. Save the settings as a preset and Generate again: the preset is NOT marked edited.
3. Old link `/sightreading?key=G&timeSignature=3/4` opens with pools {G} and {3/4}.
4. A ladder step (Step by step → any Unison step) sets single-key and single-meter pools.

- [ ] **Step 11: Commit**

Run `git diff src/components/AbcjsSingle.svelte` and confirm only this task's hunks, then:

```bash
git add src/lib/unison-pools.ts src/lib/ladder.ts src/components/AbcjsSingle.svelte tests/unit/unison-pools.test.ts tests/unit/ladder.test.ts
git commit -m "feat: Unison draws its key and meter from pools, and a range can follow the key"
```

---

### Task 8: Dynamics in the exercise: drawn per phrase, written as `!mf!`, carried by links

**Files:**
- Create: `src/lib/dynamics.ts`
- Modify: `src/lib/generateUnison.ts`:
  - `UnisonScore` (~:1818)
  - `assembleUnisonAbc` (~:1838)
  - `createConcatString` (~:1904)
  - the end of `createNewSrOnce` (~:3137)
- Modify: `src/lib/exercise-link.ts`:
  - `PayloadV1` (~:157)
  - `unisonPayload` (~:398)
  - `readUnison` (~:430)
- Test: `tests/unit/dynamics.test.ts` and `tests/unit/exercise-link.test.ts` (append)

**Interfaces:**
- Produces, in `dynamics.ts`:
  - `DYNAMIC_MARKS = ["p", "mp", "mf", "f"] as const` (soft to loud) and `type DynamicMark`
  - `interface PlacedDynamic { at: number; mark: DynamicMark }`. `at` indexes the part's `chordNoteObject`, rests included.
  - `isDynamicMark(v): v is DynamicMark` and `BARS_PER_PHRASE = 4`
  - `phraseStarts(notes, tsPerMeasure, barsPerPhrase?): number[]`
  - `drawDynamics(starts, set, random?): PlacedDynamic[]`
  - `dynamicsSetFrom(value: unknown): DynamicMark[]`. Takes an array or `"mf,p"`; returns soft-to-loud order; `[]` means Off.
  - `toggleDynamic(set, mark): DynamicMark[]`
  - `readPlacedDynamics(raw: unknown, noteCount: number): PlacedDynamic[] | null`
- Produces, in `generateUnison.ts`:
  - `UnisonScore.dynamics?: PlacedDynamic[]`
  - `export function withDynamics(score: UnisonScore, set: DynamicMark[], random?: () => number): UnisonScore`
  - `createNewSr` reads `params.dynamics` (`DynamicMark[]`)
- Produces, in links: the payload field `dy?: [number, string][]`.

**What abcjs does with these (abcjs 6.4.4, verified in bun with `parseOnly` + `setUpAudio`):**
- `abc_midi_sequencer.js` `setDynamics` turns a `!p!`/`!mp!`/`!mf!`/`!f!` decoration into a beat-velocity triple `[downbeat, strong, other]`:
  - p `[60,50,35]`
  - mp `[75,65,50]`
  - mf `[90,80,65]`
  - f `[105,95,80]`
- With no marking it is `[105,95,85]`, so f equals today's level and mf is a little quieter.
- The velocity holds until the next mark. A decoration on a rest also counts.
- `place-note.js` sets gain to `velocity / 96 × soundFontVolumeMultiplier`, which is linear, so p against f is about 0.57× (≈ −4.9 dB).
- Playback follows the marks with no code of ours. The test below pins it, and Task 9 checks it by ear.

Dynamics are drawn onto the exercise's data, `UnisonScore.dynamics`. Re-labelling syllables, opening a link and changing the set on screen therefore all keep or redraw them without generating new notes. With no `dynamics` param nothing is drawn and `Math.random` is not called, so the Task 1 snapshot is untouched. The `{at, mark}` model leaves room for a later `{at, hairpin, until}` (Level VI).

- [ ] **Step 1: Write the failing tests**

`tests/unit/dynamics.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import abcjs from "abcjs";
import {
  drawDynamics, dynamicsSetFrom, phraseStarts, readPlacedDynamics, toggleDynamic,
} from "../../src/lib/dynamics";
import { assembleUnisonAbc, createNewSr, withDynamics } from "../../src/lib/generateUnison";
import { selectableRhythms } from "../../src/lib/selectable-rhythms";

const q = (rest = false) => ({ noteLength: 8, rhythm: { rest } });
const quiet = () => {};

function exercise(rhythms: string[], dynamics?: string[]) {
  const saved = { log: console.log, warn: console.warn, error: console.error };
  Object.assign(console, { log: quiet, warn: quiet, error: quiet });
  try {
    return createNewSr({
      bpm: 72, tempo: 72, clef: "treble", selectedClef: "treble",
      timeSig: { name: "4/4", tsPerMeasure: 32, beamGroupSize: 8 }, selectedTimeSignature: "4/4",
      measures: 8, maxSkip: 2, range: { min: 14, max: 21 },
      rhythms: selectableRhythms.filter((r) => rhythms.includes(r.name)), selectedRhythms: rhythms,
      scaleDegrees: [1, 2, 3, 4, 5], selectedSharpDegrees: [], selectedFlatDegrees: [], key: "C",
      showSolfege: true, lyricSystem: "movable", rhythmOnly: false, showRhythmSyllables: true,
      syllableSystemId: "kodaly", moveOnEighthNotes: false, accidentalsFollowStep: true,
      ...(dynamics ? { dynamics } : {}),
      partsObject: { numofParts: 1, parts: { Unison: { order: 0, smallName: "U" } } },
    } as any) as any;
  } finally {
    Object.assign(console, saved);
  }
}

describe("where dynamics go", () => {
  test("the first sung note of each 4-bar phrase", () => {
    expect(phraseStarts(Array.from({ length: 32 }, () => q()), 32)).toEqual([0, 16]);
    // A phrase that opens with a rest marks its first sung note.
    expect(phraseStarts([q(true), ...Array.from({ length: 15 }, () => q()), q(true), q()], 32)).toEqual([1, 17]);
    expect(phraseStarts(Array.from({ length: 24 }, () => q()), 24, 4)).toEqual([0, 12]);
  });

  test("a set of one prints once; a repeat of the last mark is not printed again", () => {
    expect(drawDynamics([0, 16, 32], ["mf"])).toEqual([{ at: 0, mark: "mf" }]);
    const rolls = [0.1, 0.1, 0.9];
    expect(drawDynamics([0, 16, 32], ["p", "f"], () => rolls.shift()!)).toEqual([
      { at: 0, mark: "p" }, { at: 32, mark: "f" },
    ]);
    expect(drawDynamics([0, 16], [])).toEqual([]);
  });
});

describe("the set", () => {
  test("Off is empty; a set is kept soft to loud; nonsense is dropped", () => {
    expect(dynamicsSetFrom(undefined)).toEqual([]);
    expect(dynamicsSetFrom("mf,p,x")).toEqual(["p", "mf"]);
    expect(dynamicsSetFrom(["f", "mp"])).toEqual(["mp", "f"]);
  });
  test("a toggle adds in order and can empty the set (Off)", () => {
    expect(toggleDynamic(["mf"], "p")).toEqual(["p", "mf"]);
    expect(toggleDynamic(["mf"], "mf")).toEqual([]);
  });
  test("a link's dynamics are checked", () => {
    expect(readPlacedDynamics([[0, "mf"], [16, "p"]], 32)).toEqual([{ at: 0, mark: "mf" }, { at: 16, mark: "p" }]);
    expect(readPlacedDynamics([[40, "mf"]], 32)).toBeNull();
    expect(readPlacedDynamics([[0, "ff"]], 32)).toBeNull();
    expect(readPlacedDynamics([[16, "p"], [0, "mf"]], 32)).toBeNull();
  });
});

describe("dynamics in the exercise", () => {
  test("off by default: no decoration, no dynamics on the score", () => {
    const [abc, , score] = exercise(["quarter", "half"]);
    expect(abc).not.toMatch(/![a-z]+!/);
    expect(score.dynamics).toBeUndefined();
  });

  test("mf prints once, on the first sung note, as an ABC decoration", () => {
    const [abc, , score] = exercise(["quarter", "half", "quarterRest"], ["mf"]);
    const notes = score.partsObject.parts.Unison.chordNoteObject;
    const first = notes.findIndex((n: any) => !n.rhythm?.rest);
    expect(score.dynamics).toEqual([{ at: first, mark: "mf" }]);
    expect(abc.match(/!mf!/g)).toHaveLength(1);
    expect(abc).toMatch(/!mf![_^=]*[A-Ga-g]/); // right before a note, not a rest
  });

  test("the rhythm staff never carries dynamics", () => {
    const [, , score] = exercise(["quarter"]);
    expect(withDynamics({ ...score, staff: "rhythm" }, ["mf"]).dynamics).toBeUndefined();
  });

  test("playback follows them: abcjs plays p softer than f", () => {
    const [, , score] = exercise(["quarter"]);
    const volumes = (s: any) => {
      const [tune] = (abcjs as any).parseOnly(assembleUnisonAbc(s, { showSolfege: false }));
      return tune.setUpAudio({ qpm: 72 }).tracks.flat().filter((e: any) => e.cmd === "note").map((e: any) => e.volume);
    };
    const plain = volumes(score);
    expect(plain[0]).toBe(105); // abcjs's level with no marking
    const shaped = volumes({ ...score, dynamics: [{ at: 0, mark: "p" }, { at: 16, mark: "f" }] });
    expect(shaped).toHaveLength(32);
    expect(shaped[0]).toBe(60);
    expect(shaped[16]).toBe(105);
    expect(Math.max(...shaped.slice(0, 16))).toBeLessThan(Math.min(...shaped.slice(16)));
  });
});
```

Append to `tests/unit/exercise-link.test.ts`. Use the file's existing imports of `toPayload` and `fromPayload` from `../../src/lib/exercise-link`, and add `createNewSr` and `selectableRhythms` imports if they are absent:

```ts
describe("a unison link keeps the dynamics", () => {
  test("dy round-trips", () => {
    const [, , score] = createNewSr({
      bpm: 72, tempo: 72, clef: "treble", selectedClef: "treble",
      timeSig: { name: "4/4", tsPerMeasure: 32, beamGroupSize: 8 }, selectedTimeSignature: "4/4",
      measures: 8, maxSkip: 2, range: { min: 14, max: 21 },
      rhythms: selectableRhythms.filter((r) => ["quarter"].includes(r.name)), selectedRhythms: ["quarter"],
      scaleDegrees: [1, 2, 3, 4, 5], key: "C", dynamics: ["p", "f"],
      partsObject: { numofParts: 1, parts: { Unison: { order: 0, smallName: "U" } } },
    } as any) as any;
    const back = fromPayload(JSON.parse(JSON.stringify(toPayload({ kind: "unison", score }))));
    expect(back.ok).toBe(true);
    if (back.ok && back.exercise.kind === "unison") expect(back.exercise.score.dynamics).toEqual(score.dynamics);
  });
});
```

On this machine `exercise-link.test.ts` cannot load (Global Constraints), so this test cannot run here. It is there for any bun that parses the file. Steps 6 and 7 cover the link path with `bunx astro check` and the browser.

- [ ] **Step 2: Run them to verify they fail**

Run: `bun test tests/unit/dynamics.test.ts`
Expected: FAIL. `Cannot find module '../../src/lib/dynamics'`.

- [ ] **Step 3: `dynamics.ts`**

```ts
/**
 * Printed dynamics for a unison exercise (NYSSMA Voice levels spec, section 5).
 *
 * The first sung note carries a mark drawn from the set; each phrase - the
 * generator's cadences come every 4 bars - may change it, and a mark that
 * repeats the last one is not printed. Written as ABC decorations (`!mf!`),
 * which abcjs draws under the staff and plays: its sequencer maps p, mp, mf
 * and f to beat velocities 60, 75, 90 and 105 on a downbeat (abcjs 6.4.4,
 * abc_midi_sequencer.js setDynamics; 105 with no marking at all).
 */

export const DYNAMIC_MARKS = ["p", "mp", "mf", "f"] as const;
export type DynamicMark = (typeof DYNAMIC_MARKS)[number];

/** A mark on one note: `at` indexes the part's chordNoteObject, rests included. */
export interface PlacedDynamic {
  at: number;
  mark: DynamicMark;
}

export const isDynamicMark = (v: unknown): v is DynamicMark =>
  typeof v === "string" && (DYNAMIC_MARKS as readonly string[]).includes(v);

/** The generator writes a cadence every four bars (createNewSrOnce, numCadences). */
export const BARS_PER_PHRASE = 4;

/** The first sung note of each phrase. */
export function phraseStarts(
  notes: readonly { noteLength: number; rhythm?: { rest?: boolean } | null }[],
  tsPerMeasure: number,
  barsPerPhrase = BARS_PER_PHRASE
): number[] {
  const phraseLength = tsPerMeasure * barsPerPhrase;
  const starts: number[] = [];
  let offset = 0;
  let lastPhrase = -1;
  notes.forEach((note, index) => {
    const phrase = Math.floor(offset / phraseLength);
    if (phrase > lastPhrase && !note.rhythm?.rest) {
      starts.push(index);
      lastPhrase = phrase;
    }
    offset += note.noteLength;
  });
  return starts;
}

/** A mark for each phrase start, from the set; a repeat of the last mark is left off. */
export function drawDynamics(
  starts: readonly number[],
  set: readonly DynamicMark[],
  random: () => number = Math.random
): PlacedDynamic[] {
  if (set.length === 0) return [];
  const placed: PlacedDynamic[] = [];
  for (const at of starts) {
    const mark = set.length === 1 ? set[0] : set[Math.floor(random() * set.length)];
    if (placed.length === 0 || placed[placed.length - 1].mark !== mark) placed.push({ at, mark });
  }
  return placed;
}

/** The set from options, a preset or a link ("mf,p"), soft to loud. Empty is Off. */
export function dynamicsSetFrom(value: unknown): DynamicMark[] {
  const list: unknown[] = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  return DYNAMIC_MARKS.filter((m) => list.includes(m));
}

/** One mark in or out of the set, kept soft to loud. Taking the last one out is Off. */
export function toggleDynamic(set: readonly DynamicMark[], mark: DynamicMark): DynamicMark[] {
  return set.includes(mark)
    ? set.filter((m) => m !== mark)
    : DYNAMIC_MARKS.filter((m) => m === mark || set.includes(m));
}

/** Dynamics from a link: `[[at, mark], ...]`, in order, inside the part. Null when malformed. */
export function readPlacedDynamics(raw: unknown, noteCount: number): PlacedDynamic[] | null {
  if (!Array.isArray(raw) || raw.length > 64) return null;
  const out: PlacedDynamic[] = [];
  for (const entry of raw) {
    if (!Array.isArray(entry) || entry.length !== 2) return null;
    const [at, mark] = entry;
    if (!Number.isInteger(at) || at < 0 || at >= noteCount || !isDynamicMark(mark)) return null;
    if (out.length && at <= out[out.length - 1].at) return null;
    out.push({ at, mark });
  }
  return out;
}
```

- [ ] **Step 4: `generateUnison.ts`**

Import, after the skip-policy import:

```ts
import {
  drawDynamics,
  dynamicsSetFrom,
  phraseStarts,
  type DynamicMark,
  type PlacedDynamic,
} from "./dynamics";
```

`UnisonScore`: after `  clef?: string;` add:

```ts
  /**
   * Printed dynamics (dynamics.ts), pitched staff only. Kept with the notes so
   * a re-label, a link or a change of set keeps or redraws them without a new
   * exercise.
   */
  dynamics?: PlacedDynamic[];
```

After `assembleUnisonAbc`, add:

```ts
/**
 * The score with dynamics drawn from `set` at each phrase start, or with none
 * when the set is empty (Off) or the staff is the rhythm staff.
 */
export function withDynamics(
  score: UnisonScore,
  set: DynamicMark[],
  random: () => number = Math.random
): UnisonScore {
  if (score.staff !== "pitched" || set.length === 0) {
    const plain = { ...score };
    delete plain.dynamics;
    return plain;
  }
  const notes = Object.values(score.partsObject.parts)[0]?.chordNoteObject ?? [];
  return {
    ...score,
    dynamics: drawDynamics(phraseStarts(notes, score.timeSig.tsPerMeasure), set, random),
  };
}
```

In `assembleUnisonAbc`, add to the `createConcatString(partsObject, {...})` options:

```ts
    dynamics: score.staff === "pitched" ? score.dynamics : undefined,
```

In `createConcatString`'s `params` type, add:

```ts
    /** Marks to print, by note index (dynamics.ts). */
    dynamics?: PlacedDynamic[];
```

After `  var concatString = "";` add:

```ts
  const dynamicAt = new Map((params.dynamics ?? []).map((d) => [d.at, d.mark]));
```

and inside the `while (lengthLeft > 0)` loop, right after `          if (isAttack && syllable) measureString += \`"_${syllable}"\`;`, add:

```ts
          // A dynamic rides on the attack, as an ABC decoration: !mf!C8.
          const mark = dynamicAt.get(index);
          if (isAttack && mark) measureString += `!${mark}!`;
```

At the end of `createNewSrOnce`, replace:

```ts
    const score: UnisonScore = {
      staff: "pitched",
      partsObject: partsObject as PartsObject,
      timeSig,
      key: keyRendered,
      clef,
    };
```
with
```ts
    // Dynamics are drawn last, and only when asked for: with none, nothing is
    // drawn and the random sequence - and the exercise - is what it always was.
    const score: UnisonScore = withDynamics(
      {
        staff: "pitched",
        partsObject: partsObject as PartsObject,
        timeSig,
        key: keyRendered,
        clef,
      },
      dynamicsSetFrom(params.dynamics)
    );
```

- [ ] **Step 5: Run the tests to verify they pass, and that the snapshot holds**

Run: `bun test tests/unit/dynamics.test.ts tests/unit/unison-skip-regression.test.ts tests/unit/unison-relabel.test.ts`
Expected: PASS, every test. The snapshot is unchanged.

- [ ] **Step 6: Links carry `dy`**

In `src/lib/exercise-link.ts`, add the import:

```ts
import { readPlacedDynamics } from "./dynamics";
```

In `PayloadV1`, the unison member gains `dy?: [number, string][];`. It goes after `pt: [string, string, unknown[]][]`, inside the same object type.

In `unisonPayload`'s returned object, after `    pt,` add:

```ts
    ...(score.dynamics?.length ? { dy: score.dynamics.map((d) => [d.at, d.mark] as [number, string]) } : {}),
```

In `readUnison`, before the `return {`:

```ts
  // Dynamics, when the link has them: on the first part's notes, in order.
  const firstPart = Object.values(parts)[0] as { chordNoteObject: unknown[] } | undefined;
  const dynamics = raw.dy === undefined ? undefined : readPlacedDynamics(raw.dy, firstPart?.chordNoteObject.length ?? 0);
  check(dynamics !== null);
```

and in the returned object, after the key/clef spread:

```ts
    ...(staff === "pitched" && dynamics?.length ? { dynamics } : {}),
```

- [ ] **Step 7: Type-check and the suite**

Run: `bunx astro check`
Expected: `0 errors`, `0 warnings`.
Run: `bun run test`
Expected: everything passes except the known `exercise-link.test.ts` failure.

- [ ] **Step 8: Commit**

```bash
git add src/lib/dynamics.ts src/lib/generateUnison.ts src/lib/exercise-link.ts tests/unit/dynamics.test.ts tests/unit/exercise-link.test.ts
git commit -m "feat: unison exercises can print dynamics, drawn per phrase, and abcjs plays them"
```

---

### Task 9: The Dynamics control, and hearing it

**Files:**
- Modify: `src/components/AbcjsSingle.svelte`:
  - imports
  - `loadStateFromUrl`, `stateFromOptions`, `getInitialState`, state vars, `applySavedPreset`, `currentOptions`, `updateUrlFromState`
  - `generateExercise` params
  - a new `handleDynamicsChange`
  - Score options markup (after Annotations, ~:3476)
- Modify (only if Step 6 finds p and f too close): `src/lib/dynamics.ts`, `tests/unit/dynamics.test.ts`

**Interfaces:**
- Consumes: `DYNAMIC_MARKS`, `DynamicMark`, `dynamicsSetFrom` and `toggleDynamic` (Task 8), and `withDynamics` and `assembleUnisonAbc` (Task 8).
- Produces:
  - page state `dynamicsSet: DynamicMark[]` (`[]` is Off)
  - options field `dynamics`. An old preset without it leaves the page's setting alone, per the CLAUDE.md convention for fields added later.
  - URL `dynamics=mf,p`, written only when on
  - `handleDynamicsChange(next: DynamicMark[])`
  - Task 11 sets `dynamicsSet`.

- [ ] **Step 1: State, persistence, URL**

Imports:

```ts
  import { DYNAMIC_MARKS, dynamicsSetFrom, toggleDynamic, type DynamicMark } from "../lib/dynamics";
```

Change `  import { assembleUnisonAbc, type UnisonScore } from "../lib/generateUnison";` to:

```ts
  import { assembleUnisonAbc, withDynamics, type UnisonScore } from "../lib/generateUnison";
```

`loadStateFromUrl`, before `    return Object.keys(options).length > 0 ? options : null;`:

```ts
    if (urlParams.has("dynamics")) options.dynamics = dynamicsSetFrom(getParam("dynamics"));
```

`stateFromOptions` returned object, after `      click: clickFrom(options.click),`:

```ts
      // Undefined when not saved (older presets), which leaves the page's own setting alone.
      dynamics: options.dynamics === undefined ? undefined : dynamicsSetFrom(options.dynamics),
```

`getInitialState` default object, add `      dynamics: [] as DynamicMark[],`.

State var, after `let cursorMode ...`:

```ts
  /** Printed dynamics: the marks to draw from, or empty for Off (dynamics.ts). */
  let dynamicsSet: DynamicMark[] = initialState.dynamics ?? [];
```

`applySavedPreset`, after `    cursorMode = next.cursorMode;`:

```ts
    if (next.dynamics !== undefined) dynamicsSet = next.dynamics;
```

`currentOptions`, after `      cursorMode,`: `      dynamics: dynamicsSet,`

`updateUrlFromState`, after `    params.set("cursor", cursorMode);`:

```ts
    if (dynamicsSet.length) params.set("dynamics", dynamicsSet.join(","));
```

`generateExercise` params, after `        accidentalsFollowStep: accidentalsFollowStep,`:

```ts
        dynamics: rhythmOnly ? [] : dynamicsSet,
```

- [ ] **Step 2: Changing the set keeps the exercise**

After `relabelScore`, add:

```ts
  /**
   * Dynamics are a score option: changing them redraws the marks on the
   * exercise on screen rather than writing a new one. The audio was built
   * with the old velocities, so it goes.
   */
  async function handleDynamicsChange(next: DynamicMark[]) {
    dynamicsSet = next;
    if (!currentScore || currentScore.staff !== "pitched") return;
    currentScore = withDynamics(currentScore, next);
    originalTuneString = assembleUnisonAbc(currentScore, {
      showSolfege: !rhythmOnly,
      lyricSystem: writtenLyricSystem,
      showRhythmSyllables: true,
      syllableSystemId: writtenSyllableSystem,
      customSyllables: $mySyllables,
    });
    renderedString = [originalTuneString, [], currentScore];
    useExerciseScore(currentScore);
    audioBuffer = null;
    createSynth = null;
    if (currentTune) await rerenderTune();
  }
```

- [ ] **Step 3: The control**

In Score options, right after the Annotations block's closing `{/if}`, add:

```svelte
            {#if !rhythmOnly}
            <div class="space-y-2">
              <p class="sr-label">Dynamics</p>
              <div class="flex flex-wrap gap-2" role="group" aria-label="Dynamics">
                <button
                  class="sr-tok {dynamicsSet.length === 0 ? 'sr-on' : ''}"
                  aria-pressed={dynamicsSet.length === 0}
                  on:click={() => handleDynamicsChange([])}
                >Off</button>
                {#each DYNAMIC_MARKS as mark}
                  <button
                    class="sr-tok italic {dynamicsSet.includes(mark) ? 'sr-on' : ''}"
                    aria-pressed={dynamicsSet.includes(mark)}
                    on:click={() => handleDynamicsChange(toggleDynamic(dynamicsSet, mark))}
                  >{mark}</button>
                {/each}
              </div>
              <p class="text-xs text-sr-faint">
                {dynamicsSet.length === 0
                  ? "No dynamics printed."
                  : dynamicsSet.length === 1
                    ? `${dynamicsSet[0]} under the first note. Playback follows it.`
                    : "One under the first note, and each 4-bar phrase may change it. Playback follows them."}
              </p>
            </div>
            {/if}
```

- [ ] **Step 4: Type-check**

Run: `bunx astro check`
Expected: `0 errors`, `0 warnings`.

- [ ] **Step 5: Check it in the browser**

At `http://localhost:4321/sightreading`, with 16 measures, quarter and half, and Dynamics `p` and `f`:

1. Generate until the marks differ between phrases. `p` and `f` print under the staff, on the first note of bar 1 and of later phrases.
2. Click `mf` (now p, mf, f): the same notes, marks redrawn. Click Off: the marks go and the notes stay.
3. Reload: the setting comes back from the URL (`dynamics=p,f`). Copy the exercise link and open it in a new tab: the marks come back with it.
4. Rhythm-only mode shows no Dynamics control.

- [ ] **Step 6: Hear it (spec: "verify in the browser, and scale velocity ourselves if it falls short")**

With an exercise marked `p` then `f`, press Play with the metronome off. The `f` phrase must be clearly louder than the `p` phrase.
- If it is, skip to Step 8.
- If p and f sound nearly the same (abcjs's spread is about 4.9 dB), do Step 7.

- [ ] **Step 7 (only if Step 6 fell short): Widen the velocities**

Add to `src/lib/dynamics.ts`:

```ts
/**
 * abcjs's own p-f spread is narrow (downbeats 60 to 105, about 5 dB). Spread
 * velocities about mf (90) by `factor`, inside MIDI's 1-127.
 */
export function widenedVelocity(volume: number, factor = 1.6): number {
  return Math.max(1, Math.min(127, Math.round(90 + (volume - 90) * factor)));
}

/** For CreateSynth's `sequenceCallback`, which hands over every note before it is rendered. */
export function widenDynamics(tracks: { volume: number }[][]): void {
  for (const track of tracks) for (const note of track) note.volume = widenedVelocity(note.volume);
}
```

Add to `tests/unit/dynamics.test.ts` (import `widenedVelocity`):

```ts
test("widened velocities keep mf and spread p and f apart", () => {
  expect(widenedVelocity(90)).toBe(90);
  expect(widenedVelocity(60)).toBe(42);
  expect(widenedVelocity(105)).toBe(114);
  expect(widenedVelocity(127)).toBe(127);
});
```

In `AbcjsSingle.svelte` `initAudio`, inside `options: { ... }` after `midiTranspose: transposeSemitones,`:

```ts
        // Dynamics (dynamics.ts): abcjs's p-f spread is narrow, so widen it -
        // only for an exercise that has marks, so nothing else changes.
        ...(currentScore?.dynamics?.length ? { sequenceCallback: widenDynamics } : {}),
```

Import `widenDynamics`. Run `bun test tests/unit/dynamics.test.ts` (PASS) and `bunx astro check` (0 errors), then repeat Step 6.

- [ ] **Step 8: Commit**

Run `git diff src/components/AbcjsSingle.svelte` and confirm only this task's hunks, then:

```bash
git add src/components/AbcjsSingle.svelte
# and, if Step 7 was needed:
git add src/lib/dynamics.ts tests/unit/dynamics.test.ts
git commit -m "feat: a Dynamics score option on the Unison page, printed and heard"
```

---

### Task 10: NYSSMA Voice Levels I-V as data

**Files:**
- Create: `src/lib/nyssma-presets.ts`
- Test: `tests/unit/nyssma-presets.test.ts`

**Interfaces:**
- Consumes: `chipMoves`, `ALL_LAND_ON` and `policyFor` (Task 5), `SkipMove`/`SkipPolicy` (Task 2), `DynamicMark` (Task 8), `rangeForSpan` (Task 7) and `selectableRhythms`.
- Produces:
  - `interface NyssmaLevel { id; label; short; summary; keys; meters; span: [number, number]; scaleDegrees; skips: SkipMove[]; landOn: number[]; rhythms; bpm; dynamics: DynamicMark[]; measures; moveEighthNotes }`
  - `nyssmaVoiceLevels: NyssmaLevel[]` and `nyssmaById: Record<string, NyssmaLevel>`
  - `nyssmaPolicy(level): SkipPolicy`
  - `nyssmaRange(level, key, anchorMin): { min: number; max: number }`
  - `NYSSMA_METERS`
  - `nyssmaGenerationParams(level, opts: { key: string; meter: string; clef: string; anchor: number; measures?: number }): Record<string, unknown>` (the `createNewSr` params)

Decisions:
- Levels III-V set `moveEighthNotes: true`, so eighth pairs move. They can still only step, because skips land only on quarters (and halves at V).
- Level I has no skips, so its `landOn` is "no limit" (`ALL_LAND_ON`).
- Scale degrees are exactly the ones inside the span.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, test } from "bun:test";
import {
  nyssmaById, nyssmaGenerationParams, nyssmaPolicy, nyssmaRange, nyssmaVoiceLevels,
} from "../../src/lib/nyssma-presets";
import { selectableRhythms } from "../../src/lib/selectable-rhythms";
import { keySignatures } from "../../src/resources/key-signatures";
import { createNewSr } from "../../src/lib/generateUnison";

const dirArrow = { up: "↑", down: "↓", both: "↕" } as const;
const skipCodes = (id: string) => nyssmaById[id].skips.map((m) => `${m.from}${dirArrow[m.dir]}${m.to}`);
const UNISON_KEYS = ["Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E"];

describe("NYSSMA Voice levels match the chart (spec table)", () => {
  test("five levels, stable ids", () => {
    expect(nyssmaVoiceLevels.map((l) => l.id)).toEqual([
      "nyssma-voice-1", "nyssma-voice-2", "nyssma-voice-3", "nyssma-voice-4", "nyssma-voice-5",
    ]);
    expect(nyssmaVoiceLevels.map((l) => l.short)).toEqual(["Level I", "Level II", "Level III", "Level IV", "Level V"]);
  });

  test("keys and meters", () => {
    expect(nyssmaVoiceLevels.map((l) => l.keys)).toEqual([
      ["C", "F"], ["C", "F", "G"], ["C", "F", "G"], ["C", "F", "G", "D", "Eb"], ["C", "F", "G", "D", "Eb"],
    ]);
    expect(nyssmaVoiceLevels.map((l) => l.meters)).toEqual([
      ["4/4"], ["4/4", "2/4"], ["4/4", "2/4", "3/4"], ["4/4", "2/4", "3/4"], ["4/4", "2/4", "3/4"],
    ]);
  });

  test("range: do-sol, do-la, do-la, do-do', low sol-la", () => {
    expect(nyssmaVoiceLevels.map((l) => l.span)).toEqual([[0, 4], [0, 5], [0, 5], [0, 7], [-3, 5]]);
  });

  test("skips and what they land on", () => {
    expect(skipCodes("nyssma-voice-1")).toEqual([]);
    expect(skipCodes("nyssma-voice-2")).toEqual(["1↑3", "3↑5"]);
    expect(skipCodes("nyssma-voice-3")).toEqual(["1↑3", "3↑5"]);
    expect(skipCodes("nyssma-voice-4")).toEqual(["1↑3", "3↑5", "1↑5"]);
    expect(skipCodes("nyssma-voice-5")).toEqual(["1↑3", "3↑5", "1↑5", "5↓3", "3↓1", "5↓1", "5↑7", "7↑2", "1↓5"]);
    expect(nyssmaVoiceLevels.slice(1).map((l) => l.landOn)).toEqual([[8], [8], [8], [8, 16]]);
    expect(nyssmaPolicy(nyssmaById["nyssma-voice-1"])).toEqual({ kind: "custom", moves: [] });
    expect(nyssmaPolicy(nyssmaById["nyssma-voice-5"])).toMatchObject({ kind: "custom", landOn: [8, 16] });
  });

  test("rhythms and rests", () => {
    expect(nyssmaVoiceLevels.map((l) => l.rhythms)).toEqual([
      ["quarter", "half"],
      ["quarter", "half", "quarterRest"],
      ["quarter", "half", "quarterRest", "eighthEighth"],
      ["quarter", "half", "quarterRest", "eighthEighth"],
      ["quarter", "half", "quarterRest", "eighthEighth", "dotQuarterEighth"],
    ]);
  });

  test("tempo, dynamics, length", () => {
    expect(nyssmaVoiceLevels.every((l) => l.bpm === 72 && l.measures === 8)).toBe(true);
    expect(nyssmaVoiceLevels.map((l) => l.dynamics)).toEqual([
      ["mf"], ["mf"], ["mf"], ["p", "mf", "f"], ["p", "mp", "mf", "f"],
    ]);
  });
});

describe("what the levels name exists", () => {
  test("rhythms the Unison page offers, keys it offers", () => {
    const names = new Set(selectableRhythms.map((r) => r.name));
    for (const l of nyssmaVoiceLevels) {
      for (const r of l.rhythms) expect(names.has(r)).toBe(true);
      for (const k of l.keys) {
        expect(UNISON_KEYS).toContain(k);
        expect(keySignatures[k]).toBeDefined();
      }
    }
  });

  test("scale degrees are exactly the ones in the span", () => {
    for (const l of nyssmaVoiceLevels) {
      const inSpan = new Set<number>();
      for (let s = l.span[0]; s <= l.span[1]; s++) inSpan.add((((s % 7) + 7) % 7) + 1);
      expect([...l.scaleDegrees].sort()).toEqual([...inSpan].sort());
    }
  });

  test("Level V's 9th has the sol below do", () => {
    expect(nyssmaRange(nyssmaById["nyssma-voice-5"], "C", 14)).toEqual({ min: 11, max: 19 }); // G3-A4
  });
});

describe("each level generates", () => {
  test("its first key and meter, treble", () => {
    const saved = { log: console.log, warn: console.warn, error: console.error };
    Object.assign(console, { log: () => {}, warn: () => {}, error: () => {} });
    try {
      for (const l of nyssmaVoiceLevels) {
        expect(() => createNewSr(nyssmaGenerationParams(l, { key: l.keys[0], meter: l.meters[0], clef: "treble", anchor: 14 }) as any)).not.toThrow();
      }
    } finally {
      Object.assign(console, saved);
    }
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun test tests/unit/nyssma-presets.test.ts`
Expected: FAIL. `Cannot find module '../../src/lib/nyssma-presets'`.

- [ ] **Step 3: The module**

```ts
import { ALL_LAND_ON, chipMoves, policyFor } from "./skip-settings";
import type { SkipMove, SkipPolicy } from "./skip-policy";
import type { DynamicMark } from "./dynamics";
import { rangeForSpan } from "./ladder";
import { selectableRhythms } from "./selectable-rhythms";

/**
 * NYSSMA Voice sight-reading levels I-V: Unison's first built-in presets.
 *
 * Source: NYSSMA Manual, Edition 33 (effective July 2023), p. 7-2, "Sight
 * Reading Criteria: Voice", as transcribed and checked by the owner. Spec:
 * docs/superpowers/specs/2026-10-01-nyssma-voice-levels-design.md. Level VI
 * needs compound meter and triplet eighths, and is not here yet.
 *
 * Each level includes the ones before it. The chart sets no length; 8 bars.
 * Clef and pitch range stay the teacher's (the chart lets an example be
 * transposed to the singer): `span` is scale steps around do, placed on the do
 * at or above the teacher's range for each key drawn (rangeForSpan).
 */
export interface NyssmaLevel {
  /** Stable: the page remembers the active level by it. */
  id: string;
  label: string;
  short: string;
  /** One line for the picker. */
  summary: string;
  keys: string[];
  meters: string[];
  span: [below: number, above: number];
  /** 1-based; exactly the degrees inside the span. */
  scaleDegrees: number[];
  skips: SkipMove[];
  /** Lengths (32nds) a skip may land on. */
  landOn: number[];
  rhythms: string[];
  bpm: number;
  dynamics: DynamicMark[];
  measures: number;
  moveEighthNotes: boolean;
}

const QUARTER = 8;
const HALF = 16;
const TEMPO = 72;
const MEASURES = 8;

const DO_MI_SOL_UP = chipMoves("do-mi-sol-up");
const LEVEL_IV_SKIPS = [...DO_MI_SOL_UP, ...chipMoves("do-sol-up")];
const LEVEL_V_SKIPS = [
  ...LEVEL_IV_SKIPS,
  ...chipMoves("sol-mi-do-down"),
  ...chipMoves("sol-do-down"),
  ...chipMoves("sol-ti-re-up"),
  ...chipMoves("do-sol-down"),
];
const RHYTHMS_II = ["quarter", "half", "quarterRest"];
const RHYTHMS_III = [...RHYTHMS_II, "eighthEighth"];
const KEYS_IV = ["C", "F", "G", "D", "Eb"];
const METERS_III = ["4/4", "2/4", "3/4"];

export const nyssmaVoiceLevels: NyssmaLevel[] = [
  {
    id: "nyssma-voice-1", label: "NYSSMA Voice Level I", short: "Level I",
    summary: "C, F · 4/4 · do to sol, by step · quarter, half · mf",
    keys: ["C", "F"], meters: ["4/4"], span: [0, 4], scaleDegrees: [1, 2, 3, 4, 5],
    // No skips, so nothing to limit.
    skips: [], landOn: [...ALL_LAND_ON],
    rhythms: ["quarter", "half"], bpm: TEMPO, dynamics: ["mf"], measures: MEASURES, moveEighthNotes: false,
  },
  {
    id: "nyssma-voice-2", label: "NYSSMA Voice Level II", short: "Level II",
    summary: "+ G, 2/4 · do to la · Do-Mi-Sol ↑ on quarters · quarter rest",
    keys: ["C", "F", "G"], meters: ["4/4", "2/4"], span: [0, 5], scaleDegrees: [1, 2, 3, 4, 5, 6],
    skips: DO_MI_SOL_UP, landOn: [QUARTER],
    rhythms: RHYTHMS_II, bpm: TEMPO, dynamics: ["mf"], measures: MEASURES, moveEighthNotes: false,
  },
  {
    id: "nyssma-voice-3", label: "NYSSMA Voice Level III", short: "Level III",
    summary: "+ 3/4 · eighth pairs",
    keys: ["C", "F", "G"], meters: METERS_III, span: [0, 5], scaleDegrees: [1, 2, 3, 4, 5, 6],
    skips: DO_MI_SOL_UP, landOn: [QUARTER],
    // Eighth pairs move - by step, since a skip may only land on a quarter.
    rhythms: RHYTHMS_III, bpm: TEMPO, dynamics: ["mf"], measures: MEASURES, moveEighthNotes: true,
  },
  {
    id: "nyssma-voice-4", label: "NYSSMA Voice Level IV", short: "Level IV",
    summary: "+ D, E♭ · do to high do · + Do-Sol ↑ · p, f",
    keys: KEYS_IV, meters: METERS_III, span: [0, 7], scaleDegrees: [1, 2, 3, 4, 5, 6, 7],
    skips: LEVEL_IV_SKIPS, landOn: [QUARTER],
    rhythms: RHYTHMS_III, bpm: TEMPO, dynamics: ["p", "mf", "f"], measures: MEASURES, moveEighthNotes: true,
  },
  {
    id: "nyssma-voice-5", label: "NYSSMA Voice Level V", short: "Level V",
    summary: "low sol to la · + Sol-Mi-Do ↓, Sol-Do ↓, Sol-Ti-Re ↑, Do-Sol ↓ on quarters and halves · dotted quarter-eighth · mp",
    // A 9th from the sol below do, so Sol-Ti-Re ↑ and Do-Sol ↓ have their low sol.
    keys: KEYS_IV, meters: METERS_III, span: [-3, 5], scaleDegrees: [1, 2, 3, 4, 5, 6, 7],
    skips: LEVEL_V_SKIPS, landOn: [QUARTER, HALF],
    rhythms: [...RHYTHMS_III, "dotQuarterEighth"], bpm: TEMPO, dynamics: ["p", "mp", "mf", "f"],
    measures: MEASURES, moveEighthNotes: true,
  },
];

export const nyssmaById: Record<string, NyssmaLevel> = Object.fromEntries(
  nyssmaVoiceLevels.map((l) => [l.id, l])
);

/** The level's skip rule. */
export function nyssmaPolicy(level: NyssmaLevel): SkipPolicy {
  return policyFor(1, { skipMode: "custom", customSkips: level.skips, skipLandOn: level.landOn });
}

/** The level's range in a key, placed on the do at or above `anchorMin`. */
export function nyssmaRange(level: NyssmaLevel, key: string, anchorMin: number): { min: number; max: number } {
  const range = rangeForSpan(level.span, key, anchorMin);
  if (!range) throw new Error(`Unknown key ${key}`);
  return range;
}

export const NYSSMA_METERS: Record<string, { name: string; tsPerMeasure: number; beamGroupSize: number }> = {
  "4/4": { name: "4/4", tsPerMeasure: 32, beamGroupSize: 8 },
  "3/4": { name: "3/4", tsPerMeasure: 24, beamGroupSize: 8 },
  "2/4": { name: "2/4", tsPerMeasure: 16, beamGroupSize: 8 },
};

/**
 * What the Unison page sends createNewSr for this level, in one key and
 * meter - for the scripts and tests, so they generate what the page does.
 */
export function nyssmaGenerationParams(
  level: NyssmaLevel,
  opts: { key: string; meter: string; clef: string; anchor: number; measures?: number }
): Record<string, unknown> {
  return {
    bpm: level.bpm, tempo: level.bpm, clef: opts.clef, selectedClef: opts.clef,
    timeSig: NYSSMA_METERS[opts.meter], selectedTimeSignature: opts.meter,
    measures: opts.measures ?? level.measures,
    maxSkip: nyssmaPolicy(level),
    range: nyssmaRange(level, opts.key, opts.anchor),
    rhythms: selectableRhythms.filter((r) => level.rhythms.includes(r.name)),
    selectedRhythms: level.rhythms,
    scaleDegrees: level.scaleDegrees, selectedSharpDegrees: [], selectedFlatDegrees: [],
    key: opts.key, showSolfege: true, lyricSystem: "movable", rhythmOnly: false,
    showRhythmSyllables: true, syllableSystemId: "kodaly",
    allowTiesAcrossBarline: false, moveOnEighthNotes: level.moveEighthNotes, accidentalsFollowStep: true,
    dynamics: level.dynamics,
    partsObject: { numofParts: 1, parts: { Unison: { order: 0, smallName: "U" } } },
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test tests/unit/nyssma-presets.test.ts`
Expected: PASS, every test. Loop it 10 times; the "each level generates" test must never fail:
`for i in $(seq 10); do bun test tests/unit/nyssma-presets.test.ts 2>&1 | grep -E " (pass|fail)$"; done`

- [ ] **Step 5: Commit**

```bash
git add src/lib/nyssma-presets.ts tests/unit/nyssma-presets.test.ts
git commit -m "feat: NYSSMA Voice Levels I-V as presets, from the Edition 33 chart"
```

---

### Task 11: The NYSSMA Voice group in the preset picker

**Files:**
- Modify: `src/components/PresetDropdown.svelte` (props ~:30-45, `Tab` and `tabs` ~:239-250, `openPanel` ~:261, panel ~:496-518)
- Modify: `src/components/AbcjsSingle.svelte`:
  - imports
  - a new `applyNyssmaLevel`
  - `applySavedPreset` and `applyLadderStep`
  - `rememberActivePreset` and `restoreActivePreset` (~:3145-3175)
  - the `<PresetDropdown>` usage (~:3251)

**Interfaces:**
- Consumes: `nyssmaVoiceLevels`, `nyssmaById` and `NyssmaLevel` (Task 10), `rangeForSpan` (Task 7), and page state from Tasks 6, 7 and 9: `skipMode`, `customSkips`, `skipLandOn`, `selectedKeys`, `selectedTimeSignatures`, `rangeSpan`, `rangeAnchor`, `dynamicsSet`.
- Produces:
  - PresetDropdown props: `nyssmaLevels: { id: string; label: string; short: string; summary: string }[] = []`, `activeNyssmaId: string | null = null` and `onSelectNyssma: (id: string) => void`
  - page `applyNyssmaLevel(level: NyssmaLevel)` and `activeNyssmaId`
  - `ActivePresetRecord.level` holds the NYSSMA id

Decision: NYSSMA levels get no "Mark passed" and cannot be assigned. Class keys (`class-validate.ts`) know only `step:`, `uil:` and `saved:`, and the spec does not ask for either. A teacher who wants that can save the level as their own preset.

- [ ] **Step 1: PresetDropdown props and tab**

After `export let store: string | undefined = undefined;` add:

```ts
  /**
   * Built-in levels for this page beside the ladder - the Unison page's NYSSMA
   * Voice levels. Empty, the tab is not shown.
   */
  export let nyssmaLevels: { id: string; label: string; short: string; summary: string }[] = [];
  /** The NYSSMA level the settings came from, if any. */
  export let activeNyssmaId: string | null = null;
  export let onSelectNyssma: (id: string) => void = () => {};
```

Change `  type Tab = 'steps' | 'uil' | 'mine';` to `  type Tab = 'steps' | 'uil' | 'nyssma' | 'mine';`.

In `$: tabs = [...]`, after the `uilOffered` line add:

```ts
    ...(nyssmaLevels.length ? [{ id: 'nyssma', label: 'NYSSMA Voice' }] : []),
```

In `openPanel`, change the first statement to:

```ts
    tab = activeStepId ? 'steps' : activeIsSaved ? 'mine'
      : activeNyssmaId && nyssmaLevels.length ? 'nyssma'
      : uilOffered && Object.values(uilPresets).some(p => p.label === activeLabel) ? 'uil'
      : tab;
```

In the panel, before the final `{:else}` (the one that starts `{#if savedPresets.length === 0 && otherPresets.length === 0}`), add:

```svelte
        {:else if tab === 'nyssma'}
          <ul>
            {#each nyssmaLevels as level}
              <li>
                <button
                  type="button"
                  class="w-full text-left rounded-md px-2 py-1.5 hover:bg-sr-track {level.id === activeNyssmaId ? 'bg-sr-tint' : ''}"
                  aria-current={level.id === activeNyssmaId ? 'true' : undefined}
                  on:click={() => choose(() => onSelectNyssma(level.id))}
                >
                  <span class="block text-sm text-sr-ink font-medium">{level.short}</span>
                  <span class="block text-xs text-sr-muted">{level.summary}</span>
                </button>
              </li>
            {/each}
          </ul>
          <p class="text-xs text-sr-muted px-2 pt-2">
            NYSSMA solo voice sight-reading criteria (Manual, Edition 33). Each level sets keys,
            meters, skips, rhythms, tempo and dynamics; your clef and range stay. Level VI
            comes later.
          </p>
```

- [ ] **Step 2: Apply a level on the page**

Import:

```ts
  import { nyssmaById, nyssmaVoiceLevels, type NyssmaLevel } from "../lib/nyssma-presets";
```

Near `let activeStepId`, add:

```ts
  /** The NYSSMA level the settings came from, when they came from one. */
  let activeNyssmaId: string | null = null;
```

After `applyLadderStep`, add:

```ts
  /**
   * A NYSSMA Voice level (nyssma-presets.ts): the keys and meters to draw
   * from, its skips and what they land on, rhythms, tempo, dynamics, length.
   * Clef and range stay the teacher's - the level's span around do is placed
   * on the do at or above the range they had, and again for each key drawn.
   * Like a ladder step it sets the controls and leaves the exercise.
   */
  function applyNyssmaLevel(level: NyssmaLevel) {
    rhythmOnly = false;
    selectedKeys = new Set(level.keys);
    selectedKey = level.keys[0];
    selectedTimeSignatures = new Set(level.meters);
    selectedTimeSignature = level.meters[0];
    measures = level.measures;
    handleBpmChange(level.bpm);
    selectedRhythms = resolveSelectedRhythms(level.rhythms);
    moveEighthNotes = level.moveEighthNotes;
    allowTiesAcrossBarline = false;
    selectedScaleDegrees = new Set(level.scaleDegrees);
    selectedSharpDegrees = new Set();
    selectedFlatDegrees = new Set();
    skipMode = "custom";
    customSkips = level.skips.map((m) => ({ ...m }));
    skipLandOn = [...level.landOn];
    dynamicsSet = [...level.dynamics];
    // Anchor on the teacher's range - but not again on one a level already
    // placed, or choosing a level twice would walk the range down.
    if (!rangeSpan) rangeAnchor = selectedRange.min;
    rangeSpan = [...level.span];
    selectedRange = rangeForSpan(level.span, selectedKey, rangeAnchor) ?? selectedRange;
    activePresetLabel = level.label;
    activeNyssmaId = level.id;
    activeSavedId = null;
    activeStepId = null;
    revertPreset = () => applyNyssmaLevel(level);
    setTimeout(() => (activePresetSignature = JSON.stringify(currentOptions)), 0);
  }
```

In `applySavedPreset`, after `    activeStepId = null;` add `    activeNyssmaId = null;`. In `applyLadderStep`, after `    activeStepId = step.id;` add `    activeNyssmaId = null;`.

- [ ] **Step 3: Remember it across a reload**

In the `rememberActivePreset("unison", ...)` record, change:

```ts
        ? { label: activePresetLabel, stepId: activeStepId, saved: activeSavedId ? activeSavedPreset : null, sig: activePresetSignature }
```
to
```ts
        ? { label: activePresetLabel, stepId: activeStepId, level: activeNyssmaId, saved: activeSavedId ? activeSavedPreset : null, sig: activePresetSignature }
```

In `restoreActivePreset`, before the final `} else {` / `return;`, add a branch:

```ts
    } else if (rec.level && nyssmaById[rec.level]) {
      const level = nyssmaById[rec.level];
      activeNyssmaId = level.id;
      activeSavedId = null;
      activeStepId = null;
      revertPreset = () => applyNyssmaLevel(level);
```

- [ ] **Step 4: Offer it**

Update the comment above `<PresetDropdown` to say the UIL levels are Choral's while the NYSSMA Voice levels are this page's. Add to the `<PresetDropdown ...>` props:

```svelte
      nyssmaLevels={nyssmaVoiceLevels}
      {activeNyssmaId}
      onSelectNyssma={(id) => { if (nyssmaById[id]) applyNyssmaLevel(nyssmaById[id]); }}
```

- [ ] **Step 5: Type-check and suite**

Run: `bunx astro check`
Expected: `0 errors`, `0 warnings`.
Run: `bun run test`
Expected: everything passes except the known `exercise-link.test.ts` failure.

- [ ] **Step 6: Check it in the browser**

On the Unison page:

1. Preset → `NYSSMA Voice` tab: five levels with their summaries. The Choral page shows no such tab.
2. Choose Level II. The trigger reads "NYSSMA Voice Level II" and is not edited.
   - Setup: keys C, F, G and meters 4/4, 2/4. Tempo 72, 8 measures.
   - Notes: Custom skips with `1 do ↑ 3 mi` and `3 mi ↑ 5 sol`, land on Quarter only.
   - Score options: Dynamics `mf`.
   - Range: do to la in the drawn key, with the "follows the key" note.
3. Generate several times: still not edited. Change Measures to 12: edited. Revert: back to Level II.
4. Choose Level V twice in a row: the range does not move down. Choose a treble range starting G4, then Level I: the range sits on the do at or above G4.
5. Reload: the trigger still reads the level, with Revert working.
6. Save it as "My Level IV" from Level IV, then choose a ladder step and then "My Level IV": everything comes back, including skips, pools and dynamics.

- [ ] **Step 7: Commit**

Run `git diff src/components/AbcjsSingle.svelte src/components/PresetDropdown.svelte` and confirm only this task's hunks, then:

```bash
git add src/components/AbcjsSingle.svelte src/components/PresetDropdown.svelte
git commit -m "feat: NYSSMA Voice Levels I-V in the Unison preset picker"
```

---

### Task 12: `check-nyssma`, sweep cells, mutation tests

**Files:**
- Create: `scripts/check-nyssma.ts`
- Modify: `scripts/sweep.ts` (a NYSSMA section before `// --- report`)
- Modify: `package.json` (scripts) and `CLAUDE.md` (Commands block, plus a short section after "The ladder")

**Interfaces:**
- Consumes: `createNewSr`, `nyssmaVoiceLevels`, `nyssmaGenerationParams` (Task 10) and `rangeForSpan` (Task 7).
- Produces: `bun run check:nyssma`, which exits 1 on any violation or failed generation.

The expectations are copied from the spec table, not read from `nyssma-presets.ts` or `skip-policy.ts`. A fault in either then shows up here.

- [ ] **Step 1: Write the script**

```ts
/**
 * Do the NYSSMA Voice levels write what the chart asks for?
 *
 * Every level x key x meter, treble and bass, RUNS exercises each (40 by
 * default). Each exercise must generate, and:
 *  - sing only the level's skips, named by solfege in the direction listed,
 *    each landing on an allowed note value - measured between SUNG notes, so
 *    a rest cannot hide a skip;
 *  - stay inside the level's range around do, with no accidentals;
 *  - use only the level's rhythms and rests;
 *  - print a dynamic on its first sung note, from the level's set.
 *
 * The expectations below are copied from the spec's table, not read from
 * src/lib/nyssma-presets.ts or skip-policy.ts, so a fault in either shows here.
 * Mutation-tested: make isAllowedMove allow every custom skip, or drop its
 * landing check, and this fails.
 *
 *   bun run check:nyssma              (RUNS=40)
 *   LEVEL=V RUNS=10 bun run check:nyssma
 */
import { createNewSr } from "../src/lib/generateUnison";
import { nyssmaGenerationParams, nyssmaVoiceLevels } from "../src/lib/nyssma-presets";
import { rangeForSpan } from "../src/lib/ladder";

const RUNS = Number(process.env.RUNS ?? 40);
const ONLY = process.env.LEVEL;
const SOLFA = ["do", "re", "mi", "fa", "sol", "la", "ti"];
const ANCHOR = { treble: 14, bass: 7 } as const;

const III_RHYTHMS = ["quarter", "half", "quarterRest", "eighthEighth"];
const IV_SKIPS = ["do↑mi", "mi↑sol", "do↑sol"];
const EXPECTED: Record<string, { span: [number, number]; skips: string[]; landOn: number[]; rhythms: string[]; dynamics: string[] }> = {
  "Level I": { span: [0, 4], skips: [], landOn: [], rhythms: ["quarter", "half"], dynamics: ["mf"] },
  "Level II": { span: [0, 5], skips: ["do↑mi", "mi↑sol"], landOn: [8], rhythms: ["quarter", "half", "quarterRest"], dynamics: ["mf"] },
  "Level III": { span: [0, 5], skips: ["do↑mi", "mi↑sol"], landOn: [8], rhythms: III_RHYTHMS, dynamics: ["mf"] },
  "Level IV": { span: [0, 7], skips: IV_SKIPS, landOn: [8], rhythms: III_RHYTHMS, dynamics: ["mf", "p", "f"] },
  "Level V": {
    span: [-3, 5],
    skips: [...IV_SKIPS, "sol↓mi", "mi↓do", "sol↓do", "sol↑ti", "ti↑re", "do↓sol"],
    landOn: [8, 16], rhythms: [...III_RHYTHMS, "dotQuarterEighth"], dynamics: ["mf", "p", "f", "mp"],
  },
};

const log = console.log;
const quiet = { log: () => {}, warn: () => {}, error: () => {} };
function silenced<T>(fn: () => T): T {
  const saved = { log: console.log, warn: console.warn, error: console.error };
  Object.assign(console, quiet);
  try { return fn(); } finally { Object.assign(console, saved); }
}

type Row = { label: string; runs: number; failed: number; problems: Map<string, number> };
const rows: Row[] = [];

for (const level of nyssmaVoiceLevels.filter((l) => !ONLY || l.short === `Level ${ONLY}`)) {
  const want = EXPECTED[level.short];
  if (!want) { log(`No expectations for ${level.short}`); process.exit(1); }
  for (const key of level.keys) for (const meter of level.meters) for (const clef of ["treble", "bass"] as const) {
    const range = rangeForSpan(want.span, key, ANCHOR[clef])!;
    const row: Row = { label: `${level.short.padEnd(9)} | ${key.padEnd(2)} | ${meter} | ${clef}`, runs: RUNS, failed: 0, problems: new Map() };
    const note = (p: string) => row.problems.set(p, (row.problems.get(p) ?? 0) + 1);
    for (let run = 0; run < RUNS; run++) {
      let result: any;
      try {
        result = silenced(() => createNewSr(nyssmaGenerationParams(level, { key, meter, clef, anchor: ANCHOR[clef] }) as any));
      } catch (e: any) {
        row.failed++;
        note(`failed: ${String(e?.message ?? e).slice(0, 70)}`);
        continue;
      }
      const [abc, , score] = result;
      const notes: any[] = score.partsObject.parts.Unison.chordNoteObject;
      for (const n of notes) if (!want.rhythms.includes(n.rhythm?.name)) note(`rhythm ${n.rhythm?.name}`);
      const sung = notes.filter((n) => !n.rhythm?.rest);
      for (const n of sung) {
        if (n.pitchValue < range.min || n.pitchValue > range.max) note(`outside the range: ${n.name}`);
        if (/[_^=]/.test(n.name)) note(`accidental: ${n.name}`);
      }
      for (let k = 1; k < sung.length; k++) {
        const [a, b] = [sung[k - 1], sung[k]];
        const rise = b.pitchValue - a.pitchValue;
        if (Math.abs(rise) <= 1) continue;
        const name = `${SOLFA[a.degree]}${rise > 0 ? "↑" : "↓"}${SOLFA[b.degree]}`;
        if (Math.abs(rise) >= 7) note(`skip ${name}, an octave or wider`);
        else if (!want.skips.includes(name)) note(`skip ${name}`);
        else if (!want.landOn.includes(b.noteLength)) note(`skip ${name} onto ${b.noteLength}/32`);
      }
      const dynamics: any[] = score.dynamics ?? [];
      if (dynamics[0]?.at !== notes.findIndex((n) => !n.rhythm?.rest)) note("no dynamic on the first sung note");
      for (const d of dynamics) {
        if (!want.dynamics.includes(d.mark)) note(`dynamic ${d.mark}`);
        if (!abc.includes(`!${d.mark}!`)) note(`dynamic ${d.mark} not printed`);
      }
    }
    rows.push(row);
    const bad = [...row.problems.values()].reduce((a, b) => a + b, 0);
    log(`${row.label}  ${row.failed ? `${row.failed} failed` : "ok"}${bad - row.failed > 0 ? `, ${bad - row.failed} problems` : ""}`);
  }
}

const failing = rows.filter((r) => r.problems.size > 0);
log(`\n=== NYSSMA (${RUNS} runs per cell, ${rows.length} cells) ===`);
if (failing.length === 0) {
  log("every cell clean");
} else {
  for (const r of failing) {
    log(`  ${r.label}`);
    for (const [p, count] of r.problems) log(`      ${String(count).padStart(4)} x ${p}`);
  }
  process.exit(1);
}
```

- [ ] **Step 2: Add the script to package.json and run it**

In `package.json` `scripts`, after `"check:rhythm"`, add:

```json
    "check:nyssma": "bun run scripts/check-nyssma.ts",
```

Run: `bun run check:nyssma`
Expected: one `ok` line per cell (Level I 4, II 12, III 18, IV 30, V 30: 94 cells), then `every cell clean`, exit 0.

If any cell fails to generate, report it and stop. Do not loosen the check. A level that cannot generate in a key or meter is a finding for the owner, as the ladder check treats it.

- [ ] **Step 3: Mutation test 1, a loosened `isAllowedMove`**

In `src/lib/skip-policy.ts`, temporarily replace the last statement of `isAllowedMove` (`return policy.moves.some(...)`) with `return true;`.
Run: `LEVEL=II RUNS=10 bun run check:nyssma`
Expected: exit 1, with `skip ...` problems such as `skip do↑sol` and `skip re↑fa`.
Restore: `git checkout -- src/lib/skip-policy.ts`.

- [ ] **Step 4: Mutation test 2, no landing check**

In `src/lib/skip-policy.ts`, temporarily delete the line `  if (policy.landOn && !policy.landOn.includes(nextLength)) return false;`.
Run: `LEVEL=II RUNS=10 bun run check:nyssma`
Expected: exit 1, with problems such as `skip do↑mi onto 16/32`.
Restore: `git checkout -- src/lib/skip-policy.ts`.
Run: `LEVEL=II RUNS=10 bun run check:nyssma`
Expected: `every cell clean`.

- [ ] **Step 5: NYSSMA cells in the sweep**

In `scripts/sweep.ts`, add the import:

```ts
import { nyssmaGenerationParams, nyssmaVoiceLevels } from "../src/lib/nyssma-presets";
```

Before `// ------------------------------------------------------------------ report`, add:

```ts
// ----------------------------------------------------------------- NYSSMA
// Each NYSSMA Voice level (Unison page) in every key and meter it draws from,
// both clefs, at the lengths the measure picker offers around its 8. What the
// exercises contain is scripts/check-nyssma.ts; this is whether they generate.
for (const level of nyssmaVoiceLevels) {
  for (const key of level.keys) {
    for (const meter of level.meters) {
      for (const clef of ["treble", "bass"]) {
        for (const measures of [4, 8, 16]) {
          run(`nyssma ${level.short} | ${key} | ${meter} | ${clef} | ${measures}m`, () => {
            createNewSr(nyssmaGenerationParams(level, {
              key, meter, clef, anchor: clef === "bass" ? 7 : 14, measures,
            }) as any);
          });
        }
      }
    }
  }
}
```

Also update the header comment's first paragraph to mention the NYSSMA Voice levels.

- [ ] **Step 6: Document it in CLAUDE.md**

In the Commands block, after `bun run check:rhythm ...`, add:

```
bun run check:nyssma  # Do the NYSSMA Voice levels write what the chart asks? (see below)
```

After "### The ladder" section's last paragraph, add:

```markdown
### NYSSMA Voice levels

`src/lib/nyssma-presets.ts` holds NYSSMA's solo voice sight-reading Levels
I-V (Manual Ed. 33, p. 7-2), the Unison page's built-in presets ("NYSSMA
Voice" in the picker). Their interval rules are skip lists, not a largest
skip: `src/lib/skip-policy.ts` decides every move the Unison generator makes
(Max skip, or Custom skips with what a skip may land on), and in custom mode a
rest holds the line, so a skip is measured between sung notes.
`tests/unit/unison-skip-regression.test.ts` pins Max skip output byte for
byte. `scripts/check-nyssma.ts` checks every level x key x meter against the
chart's table, copied into the script; it is mutation-tested (loosen
`isAllowedMove` or drop its landing check and it fails). Level VI waits for
compound meter and triplets.
```

- [ ] **Step 7: Commit**

```bash
git add scripts/check-nyssma.ts scripts/sweep.ts package.json CLAUDE.md
git commit -m "feat: check-nyssma holds each NYSSMA level to its chart, and the sweep covers them"
```

---

### Task 13: Final verification

**Files:** none changed, unless something below fails. A failure goes back to the task that owns it.

- [ ] **Step 1: Unit tests**

Run: `bun run test`
Expected: all pass apart from the one known failure, `tests/unit/exercise-link.test.ts` (bun 1.3.0 cannot parse the control-character regex at `src/lib/exercise-link.ts:373`). Skips are as before (5). The snapshot is unchanged, with no "snapshot updated" line.

- [ ] **Step 2: Types**

Run: `bunx astro check`
Expected: `0 errors`, `0 warnings`, `0 hints` (or the hint count it had before this work).

- [ ] **Step 3: Rhythm properties**

Run: `bun run check:rhythm`
Expected: passes, as before this work.

- [ ] **Step 4: Ladder**

Run: `bun run scripts/check-ladder.ts`
Expected: no `PROBLEMS`, and per-step failure rates as before. Unison steps run in Max skip mode, so they are unchanged.

- [ ] **Step 5: NYSSMA**

Run: `bun run check:nyssma`
Expected: `every cell clean`, exit 0.

- [ ] **Step 6: Sweep**

Run: `bun run sweep`
Expected: the choral and unison cells as before (0 failures as shipped on 30 September; differences under about 25 are noise, per CLAUDE.md), and 0 failures in the `nyssma` cells. Record the totals in the summary.

- [ ] **Step 7: Browser playthrough, each level**

Run `bun run dev`, open `/sightreading`, and for each of Levels I-V choose it from Preset → NYSSMA Voice and Generate at least five times. Check by eye and ear:

- **I**: C or F, 4/4, do to sol, by step only, quarters and halves, no rests, `mf` under the first note.
- **II**: C, F or G, 4/4 or 2/4, do to la. Skips are only do→mi or mi→sol upward, each onto a quarter. Quarter rests appear.
- **III**: also 3/4, with eighth pairs that move by step.
- **IV**: also D and E♭, range do to high do, do→sol up allowed. p, mf and f appear across 8 or 16 bars. Play it: a `p` phrase is audibly softer than an `f` one.
- **V**: range from the sol below do to la. sol→mi→do down, sol→do down, sol→ti→re up and do→sol down appear. Skips land on quarters and halves. A dotted quarter-eighth appears. mp is possible.
- Every level: the preset is not marked edited after Generate. Tempo reads 72. Clef and octave stay the teacher's after switching to bass clef and choosing the level again.

- [ ] **Step 8: Report**

Summarise in the PR or hand-off:
- the results of Steps 1-6, with counts
- whether Task 9 Step 7 (velocity widening) was needed
- anything a level could not generate
