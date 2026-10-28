# Unison page: the ladder, courses, readers, progressions, minor, meters, NYSSMA, TMEA, drills

Moved out of CLAUDE.md on 27 October 2026, word for word. Read it before touching the Unison generator, ladder steps, courses (tracks), Reading as, NYSSMA or TMEA levels, meters or drills.

### The ladder

`src/lib/ladder.ts` is abcStepByStep: 24 steps from rhythm alone (ta, ti-ti)
through a single line on the Unison page, then two, three and four parts on the
Choral page, to UIL 5 and past it. Since 7 October 2026 the single line is
pairs, as the curriculum tracks are (`part`: a rhythm drill on Kodály
syllables bringing in one figure, and a sung exercise on rhythms spoken at
least two steps before, sharing the step's number; ids `sbs-NN-rhythm` /
`sbs-NN-notes`). The first ten single-line ids are retired and lead to their
nearest replacement (`RETIRED_STEPS`, through `ladderById`), so old links and
assignments open; a class's old check marks stay on the old ids. A step sets
tempo, the progression option and Kodály, and plays at pitch on a voice
sound (an instrument track's transposition used to stay on into it). It follows sight-singing pedagogy - one new
thing per step, the new thing on familiar material, rhythm before pitch, pitch
out from do, unison before parts - and the file's header says how. Keep to that
when adding steps. Class progress is stored against each step's `id`, so never
rename or reuse one.

`scripts/check-ladder.ts` generates every step in every voicing, key and meter
it allows (`STEP=<id>` for one) and, for Unison steps, checks the line stays in
the step's range and uses at least three pitches - a line stuck on one note
"succeeds". Run it after touching a step or either generator. The whole run
takes about 80 minutes (4 October 2026: steps 1-17 seconds each, 18-20 one to
six minutes, the last three about 22 minutes each, all 0% failed) - slow, not
stuck; give it a long timeout or check one step with STEP=. Step 15 is F and
G only and 15-17 leave out C, because three close parts in C fail at these
ranges; see the comments there.

The Unison generator writes a line that prefers moving to repeating a note,
spreads across the range it was given (favouring the pitches and the scale
degrees it has sung least, in both the chord it picks and the note), and starts
and ends on a note of the tonic triad: do, mi or so, whichever are selected,
not always do. Chromatic chords only steer the line when their altered note is
selected. Before that, a do-re-mi exercise was two-thirds repeated notes; and
when the line was made to end on do and steered there, 1 2 3 5 6 gave so and la
a tenth of the line each against do's third (now each 12-29%).
Which notes a skip may use is **Skips between** (skip-policy.ts
`isAllowedMove`, the row under Max skip, in both modes): the note values
sixteenth, eighth, quarter, dotted quarter and half-or-longer (each note
counts as the largest that fits it, `skipLengthClass`), and BOTH notes of a
skip must be chosen ones - leave eighths out and eighth-eighth-quarter only
steps, where "Skips land on" (exact skips only, the landing note only) still
let an eighth be left by a leap. It replaced Max 8th / Max 16th skip; what
those did not fold into is **Eighth pairs on one pitch** (`EighthSettings` in
`src/lib/short-note-skips.ts`, the generator's caps at 0), which every Unison
ladder step uses. Old presets and links map across (`eighthsFrom`): Max 8th
skip 0, or Move 8th Notes off, is one pitch; 1 leaves eighths and sixteenths
out of Skips between; a list saved with the four old values is all five. The
NYSSMA levels keep "quarters" (and halves at V), stricter than the chart's
landing rule but inside it; their skips per exercise fell (Level III 2.19 to
1.57, V 4.08 to 2.95), every exercise still with one, the chart clean.
On the Unison page Skips between defaults to quarter, dotted quarter and half
(`PAGE_DEFAULT_LAND_ON`, 6 October 2026): an eighth or sixteenth steps
unless it is chosen. A page or link without a list gets that; links write
the list whenever it differs (so every value is written out); a saved page
of every value moved to it once (`abc-skip-land-v2`). The library default
(`DEFAULT_SKIP_SETTINGS`, the generator's snapshots) is still every value,
and ladder steps and NYSSMA levels set their own. `bun run
scripts/check-eighth-steps.ts`: 2,160 exercises at the default, none
failed, no short note skipped to or from. A page left on a ladder step's settings is reset once (`abc-page-defaults-v3`,
7 October 2026): eighth pairs move again, and do is added to notes that lack
it (no do, no progression, no guitar in the video); presets are untouched.
With eighth pairs on one pitch a ti-ti is sung on one pitch, and only inside the pair:
any two eighths in a row used to count, so pairs back to back chained into one
held pitch (up to 18 notes). A note that opens a pair or follows one now moves
when anything lets it. `tests/unit/unison-line-shape.test.ts` holds those rates.

### Drill and loop repeats

A pass that repeats (a drill's repeat, or Loop) starts the next pass when
the music's last beat is over (AbcjsSingle `endPassOnGrid`, from abcjs's
beat callback), anchored on the beat grid, and lets the old pass's audio
ring out under it. It used to wait for the audio buffer to end, which
includes the last note's release (about 0.2 s): every repeat came about
0.4 of a beat late, off the beat with no count-in, and a click on the beat
after the music landed 200 ms before the count-in (Blaine, 15 October 2026:
"the metronome clicks over itself"). No click sounds past the music now,
and a repeat's cursor and click are moved on by however late they started
(`startLoopRepeat`), or they fell about 20 ms further behind the music each
pass. A pass that does not repeat still ends with its audio. `bun run
scripts/check-drill-clicks.ts` (`COUNT_IN=off`, `BPM=`) logs every click
and every pass's music on the audio clock: one click a beat, each pass on a
click.

Where a drill is shows on the music (`DrillBadge.svelte`, 15 October 2026,
Blaine: "better indicators ... like the count in"): at the top-right of the
score as the count-in is at its top-left, in its colours, "Exercise 2 of
4", "Pass 1 of 3" with a dot a pass, and while a new exercise is read
("Read it") its seconds on a draining ring. Kept in full screen. Where
there is no room above the staff (a phone) it stays off the music and the
playback bar's line says it; the line that sat above the score is gone.
Never name a class `ring`: it is Tailwind's ring utility (a box-shadow).

### Curriculum tracks ("courses" on the site)

On the page they are **courses** (My courses, Choose courses, Instrument
courses, /curriculum's heading): "tracks" read as music tracks beside the
play-along's backing tracks (8 October 2026). The code, the API
(`/api/tracks`), the stored fields and every id keep "track"; only the words
a teacher reads changed, so nothing saved moved.

The preset menu's Levels tab lists only what the teacher subscribes to (UIL's five levels are always on Choral, 9 October 2026) on
`/curriculum` (`src/lib/curriculum/catalogue.ts`, its "Choose tracks" link
at the top): the site's own sets - abcStepByStep (subscribed by default,
`DEFAULT_SUBSCRIPTIONS`), UIL, NYSSMA Voice - free to anyone and kept in this
browser when signed out (`sr-subscriptions`, carried to the account on first
sign-in), and the instrument tracks, free too since 9 October 2026 (keeping your own version of a step is still Pro). `UserPreference.curriculumTracks`
is null until the teacher chooses. `/sightreading?nyssma=<level id>` opens a
level.

`src/lib/curriculum/` (tests `curriculum.test.ts`): a sequence for one
instrument that a teacher subscribes to on `/curriculum` (public, each track
at `/curriculum/<id>`; `/api/tracks`) and then finds under **Instrument
tracks** in the preset menu. Beginner band (`band.ts`):
flute, oboe, clarinet, bassoon, alto, tenor and bari sax, trumpet, horn,
trombone, euphonium, tuba, all on one sequence so a band takes the same step
together in concert B♭, E♭, F, then C, each reading its own written key
(`writtenKey`: concert minus the instrument's transposition, so a trumpet reads
C, F, G, D, an alto sax G, C, D, A, a horn F, B♭, C, G). Beginning orchestra
(`orchestra.ts`): violin, viola (alto clef), cello, string bass (−12), the same
rhythm thread with the notes in string order, D, G, A, then C and F. Playback
transpose reaches ±24 for them (bari sax −21, tenor −14).
Each step is a pair: a rhythm drill bringing in one new figure (or meter, or
ties), and a note exercise that only uses rhythms from `RHYTHM_LEAD` (2) or
more steps before - Blaine's rule, "rhythm two steps ahead of the notes". The
rhythm thread ends at step 15 and the notes catch up in 16-17. Ids
(`band-trumpet-03`) are permanent, like ladder ids.
An instrument reads note names, never solfège (Blaine, 9 October 2026): each
step's new notes are written as a template (`StepNames` in band.ts) and named
by letter in that instrument's written key (`src/lib/note-names.ts`, tests
`note-names.test.ts`), so the same step reads "C, D, E" on trumpet and
"B♭, C, D" on flute. On the Unison page a band or string reader (`byLetter`)
names the notes pill, the skip panel and Grade's notes the same way (in one
key by letter, across several by degree number), and Grade says played.

