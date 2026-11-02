# Choral generation pipeline, types, resources, UIL

Moved out of CLAUDE.md on 27 October 2026, word for word. Read it before touching Choral generation, chords, rhythms, UIL presets or the part writers.

## Architecture: Generation Pipeline

The core logic lives in `src/lib/` and is orchestrated by `generateChoralExercise()` in `src/lib/generateChoral.ts`. The pipeline runs in this order:

1. **`prepareVoiceParts`** (`prep-params.ts`) — takes key + voice ranges, populates each `VoicePart` with `possibleNotes[]`
2. **`generateRandomRhythm`** (`rhythm-generation.ts`) — returns a flat `Rhythm[]` that fills exactly `measures × tsPerMeasure` eighth-note slots
3. **`generateChordProgression`** (`chord-generation.ts`) — walks the weighted `nextChordPossibilities` graph and simultaneously generates a valid bass line; enforces cadence structure
4. **`buildChordNotes`** (`build-chord-notes.ts`) — fills upper voices (SATB) chord-by-chord, enforcing range, max skip, and no parallel 5ths/octaves
5. **`generateNonChordTones`** (`non-chord-tone-gen.ts`) — probabilistically subdivides chord tones into passing tones, neighbors, etc.
6. **`assembleAbcString`** (`abc-assembly.ts`) — serializes `VoiceNote[][]` into a valid multi-voice ABC notation string

After decoration, the unison splice and the rhyme pass, `varyVoiceRhythms`
(`voice-rhythm.ts`, tests `voice-rhythm.test.ts`) adjusts one voice at a time,
inside one chord only: a dotted quarter + eighth whose eighth leaps becomes two
quarters, and where the level allows the dotted figure one part now and then
takes it against quarters in the others (`DOTTED_IN_ONE_PART`, 0.3). A dotted
quarter + eighth is the same length as two quarters, so no pitch or other voice
changes. A pattern's chord starts on its first sung note
(`rhythm-generation.ts`): eighth rest + eighth used to start on the rest and
failed 29 exercises in 40.

**Two parts at the beginning levels are written melody first**
(`src/lib/two-part-treble.ts`, tests `two-part-treble.test.ts`;
`melodyFirstFor`: SA at Levels 1-2, TB at Level 1, each only where Blaine has
written a piece to measure against; the page and the sweep pass it). It
replaces buildChordNotes for those pairs: on each strong beat it picks a chord
from the level's own (I, IV, V, V7) together with the tune's note and the
lower part's; the chord holds through the weak beats, where both parts may
pass or neighbour by step; the planned progression is kept only into each
cadence. At Level 1 it follows UIL's current wording (Blaine quoted it 7
October 2026; notes/uil-criteria.md): skips only within the chord sounding
(thirds do-mi, mi-sol, fa-la, do-la below, ti-re, sol-ti, and do down to
the sol below), both parts (`chordSkipsFor`, `leapOk`; the restatement's
seams and varied notes keep to it through `levelOneLeapOk`); it begins on do
with mi or a unison do above; dotted halves, no rests (`noRests` on the
preset: an inner phrase's breath is a sung pickup, never a rest,
rhythm-generation `breathRests`). The new rhythm list moved four UIL 1
meter-regression snapshots, updated deliberately. Each pair has a profile (degree shares,
moves, intervals, bar shapes in `barShapeWeight`) from its piece in
`notes/reference-pieces/`; `scripts/sample-choral.ts` writes samples to
compare. SA against "Silence and Tears": alto on do 63% (his 59, before 38),
soprano by step 66% of moves (79, before 49), thirds and sixths 80% (78,
before 61). TB against "The Frog": tenor steps 63% (62, before 31), repeats
25% (28, before 60), bare fifths 15% (13, before 40). No unison opening there
any more (his pieces start in harmony). UIL 1 allows a rare eighth pair; that
alone moved the six UIL 1 meter-regression snapshots, updated deliberately.
Two guards came with it, for every voicing: a decoration may not cross the
voice above or below it (non-chord-tone-gen), and the restatement's varied
note is checked against every lower note sounding under it, not just at its
start (rhyming-phrases `soundingWithin`); neither moved a snapshot.

