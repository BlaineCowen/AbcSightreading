# Compound meter (6/8, 9/8, 12/8) — Unison first

Date: 2026-10-01
Status: design approved in conversation; awaiting spec review

## Goal

Teachers can generate Unison and rhythm-only sight reading in 6/8, 9/8 and
12/8, felt and counted with a dotted-quarter beat, with a rhythm vocabulary
that belongs to compound meter (three eighths, quarter-eighth, dotted quarter,
...) instead of simple-meter figures (two eighths, dotted quarter-eighth, ...).

Choral (SATB/SSA/TTB) is out of scope for this round: compound meters are not
offered there. Unison proves the beat model first; Choral gets its own spec.

## Decisions

| Question | Decision |
|---|---|
| Meters | 6/8, 9/8 and 12/8 |
| Modes | Unison and rhythm-only (same page, same generator). Not Choral. |
| Vocabulary | Core set, rests, sixteenths. No siciliano (dotted eighth-sixteenth-eighth) yet. |
| UIL presets | Unchanged - simple meter only. UIL choir sight reading does not use compound meter. Compound is a manual choice. |
| BPM and click | BPM counts dotted quarters; click once per dotted-quarter beat, downbeat accented. |
| Syllables | Every built-in system gets compound syllables; Counting uses Eastman (1 la li). |
| Architecture | One shared meter model (approach A), replacing the copied meter tables and hard-coded quarter beats. |

## 1. Meter model

New `src/lib/meter.ts`, the single source of truth for meters. Units are
32nds (`L:1/32`), as everywhere else.

| Meter | beatUnits | beatsPerMeasure | subdivision | tsPerMeasure | kind |
|---|---|---|---|---|---|
| 2/4 | 8 | 2 | 2 | 16 | simple |
| 3/4 | 8 | 3 | 2 | 24 | simple |
| 4/4 | 8 | 4 | 2 | 32 | simple |
| 6/8 | 12 | 2 | 3 | 24 | compound |
| 9/8 | 12 | 3 | 3 | 36 | compound |
| 12/8 | 12 | 4 | 3 | 48 | compound |

- Helpers: `meterByName(name)`, `beatsOf(ts)`, `beatUnitOf(ts)`,
  `isCompound(ts)`, plus the ordered list for pickers.
- `TimeSignature` keeps `name` and `tsPerMeasure`; `beamGroupSize` becomes
  `beatUnits`. Exercise links keep decoding the old field
  (`exercise-link.ts` `readMeter` already accepts beam group 12).
- 3/4 and 6/8 share `tsPerMeasure` 24: nothing may tell meters apart by bar
  length. Always go through the model.
- Grows out of `src/lib/tuner/meters.ts`, which already models 6/8, 9/8 and
  12/8 with a dotted-quarter beat and is tested
  (`tests/unit/metronome-meters.test.ts`); one model, not two.

Replaced by the model (all must read beats from it, not from literal `8` or
the numerator):

- Copied meter tables: `AbcjsSingle.svelte:104`, `AbcjsChoral.svelte:204`,
  `AbcjsBachSR.svelte:117`, `scripts/check-rhythm.ts:28`,
  `scripts/generation-fixtures.ts:9`, `scripts/test-generation.ts:71`.
- Hard-coded quarter beat: `rhythm-generation.ts:188` (`BEAT_UNIT`) and the
  `% 8` placement rules, `rhythm-feasibility.ts:38`, `voice-texture.ts:246`.
- Numerator-as-beats (breaks 12/8 and reads 6/8 as six beats):
  `form-plan.ts:112`, `count-in.ts:14`, `AbcjsSingle.svelte:1559`
  (`parseInt(name[0])`), `AbcjsChoral.svelte:682`, `playback-click.ts:16`.

Choral moves onto the model too, as a pure refactor: its simple-meter output
must not change (see Testing).

## 2. Rhythm vocabulary