A step half is applied as a saved preset is (`trackStepOptions` ->
AbcjsSingle `applyTrackStep`): instrument, transpose, clef, keys, rhythms,
tempo, and a span around do kept inside the instrument's first-year range
(`rangeLimit`, unison-pools `placeSpan`; links carry it as `limit=`). Edited,
it offers **Keep as my version** (`UserPreference.trackOverrides`, keyed
`track:<step id>:<rhythm|notes>`, which is also the class-progress and
assignment key; an assignment copies the teacher's version in). Links:
`/sightreading?track=<step id>&part=rhythm|notes`.
`bun run scripts/check-tracks.ts` generates every half of every step
(`RUNS`, `TRACK=`): in range, at least three pitches. Clean at 60 runs a step
(7 October 2026) after two fixes: no progression while a line only steps
(it got stuck on two notes) and 8 bars from the first notes; and
`placeMissingChromatics` now stays inside the exercise's range (it wrote a
written F♯ under a clarinet's lowest note).

### Who is reading (the instrument pill)

Beside Preset on the Unison page, **Reading as** (`ReaderPill.svelte`, rules
`src/lib/readers.ts`, tests `readers.test.ts`; 8 October 2026): an
instrument sets the clef, range, transposition and sound, and a level sets
everything else, so nobody walks a menu per standard (SRF asks for the
instrument, then the level). Voices (treble and bass clef as the page's
clef defaults, and Soprano, Alto, Tenor, Bass on TMEA's Level I-II
ranges), every band and string instrument of the courses (their own clef,
range, transposition, sound). Remembered in this browser (`sr-reader`),
applied when chosen and never on load, so links keep their settings. Any
(nothing chosen) is the page as before.

The preset menu keeps to the reader's family (`sectionAllowed`,
`tracksFor`): a voice sees abcStepByStep, NYSSMA and TMEA, and TMEA's part
buttons only its own part; a band or string player only its own course.
Changing the reader re-applies the level on the page, so it stays the
level, not edited: NYSSMA places its span in the voice's range (clef and
anchor the voice's), TMEA moves to the same level for the new part, a
course step to the same step of the new instrument's course
(`stepOnReader`, band to band, strings to strings). A TMEA level or a
course step chosen sets the pill. A saved preset of the teacher's shows as
edited. `placeSpan` with a limit now tries the octave below or above when
the anchored span is cut short and keeps the one with more notes, a do
still in range (a tenor's NYSSMA Level IV in C was C4 to G4, five notes;
now E3 to C4); a placement that fits whole, as every course step's does,
never moves. Every voice x NYSSMA level x key x meter generates (282
cells). TMEA is four levels on the pill (below).

