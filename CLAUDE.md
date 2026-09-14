# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

This project uses **bun** (`bun.lockb` is committed, and `package.json` declares
`engines.bun >= 1.2.0`). Use bun for installs so the lockfile stays authoritative —
running `npm install` here produces a stray `package-lock.json` that should not be
committed.

```sh
bun install        # Install dependencies
bun run dev        # Start dev server at localhost:4321
bun run build      # Build for production
bun run preview    # Preview production build
bunx astro check   # TypeScript type checking - clean, keep it that way
bun run check:rhythm  # Rhythm generation property checks (see below)
bun run sweep      # Does every kind of exercise generate? (see below)
bun run test       # Unit tests in tests/unit/ (see the timeout note below)
```

`astro check` reports **0 errors and 0 warnings**. It sat at 4 errors for a long
time, which made it useless as a gate — nobody could tell a new error from the
standing ones. Treat any error as a regression.

### Tests

`tests/unit/` holds unit tests run with `bun test` (bun's built-in runner; no
framework to install). 477 pass, 5 skip, 0 fail. Stability matters because the
generators are randomised: the original 50 were verified over 40 consecutive
runs, and `stepwise-eighths.test.ts` over 20 - loop any new generator test the
same way before trusting it.

Run them with **`bun run test`**, not bare `bun test`. The script passes
`--timeout 30000`, and several tests need it: they generate twenty-odd full
exercises so that a rate (accidentals approached by step, say) means something,
the search backtracks, and the time varies by seconds run to run. Against bun's
5s default they went red intermittently as *timeouts*, which reads exactly like
a regression in the generator and is not one. The two worst also carry the
budget at the test itself, so a bare `bun test` is safe for those; if a new one
drifts over the line, give it a timeout rather than shrinking its sample - the
sample size is what makes the number worth asserting.

They had sat broken for a long time (every import pointed at the pre-`src/`
layout), and several assertions had drifted from the code. Two things to know
when one fails:

- **A failure may be the test, not the code.** Several encoded rules the code
  never had: absolute vs relative scale degrees, strict voice ordering where
  unison is legal, a bass line assumed to be used verbatim when it is
  deliberately re-picked. Each of those now carries a comment saying what the
  real contract is — read it before "fixing" the source.
- **Randomised generators make over-strict assertions flaky.** If a test passes
  most runs and fails occasionally, suspect the assertion before the code, and
  reproduce with a loop rather than a single run.

**Skipped**, each saying why at the skip: `index.test.ts` (covers
`voice-leading-rework/`, which nothing imports) and one case in
`generateUnison.test.ts` whose assertion compares semitone offsets to
scale-degree indices.

The UI itself is still validated manually via the browser. Rhythm generation
additionally has property checks, where a wrong answer is quiet:
a malformed measure still renders, a misaligned lyric still prints, a note tied
across a barline still plays. `scripts/check-rhythm.ts` asserts those properties
directly against the generator (no dev server needed), over every one- and
two-rhythm selection in each time signature with ties on and off:

- every emitted measure sums to exactly one measure
- generation succeeds on **exactly** the selections a reference solver proves
  solvable — this is what catches a dead end, where the search fails on
  something a different route would have filled
- a note split across a barline never lands on a dotted note
- the `w:` lyric line keeps one slot per ABC note element, so ties do not shift
  solfège
- each rhythm-syllable system spells the standard figures correctly

Run it after touching `rhythm-generation.ts`, `generateUnison.ts`, or
`rhythm-syllables.ts`. Both halves are meant to be mutation-tested: break a rule
in the generator and the corresponding check should fail.

### The sweep

`scripts/sweep.ts` walks the configuration space a user can actually reach -
every UIL level with its own voicings, keys, chords, rhythms, ranges and max
skip, across all three meters, every measure count the picker offers, all three
voice textures, and both unison modes - and reports the failure rate per cell.
About 1,800 cells; `RUNS` (default 12) exercises each.

Run it after touching generation. It exists because narrow checks lie: every
earlier "0% failures" in this project was measured at 4/4, eight bars, with
hand-picked ranges, and the first sweep that walked the real space found 55%.
A cell is something a choir director can select, so a cell that fails is an
exercise somebody cannot get - and the failures cluster rather than spread, so
the per-cell table matters more than the total. The most recent run: 14 failures
in 22,068 exercises (0.06%), worst cell 25%.

It also reports a quality figure: the share of short notes (an eighth or less)
approached or left by skip - 37.2% on that run. `STEPWISE_EIGHTHS=1` sweeps with
the stepwise-eighths option on, which brings that to 0.3% (658 short notes out
of 258,139) but costs 599 failures (2.71%) across 286 cells, clustered in
16-measure exercises at UIL 5, all "Failed to build valid notes after max
attempts". The rule itself holds: it was 3.3% until build-chord-notes' deadlock
escape was given the fifth to reach for (see the comment at its pool pick), and
every violation that remained was in the bass - none came from decoration.