Each rhythm in `src/resources/rhythms.ts` gains
`meterKind: "simple" | "compound"`. The two vocabularies never mix: the
generator and picker only use figures of the selected meter's kind.

Every compound figure fills whole beats (12 or 24 units), so compound bars
are filled beat by beat and beat alignment holds by construction.

| Group | Figure | Units |
|---|---|---|
| Core | dotted quarter | 12 |
| Core | three eighths | 4 4 4 |
| Core | quarter-eighth | 8 4 |
| Core | eighth-quarter | 4 8 |
| Core | dotted half (2 beats) | 24 |
| Rests | dotted-quarter rest | z12 |
| Rests | quarter + eighth rest | 8 z4 |
| Rests | eighth rest + two eighths | z4 4 4 |
| Rests | two eighths + eighth rest | 4 4 z4 |
| Rests | dotted-half rest | z24 |
| Sixteenths | six sixteenths | 2 2 2 2 2 2 |
| Sixteenths | two sixteenths + two eighths | 2 2 4 4 |
| Sixteenths | eighth + two sixteenths + eighth | 4 2 2 4 |
| Sixteenths | two eighths + two sixteenths | 4 4 2 2 |
| Sixteenths | quarter + two sixteenths | 8 2 2 |

Phrase endings:

- Cadence long note: dotted half in 6/8 (and as the long note elsewhere).
- Final bar is one full-bar note: dotted half (6/8), dotted half tied to
  dotted quarter (9/8), dotted whole (12/8).
- Interior cadence keeps the "long note + one-beat breath" rule with a
  dotted-quarter breath.

Data fixes made along the way (compound leans on dotted rests):
`dotEighthRest` totalValue 5 vs value 6, `dotQuarterRest` value/total 10,
`dotHalfRest` value 20 vs total 24, and rests missing their `z`.

## 3. Rhythm picker follows the meter kind

- Choosing a compound meter shows only compound figures (Core, Rests,
  Sixteenths groups); choosing a simple meter shows only simple figures.
- The selection is remembered per kind: 4/4 -> 6/8 -> 4/4 restores the
  teacher's simple selection, and returning to compound restores theirs.
- First switch to compound pre-selects the Core set.
- Presets store the meter name and the selected rhythm names as today; a
  preset saved in 6/8 restores 6/8 with its compound selection. UIL presets
  are unchanged.
- Compound icons rendered with `scripts/render-rhythm-icons.mjs`.

## 4. Generation (Unison and rhythm-only)

Rhythm fill (`rhythm-generation.ts`):

- A compound branch fills each bar beat by beat, drawing a weighted figure
  from the selected compound vocabulary; a dotted half takes two beats.
- The phrase skeleton (cadence every 4 bars, final bar, interior cadence)
  is shared, reading beats and beat length from the meter model.
- `rhythm-feasibility.ts` gets the matching compound branch, so
  `check-rhythm` can still prove generation succeeds exactly when a
  solution exists.

Unison (`generateUnison.ts`):

- Melody logic (degree spread, line shape, home tones) is unchanged.
- Beaming groups, ties, and "Move eighths off" pairing work within the
  dotted-quarter beat: a held figure stays inside its beat.
- Notes split across a barline or beat use compound-legal values (dotted
  quarter, quarter + eighth), never values like quarter tied to sixteenth.
- Rhythm-only mode (`createRhythmOnlySr`) inherits all of this.

Choral: compound meters are absent from the Choral meter picker, so Choral
generation never receives one. No compound logic in Choral code this round.

## 5. Notation

- Beaming (`abc-assembly.ts:137`, `generateUnison.ts:1984`) groups by
  `beatUnits`: 6/8 shows two beamed groups of three eighths. A note of a
  quarter or longer never beams - the current `length >= beamUnit` test
  would let a quarter (8) beam inside a 12-unit group.