### Chord progressions (Unison)

`src/lib/unison-progressions.ts` (tests `unison-progressions.test.ts`):
harmony first. Not an option any more (7 October 2026, Blaine: hidden and
always on): `writeOverProgression` in skip-settings.ts writes over a
progression whenever the line may skip, and keeps a chord a note when it may
only step (a stepwise line over the chords got stuck on two notes); links and
presets no longer carry it. A diatonic exercise is
written over a short progression - I IV V I, I IV I V I, I V vi IV I,
I vi IV V I, I ii V I, I vi ii V I; in minor i iv v i, i VI iv v i,
i VI VII i, i VII VI VII i (natural minor: the raised leading tone waits for
chromatic progressions) - one chord a bar or two, repeated every four bars,
every phrase ending home. The line belongs to it: a chord note on the
downbeat, the middle of a four-beat bar, wherever the chord changes and on
anything longer than a beat; elsewhere a passing or neighbour note, by step
in and by step out. Every move is one the exercise allows (exact skips and
Max 8th skip too); it starts on do, mi or so and ends on do. A depth-first
search over the sung notes, each choice weighted (steps over leaps, a leap
answered by a step back, the range used, a pitch three times running only
when the harmony leaves nothing else).

Chromatic notes pair a diatonic phrase with a chromatic one: phrase 1 (and
3) is the diatonic progression, phrase 2 (and 4) carries an altered note,
each selected note taking its turn; a four-bar exercise is the chromatic
phrase. Six notes have a chord of their own, and the line sings the note as a
chord tone resolving by step into the next chord: fi (V/V: I, IV V/V, V, I),
si (V/vi), di (V/ii), te (V7/IV, or ♭VII for the rock sound), le (borrowed
iv) and me (borrowed i). ri, li, se and ra have no clean chord (V/iii brings
fi along, the Neapolitan in major brings le) so they are chromatic passing or
neighbour notes over the diatonic chords: on a weak beat, stepped into,
resolving the way they lean, never against their own natural in the chord.
`EXTRA_CHORDS` holds the chords chords.ts lacks (borrowed i, ♭VII, the
Neapolitan for minor). `placeMissingChromatics` stays the safety net, but
never alters the first phrase. In minor the table has the Neapolitan
(lowered 2) and the raised leading tone over harmonic minor's V (`m_V`). Measured: each of
the ten notes, alone and fi with te, in four meters, six keys and 4, 8 and 16
bars: over a progression 100% (fi 99%), the altered note written every time,
no failures.

