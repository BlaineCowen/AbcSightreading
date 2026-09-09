# Generator Test Suite Design

**Date:** 2026-04-21  
**Branch:** partString-rewrite  
**Goal:** Ensure every combination of user-selectable options in the choral sight-reading generator produces a valid (non-empty, non-throwing) ABC string.

---

## Problem

The generator (`generateChoralExercise` in `src/lib/generateChoral.ts`) is probabilistic and has many input axes. There is currently no automated way to verify that a given set of user options can produce valid output — failures only surface at runtime in the browser.

---

## Approach

**Vitest** as test runner (installed via `bun add -d vitest`). Bun remains the package manager; Vercel deployment is unaffected. Vitest is chosen over `bun test` for better TypeScript error reporting and debuggability (`--inspect-brk` for Chrome DevTools).

`generateChoralExercise` is pure TypeScript with no browser APIs, so it runs directly in Node/Vitest without any shims or mocks.

---

## Pass Condition

For each parameter combination, run the generator up to **10 times**. The combination **passes** if at least one run returns a non-empty `abcString` without throwing. If all 10 runs fail, the test fails and reports:
- The exact params that were used
- The last error thrown

This mirrors the real constraint: the user only needs the generator to succeed once per button press.

---

## Shared Helper

```ts
// src/lib/__tests__/helpers.ts
import { generateChoralExercise } from "../generateChoral";
import type { GenerateChoralParams } from "../generateChoral";

export function assertGeneratesValid(params: GenerateChoralParams, runs = 10) {
  let lastError: unknown;
  for (let i = 0; i < runs; i++) {
    try {
      const { abcString } = generateChoralExercise(params);
      if (abcString && abcString.length > 0) return; // at least one success → pass
    } catch (e) {
      lastError = e;
    }
  }
  throw new Error(
    `Failed all ${runs} runs.\nParams: ${JSON.stringify(params, null, 2)}\nLast error: ${lastError}`
  );
}
```

---

## Default Params

A shared `defaultParams` object holds a known-good baseline. Each test group overrides only the axis it's testing.

```ts
// Baseline: C major, 4/4, 4 Part Mixed, 8 measures, quarter+half rhythms
const defaultParams: GenerateChoralParams = {
  key: "C",
  timeSig: { name: "4/4", tsPerMeasure: 32 },
  partsObject: VOICINGS["4 Part Mixed"],
  measures: 8,
  maxSkip: 4,
  bpm: 76,
  selectedRhythms: allRhythms.filter(r => ["quarter", "half"].includes(r.name)),
  chords: allChords,
  accidentalsByStep: true,
  nctProbability: 0.1,
};
```

---

## Test Matrix

Test file: `src/lib/__tests__/generateChoral.test.ts`

All voicing definitions are extracted from `AbcjsChoral.svelte` into a shared constant in the test file (or a separate `src/lib/voicings.ts` if it becomes useful elsewhere).

### Group 1 — Keys (9 tests)
All 9 keys: `Ab, Eb, Bb, F, C, G, D, A, E`  
Fixed: 4/4, 4 Part Mixed, 8 measures, quarter+half rhythms.

### Group 2 — Time Signatures (3 tests)
All 3 time sigs: `4/4, 3/4, 2/4`  
Fixed: C major, 4 Part Mixed, 8 measures.

### Group 3 — Voicings (6 tests)
All 6 voicings: `4 Part Mixed, 3 Part Mixed, 3 Part Treble, 3 Part Tenor/Bass, 2 Part Treble, Unison`  
Fixed: C major, 4/4, 8 measures.

### Group 4 — Measure Counts (4 tests)
All 4 measure options: `2, 4, 8, 16`  
Fixed: C major, 4/4, 4 Part Mixed.

### Group 5 — UIL Presets (5 tests)
One test per UIL level (1–5). Each test uses:
- The preset's `allowedChordNames`
- Rhythms filtered to `allowedRhythmNames` (non-rests only for main rhythms)
- The first `allowedVoicings` entry for that level
- The first `allowedKeys` entry for that level
- `maxSkip` from the preset
- Measure count: 8 (the UIL `measureRange` field is informational — the actual count always comes from the UI's `measureOptions` of [2, 4, 8, 16])

### Group 6 — Rhythm Selections (4 tests)
Representative rhythm combos that users commonly pick:
- Whole notes only
- Half + quarter
- Quarter + dotted-quarter-eighth
- All non-rest rhythms

Fixed: C major, 4/4, 4 Part Mixed, 8 measures.

---

## Total Scale

~32 test cases × 10 runs = ~320 generator calls. Expected runtime: < 30 seconds.

---

## Tooling Changes

| Change | Details |
|--------|---------|
| `bun add -d vitest` | Adds vitest as dev dependency |
| `package.json` | Add `"test": "vitest run"` to scripts |
| `vitest.config.ts` | Minimal config: `environment: "node"`, include `src/**/*.test.ts` |

---

## File Structure

```
src/lib/__tests__/
  generateChoral.test.ts   # All test groups
  helpers.ts               # assertGeneratesValid helper + defaultParams
```

---

## Out of Scope

- Testing ABC string correctness beyond non-empty / no-throw
- Browser rendering via abcjs
- UI interaction tests
- Musical correctness validation (parallel 5ths, voice crossing, etc.)
