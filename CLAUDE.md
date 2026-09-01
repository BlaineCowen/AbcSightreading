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
bunx astro check   # TypeScript type checking
```

No automated test suite — logic is validated manually via the browser UI.

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