It replaced the older walk's harmony, which picked a chord for nearly every
note to justify the line, so nothing built on it sat with the melody (and a
question-and-answer period scheme built on that walk sounded wrong and was
taken out). The writer returns the walk's own shape, a chord and a note per
rhythm slot, so spelling, solfège and the ABC are unchanged, and the score
carries the progression (`UnisonScore.harmony`), which the play-along bass
plays (`progressionChords`). Where no progression fits, or no line over six
rhythms does (`PROGRESSION_RHYTHMS`), the older walk writes the exercise;
without the option the output is byte for byte what it was (the regression
snapshots).

Measured: every exercise over a progression across all five NYSSMA levels,
general settings in four meters, eight keys and do re mi in steps;
0 failures in 5,184 Unison and NYSSMA sweep exercises
(`PROGRESSIONS=1 ONLY_UNISON=1 bun run sweep`); the NYSSMA chart clean
(`PROGRESSIONS=1 bun run check:nyssma`).

The sweep and the NYSSMA check now decide progressions per exercise as the
page does (`progressionForPolicy`, which a test holds to agree with
`writeOverProgression`), with no setting needed; they had stayed off unless
`PROGRESSIONS=1` after the page made them always on, so the gate swept
exercises nobody got. `PROGRESSIONS=1` or `0` forces either way, to compare.
As shipped, 8 October 2026: 0 failures in 12,960 Unison and NYSSMA sweep
exercises, the NYSSMA chart clean. The ladder and course checks already
matched (their steps carry `progressions: maxSkip > 1`).

### Minor keys (Unison)