**Three treble parts (SSA) at Levels 2-3 are written melody first** too
(`src/lib/three-part-treble.ts`, tests `three-part-treble.test.ts`; the page
and the sweep pass `ssaLevelFor`), and 3 Part Treble is now offered at both
levels (UIL lists SSA there; the general writer's SSA was why it was not).
Each part has the job it has in Blaine's pieces: Level 2 ("Oh Lovely
Spring") soprano 1 the tune, soprano 2 holding do, the alto a bass on do and
the sol below; Level 3 draws one of two textures, "The Rainbird" (the same
jobs) or "By the Cradle" (a duet a third under the tune over an alto holding
do). All three notes are chosen together with the chord; no crossing, no
seconds or sevenths between parts, no parallels, the leading tone never
doubled, complete triads preferred but not forced (his are 72-73%).
Level 2 against Spring: soprano 2 on do 59% (59; the general writer 12%),
the alto on do 32% and low sol 50% (his 43 and 41), soprano 2 to alto
unison 28% (25). It still leans on V a little (the tune on re 31%,
his 20%). SATB ("Our Hero", Level 3) shows the same jobs with a tenor filling
the chord; not built yet.

**Every voicing at every UIL level is written melody first now** (Blaine,
7 October 2026: "build out the other voicings and levels. We will clean
them up later"). SA and TB use two-part-treble.ts at all five levels (the
Level 1-2 profiles above Level 2, for now); SSA at Levels 2-3 its own writer;
everything else `src/lib/part-writer.ts` (tests `part-writer.test.ts`),
the SSA method for 2-4 parts, each part a job from his pieces: SATB Levels
1-3 as "Our Hero" (tune, alto holding do, tenor filling, bass on roots),
Levels 4-5 as "A Demon in My View" (alto and tenor moving), SAB the same
without the tenor, TTB/TBB with the Frog's tenor tune over a part holding
do and a bass, SSA at Levels 1, 4, 5 (Level 5 as "Give Me More Love"). The
page passes `partWriterLevel`. All six voicings are offered at every level.
Measured: SATB Level 3 against Our Hero, alto on do 62% (62), chords
complete 83% (83), bass leaping 32% of moves (38). Known: it leans on V
(the tune on re 28%, his 15%), the planned cadences' doing more than chord
choice. Chromatic practice works at every level (Focus on a chord, chromatic
chords ticked, Chromatic frequency): the new writers keep the plan's
chromatic chords and the chord each resolves to (`keepPlan`), and lead the
altered note by step in, by step out the way it leans, never doubled,
costing a voicing without it (`MISSING_ALTERED`). Focus on V/V: 87-100% of
exercises carry fi across the writers; V7/IV 77-100% (the general writer
managed 0% at Levels 2-3). Tests `chromatic-drill.test.ts`.

**No open fifths in four parts** (23 October 2026, Blaine's rule: everyone
on the root is fine, root and third is fine, root and fifth without the
third is not; his SATB pieces have none). The part writer prices one
(`OPEN_FIFTH`), weak beats included, where `INCOMPLETE` does not look, and
the restated phrase's varied tune note may not take away the only third
(rhyming-phrases `leavesOpenFifth`). SATB at UIL 1-5, 60 exercises each,
4-3 suspensions not counted: 7.2/5.9/4.3/1.9/2.0% of chords before,
0.1-0.2% after; the sweep clean. Tenor and bass share a note far less than
in his pieces (TB 1% against Our Hero's 11%, which opens with everyone on
the tune in octaves), and the calibrated ranges are why: at UIL 1 they meet
only on A3 to C4.

**Four parts open on the tune in octaves** (23 October 2026, Blaine said
yes; `src/lib/octave-opening.ts`, part-writer `octaveOpening`): SATB at a UIL
level, half the time at Levels 1-3 and a quarter at 4-5, sings the first bar
(or its first half, Our Hero's split) soprano and alto on the tune, tenor and
bass an octave below, then the writer carries on from there by its own rules.
Copying the tune in after the parts were written almost never fitted at UIL 1
(the joins needed a fourth; the level skips a third). The tenors may go
`TENOR_REACH` (2) steps under their calibrated lowest note for the opening
only, Blaine's permission; nothing else moves the ranges. Those notes are
`doubled`: decoration, the dotted figure in one part and the restatement's
varied note leave them alone, and parallel-check does not count them.
Measured, SATB 40 a level in F: an opening in octaves in 25/40 at UIL 1,
20 at UIL 3, 10 at UIL 5; no parallels.

**Pickup** (23 October 2026, Blaine: an option, "usually starting on scale
degree 5"; `src/lib/pickup.ts`, tests `pickup.test.ts`): Choral's Rhythms
pill, No pickup / Start with a pickup (`pickup=1` in links, `pickup` in
presets, off by default, never in a full-length piece). One beat before bar
1, added to the finished parts so nothing else in the writer moves: the tune
on so 75% of the time (do or mi otherwise, as reachable), the rest on I (or V
under so in major) reaching their first notes within the exercise's leaps,
the lowest part on the root, no parallels; into an octave opening the pickup
is in octaves too. The last bar is a beat short; when a part's last note is
too short to give one up the exercise keeps no pickup. Its length rides on
`renderInput.pickup` (links `u`), and `voiceBodyAbc` starts the first bar
that short. Measured, the tune on so: 30-32 in 40 in G, 16 in F at UIL 1,
where the sopranos cannot reach the so below do (low D4) and an octave
opening on do takes a do pickup. abcjs counts a pickup as a bar when it
wraps lines and numbers bars, so with one the page breaks the lines in the
ABC itself (score-layout `withPickupLines`, `%%setbarnb 0`, the pickup in
front of a full line, bar 1 numbered 1; `lineBreaks` did nothing and
`%%setbarnb` before the first voice crashed the renderer). abcjs sings the
pickup in the count-in's last beat, so the words are a beat fewer ("1,
Ready, Go", count-in.ts `pickup`). MusicXML writes it as measure 0,
implicit. `PICKUP=1 bun run sweep` asks every Choral cell for one;
`QUERY=pickup=1 PAGE=choral scripts/check-start-point.ts` passes. Live's
student view still wraps with abcjs, the pickup counted as a bar.

**The UIL levels follow UIL's current criteria** (read from uiltexas.org on
7 October 2026 and checked with Blaine; notes/uil-criteria.md, which ends
with what is not applied yet). Levels 1-2 are F and G major only, 3/4 and
4/4, no rests, authentic/half/plagal cadences; Levels 1-3 skip only as UIL
lists by chord (`uil-skips.ts`, for the melody-first writers); Level 4 is
diatonic with no modulation; Level 5 is major (no minor keys of its own)
with fi, si, di, te, an occasional dotted eighth and sixteenth, and 32-36
bars for 5A plus 12-16 for 6A (`longVersion`; form-plan puts 5A's full
cadence at bar 32 and a B section in the relative minor). Blaine's "Level
4/5" pieces are Level 5, stopping at bar 32 for 5A. Each preset change that
moved a meter-regression snapshot was checked by restoring the old list
first.

The Choral page opens at UIL Level 3 in F major when the address carries no
settings (AbcjsChoral `arrivedBare`); a tab's dot means changed since the
active preset was chosen.

**No parallel fifths or octaves** (8 October 2026). The writers already
avoided them chord to chord, but decoration made them: with it off, 240 SATB
exercises across UIL 1-5 had none; with it on, one in ten had a fifth,
nearly all a passing note moving against another part (counted as a theory
teacher would: both parts straight from note to note, the same way, perfect
fifth or octave to another, in semitones). Decoration's own check compared
only a figure's first and last notes; `parallelInFigure`
(non-chord-tone-gen) now checks every move a figure makes against every
part. The few left came from later passes (a restated phrase's varied note,
a dotted figure in one part), so `generateChoralExercise` also counts
parallels in the finished exercise (`parallel-check.ts`, tests
`parallel-check.test.ts`; unisons are left out, a shared line is a texture)
and draws again, keeping the draw with the fewest faults. 480 exercises
after: none. Passing notes per exercise unchanged (about 89-90 notes either
way). It moved four Choral meter-regression snapshots, updated deliberately:
three had a parallel fifth, and none of the new ones does. Sight Reading
Factory's choir exercises, counted the same way: 14 of 50 with a parallel
fifth and about 14 parallel octaves or unisons each.

With `accidentalsByStep` on, `generateChoralExercise` also checks the finished
bass against the chromatic-note rule (`bass-chromatic-check.ts`: approached by
step, resolved by step) and draws the exercise again on a fault, up to three
times. It fires about once in 500 exercises; see `notes/bass-chromatic-notes.md`.

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