**The option is now ON by default**, so that failure rate is live: the worst
cells are UIL 5 at sixteen bars in a crowded voicing (three treble parts, minor
keys), up to 75%, and those are selectable from the menus. `failureHint` names
the option first when it fires there. Two attempts at making the search cope
instead were measured and reverted - a stepwise-continuation lookahead did
nothing, and making the step limit best-effort made failures worse and broke the
property that the upper voices hold the rule outright.

## Tech Stack

- **Astro** (SSR, deployed to Vercel) — pages in `src/pages/`, layout in `src/layouts/`
- **Svelte** — interactive components (used with `client:only="svelte"`)
- **TailwindCSS** — styling
- **abcjs** — renders ABC notation strings into sheet music in the browser
- **Tone.js** — audio playback of generated exercises

## Architecture: Generation Pipeline

The core logic lives in `src/lib/` and is orchestrated by `generateChoralExercise()` in `src/lib/generateChoral.ts`. The pipeline runs in this order:

1. **`prepareVoiceParts`** (`prep-params.ts`) — takes key + voice ranges, populates each `VoicePart` with `possibleNotes[]`
2. **`generateRandomRhythm`** (`rhythm-generation.ts`) — returns a flat `Rhythm[]` that fills exactly `measures × tsPerMeasure` eighth-note slots
3. **`generateChordProgression`** (`chord-generation.ts`) — walks the weighted `nextChordPossibilities` graph and simultaneously generates a valid bass line; enforces cadence structure
4. **`buildChordNotes`** (`build-chord-notes.ts`) — fills upper voices (SATB) chord-by-chord, enforcing range, max skip, and no parallel 5ths/octaves
5. **`generateNonChordTones`** (`non-chord-tone-gen.ts`) — probabilistically subdivides chord tones into passing tones, neighbors, etc.
6. **`assembleAbcString`** (`abc-assembly.ts`) — serializes `VoiceNote[][]` into a valid multi-voice ABC notation string

## Key Types (`src/lib/types.ts`)

- `Note` — `{ name, degree, pitchValue }` (pitchValue = index into `src/resources/noteArray.ts`, which is ABC pitch notation)
- `VoiceNote extends Note` — adds `length`, `rest`, optional `accidental`
- `VoicePart` — range, clef, `possibleNotes[]`, `chordNotes[]`
- `PartsObject` — map of part name → `PartDefinition` (clef, full range, currentRange)
- `Chord` — diatonic `root`, `triadNotes[]`, `nextChordPossibilities[]` with weights, optional `sharpScaleDegree`/`flatScaleDegree`
- `Rhythm` — `abcValue[]`, `meterValue[]`, `totalValue` (in 32nd-note units), `pattern` flag
- `TimeSignature` — `name` + `tsPerMeasure` (in 32nd-note units)
- `Cadence` — `progression: CadenceStep[]` describing required chord functions/symbols at phrase endings

## Resources (`src/resources/`)

- `noteArray.ts` — indexed ABC pitch strings from `"C,,"` (very low) to `"c'''"` (very high); pitch arithmetic uses these indices
- `chords.ts` — all diatonic and secondary chords with weighted `nextChordPossibilities` graphs
- `rhythms.ts` — all rhythm objects; `totalValue` is in 32nd-note units (e.g., quarter = 8, half = 16)
- `key-signatures.ts` — maps key strings to sharp/flat degree arrays

## UIL Presets (`src/lib/uil-presets.ts`)

Texas UIL Choir sight-reading levels (1–5). Each preset restricts allowed keys, chord names, rhythm names, voicings, measure range, and max skip. The main UI component (`AbcjsChoral.svelte`) passes `allowedChordNames` to filter the chord list before generation.

## Main UI Component

`src/components/AbcjsChoral.svelte` — the primary Svelte component. Handles all user controls (key, time sig, measures, voicing, UIL preset, NCT probability, BPM), calls `generateChoralExercise()`, and renders the result with `abcjs`. Mounted via `client:only="svelte"` in `src/pages/choral-sightreading.astro`.

## ABC Notation Notes

- The project uses `L:1/32` as the default note length, so all `abcValue` entries are multipliers of 1/32nd note (e.g., a quarter note is `abcValue: ["8"]`)
- Multi-voice ABC strings use `%%score` directive and `[V:name]` voice labels
- `abcjs` is SSR-incompatible; all rendering must happen client-side