The Unison page has a second row of keys, the relative minors (Fm Cm Gm Dm
Am Em Bm F#m C#m; `src/lib/minor-degrees.ts`), in the same pool as the
major ones. While a minor key is in the pool a second Scale Degrees
selector shows beside the major one (each only while its mode is in the
pool): the natural minor row, raised notes over it (♯6 and ♯7, ringed:
melodic and harmonic minor; ♯1, ♯3 the Picardy third, ♯4) and lowered
under it (♭2 the Neapolitan, ♭5), each labelled with its syllable. A drawn
minor key writes from those degrees (`degreesFor`), a major key from the
major ones. Degrees count from the minor tonic and an accidental is against
the key signature, so ♯7 is G♯ in A minor and B♮ in C minor. Links and
presets carry `minorDegrees`, `minorSharps`, `minorFlats`, `minorSolfege`.

How minor is sung is the teacher's choice (`minorSolfege`, `minorSyllable`
in solfege.ts): La-based (default; the tonic is la, as Choral, Grade and
the tools read minor) or Do-based (do re me fa so le te; raised 6 and 7 are
la and ti). It relabels the exercise on screen, Grade's note names
(`gradeDoPc`), the Tools cards' do (`setPracticeContext`'s third argument)
and, in a minor-only pool, the skip panel's syllables. The Choral page has
the same choice under Annotations while movable do and a minor key are on
(`minorSolfege` in its links and presets, `lyricLineFor`). The Tools drone
holds the tonic (`ExerciseInfo.tonicNote`), the minor chord in minor: it
used to hold the relative major's do and chord under a minor exercise.
`scripts/check-grade.ts KEY=Am` (and `MINOR_SOLFEGE=do`) grades a minor
exercise end to end and checks the wrong note's syllables.