- Tempo line: `Q:3/8=<bpm>` for compound, `Q:1/4=<bpm>` for simple, in
  `abc-assembly.ts:77`, `exports.ts:38`, `abc-score-file.ts:229`,
  `AbcjsSingle.svelte:1248`.

## 6. Rhythm syllables

`rhythm-syllables.ts` today hard-wires 4 sixteenth slots per beat. Each
system gains a compound slot set: 3 eighth slots per beat, each splitting
into 2 sixteenth slots (6 per beat). Validation checks the slot count
against the meter's subdivision instead of requiring 4.

| System | Three eighths | Six sixteenths |
|---|---|---|
| Counting (Eastman) | 1 la li | 1 ta la ta li ta |
| Takadimi | ta ki da | ta va ki di da ma |
| Kodály | ti ti ti | ti ri ti ri ti ri |
| Gordon | du da di | du ta da ta di ta |

Longer values take the syllable of the slot they start on: quarter-eighth
is "1 · li" (ta · da), a dotted quarter is the beat syllable alone.
Custom ("Mine") systems get compound slots to fill in; until filled they
fall back to Counting. `rhythmSyllableFor` derives slot width from the
meter's subdivision, not `beatUnits / 4`.

## 7. Playback, metronome, count-in

- The BPM number is dotted quarters per minute in compound meter.
  Playback passes abcjs `qpm = bpm * 1.5` and a matching beat subdivision.
- Metronome and count-in click once per dotted-quarter beat, downbeat
  accented: 2 per bar in 6/8, 3 in 9/8, 4 in 12/8.
- `drumPatternFor` and every beats-per-bar call site read from the model.

## 8. UI

- Unison meter picker: 2/4, 3/4, 4/4, then 6/8, 9/8, 12/8, grouped as
  Simple and Compound. Choral picker: simple meters only.
- Tempo control reads "♩. = 60" in compound and "♩ = 60" in simple; the
  number carries over when the kind changes.
- `how-to-use.astro`: a short compound-meter section (dotted-quarter BPM,
  syllables).

## 9. Docs corrected

`notes/uil-criteria.md` (levels 4 and 5) and `docs/ROADMAP.md:13` say UIL
tests compound meter; for choir it does not. Correct both, and the comment
at `uil-presets.ts:24-27` and `tests/unit/uil-presets.test.ts:31` that
treats 6/8 as deferred UIL content.

## Testing

- Unit tests (`tests/unit/`, run with `bun run test`): meter model;
  compound beaming including "a quarter never beams in a 12-unit group";
  syllables per system; `Q:3/8` tempo line; count-in and metronome beats;
  exercise-link round trip for 6/8, 9/8, 12/8; the corrected dotted-rest
  values; rhythm picker selection per kind.
- `scripts/check-rhythm.ts`: add 6/8, 9/8, 12/8 over every one- and
  two-figure selection, ties on and off - every bar sums to one measure,
  no figure crosses a beat, generation succeeds exactly where the reference
  solver says it can, the lyric line keeps one slot per note element.
  Stays mutation-testable.
- `scripts/sweep.ts`: add compound Unison cells; failure rate held to the
  same bar as simple meter.
- Regression guard for the refactor: simple-meter output for fixed seeds
  (Unison and Choral) is identical before and after the meter-model change.
- Done means: `bun run test`, `bunx astro check` (0 errors), and
  `check-rhythm` pass; the sweep shows no new failing cells; 6/8, 9/8 and
  12/8 played through in the browser (beaming, syllables, playback, click).

## Out of scope (follow-ups)

- Compound meter in Choral: strong beats in 12/8, compound NCT figures
  (`nct-patterns.ts`), per-voice rhythm (`voice-rhythm.ts`), stepwise-eighth
  tuning. Its own spec once Unison has proven the model.
- Siciliano figure, other compound meters (3/8, 6/4).
- Eighth-note subdivision click.
- The rhythm game page (`rhythm-game.astro`, fixed at 4/4).