The generator uses the shared key table (`src/resources/key-signatures.ts`;
its own copy had no minor keys, and the major entries were identical: the
snapshots did not move). The guitar plays minor keys (natural minor; m_V
major; ii° as iv): build.ts renders every chord minor uses in all twelve
minor keys (they were all among the major keys' chords already) and an
ending on every minor home chord too (7 October 2026; 24 endings a style,
`public/guitar/` now about 61 MB). Should an ending be missing, the last
bar strums its pattern rather than the guitar falling silent (audio.ts). The
sweep has 648 minor cells (9 keys, 4 meters, natural/harmonic/melodic, all
degrees and 1 3 5, 4/8/16 bars): 0 failures with and without progressions,
7 October 2026 (`MINOR=0` leaves them out). Tests: `unison-minor.test.ts`.
NYSSMA levels and ladder steps stay major.

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
UIL choir sight-reading is simple meter only, so no UIL preset lists a compound
meter.

`tests/unit/meter-regression.test.ts` freezes simple-meter Unison and Choral
output for fixed seeds. Never update its snapshot to make it pass: a failure
means a change reached simple meter.

### NYSSMA Voice levels

`src/lib/nyssma-presets.ts` holds NYSSMA's solo voice sight-reading Levels
I-V (Manual Ed. 33, p. 7-2), the Unison page's built-in presets ("NYSSMA
Voice" in the picker). Their interval rules are skip lists, not a largest
skip: `src/lib/skip-policy.ts` decides every move the Unison generator makes
(Max skip, or exact skips, and Skips between in both), and with exact skips on a
rest holds the line, so a skip is measured between sung notes.
`tests/unit/unison-skip-regression.test.ts` pins Max skip output byte for
byte. `scripts/check-nyssma.ts` checks every level x key x meter x clef (94
cells, 40 runs each) against the chart's table, copied into the script: only
listed skips, landing on allowed lengths, inside the range, only the level's
rhythms, eighths by step, dynamics from the level's set, and no line frozen on
one pitch. It is mutation-tested (loosen `isAllowedMove`, drop its landing
check, or disable the rest-holds-line block and it fails). Last run 2 October
2026: every cell clean. Level VI waits only for triplet eighths and hairpins (compound meter has shipped).

With exact skips (and only then) the line is shaped (`src/lib/unison-phrasing.ts`,
tests `unison-phrasing.test.ts`): a listed skip is weighted hard until the line
has sung one, then until about 3 per 8 bars; notes a skip can start from (do,
mi) are reached for; going back to the note two before (A-B-A) is penalised,
A-B-A-B far more, and a step run carries on; a line with no skip is drawn again
(`SKIP_DRAWS`, 16: at 8 about one exercise in 1,200 had no skip, and the
phrasing test failed about one run in ten). Rests end only at breaths - the end of bar 2, 4 or 6 of 8 -
any other rest is sung as the note of its length, and a level with rests gets
one at bar 4 most of the time. `scripts/measure-nyssma-music.ts` measures it
(treble, 200 runs a cell): a listed skip in 49/40/35/95% of Level II-V
exercises before, 100% at every level now; skips per exercise 2.5/2.2/2.0/4.2;
A-B-A 33-41% of moves -> 11-16%, A-B-A-B 11-25% -> 1-4%; top-2 pitches' share
58/53/52/41% -> 52/48/40/38%; rests inside a phrase 80-88% -> 0, 0.8-0.9 rests
per 8 bars. No more than four eighths are sung in a row (`capEighthRuns`,
`MAX_EIGHTH_RUN`): a figure that would make a longer run becomes a selected
figure of its length with no eighths (ti-ti -> ta, ta-(i) ti -> a half), so
nothing moves off the beat. Before, Levels III-V ran past four in 36-48% of
exercises, up to fourteen in a row; now never. Max skip mode is untouched
(its snapshots pin it).

Compared with Sight Reading Factory's NYSSMA levels (8 October 2026, 127
of theirs at Levels 1-5, soprano 4/4, against ours, the same checks): SRF
breaks the chart where ours does not - skips landing on halves and eighths
at II-V (6, 7, 13, 41 times in 25 exercises), skips to or from eighths,
below do or past the range at IV and V (12 and 15 of 25), mp at Level IV,
no dynamic at I-III - and puts rests anywhere (2-3 an exercise at II,
most inside a phrase). Ours broke nothing, but over a progression it
marked time (Level II 35% repeated notes against SRF's 21%) and Level I
(no progression) ended on do 30% of the time. Now: the progression writer
keeps the line, of up to four progressions (`LINE_CHOICES`), that marks
time least (`markingTime`), and weighs a return to the note two before at
0.35 (`ABA_WEIGHT`); a NYSSMA level ends on do (`endOnDo`, the walk too).
Level II-V repeats 31/23/23/18%, A-B-A 13-18%, every exercise ends on do.
The rest of the repeats are the chart's: with only rising skips (II-IV) a
line comes down only by step, and a half note under V in do-la has re
alone.

### TMEA All-State Voice levels

`src/lib/tmea-presets.ts` (tests `tmea-presets.test.ts`, every cell
`bun run scripts/check-tmea.ts`): TMEA's "Path to All-State" sight-reading
Levels I-IV (Sightreading Levels, July 2025), a set teachers subscribe to on
/curriculum (`TMEA_ALLSTATE`) and the Unison page's presets
(`?tmea=<id>`, class keys `tmea:<id>`). The chart sets keys and range per
voice part, so each level is four presets (Soprano, Alto, Tenor, Bass): the
part's keys, exact range and clef (tenor on a new treble-8 clef, written an
octave up and played with transpose=-12, generateUnison `clefFor`/`octaveUp`),
meters (simple and 6/8 together from Level III: each exercise takes the
rhythms of the meter drawn, AbcjsSingle `rhythmsForMeter`), the length each
meter takes (`measuresByMeter`), the largest interval (a 4th, a 5th, then an
octave; measured across rests, generateUnison `restHoldsLine`), fi and si at
Level IV. The first bar is all quarters, all eighths in 6/8
(`firstBarBeats`, first-bar.ts). Every exercise ends on do, as NYSSMA's do (`endOnDo`; Blaine, 8 October
2026: all the examples do). Tied notes are off (Blaine: never used in an
audition); a compound dotted-eighth figure is not in the catalogue yet.
Matches Sight Reading Factory's Texas All-State levels (checked 8 October
2026). All 180 level x part x key x meter cells clean.
A teacher picks one of four levels (`TMEA_LEVELS`, ids `tmea-voice-1` to
`-4`, the class check mark `tmea:tmea-voice-2`); the part is the one on
Reading as (a plain voice: bass clef the Bass, else the Soprano), and the
pill is set to it. The per-part entries (`tmeaPartLevel`) are what each part
reads. Their ids, the presets' first form (`tmea-voice-2-alto`), still open
as their level with that part set, and check marks kept under them still
read (`tmeaLevelOf`).
