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
bun run check:nyssma  # Do the NYSSMA Voice levels write what the chart asks? (see below)
bun run sweep      # Does every kind of exercise generate? (see below)
bun run scripts/check-ladder.ts  # Does every ladder step generate? (see below)
bun run test       # Unit tests in tests/unit/ (see the timeout note below)
```

`astro check` reports **0 errors and 0 warnings**. It sat at 4 errors for a long
time, which made it useless as a gate — nobody could tell a new error from the
standing ones. Treat any error as a regression.

### Tests

`tests/unit/` holds unit tests run with `bun test` (bun's built-in runner; no
framework to install). 929 pass, 5 skip, 0 fail. Stability matters because the
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

On bun 1.3.0 six tests in `tests/unit/exercise-link.test.ts` fail (four choral
byte-for-byte, the full-length piece, unison "a link is short"): the runtime has
no `CompressionStream`, so `packExercise` falls back to codec 0. That is the
environment, not a regression; any other failure is real.

The UI itself is still validated manually via the browser. Rhythm generation
additionally has property checks, where a wrong answer is quiet:
a malformed measure still renders, a misaligned lyric still prints, a note tied
across a barline still plays. `scripts/check-rhythm.ts` asserts those properties
directly against the generator (no dev server needed), over every one- and
two-rhythm selection in each time signature with ties on and off:

- every emitted measure sums to exactly one measure (2/4, 3/4, 4/4, 6/8, 9/8, 12/8), and in compound meter no figure crosses a beat (compound meters run at 4 and 8 bars, simple at 4)
- generation succeeds on **exactly** the selections a reference solver proves
  solvable — this is what catches a dead end, where the search fails on
  something a different route would have filled
- a note split across a barline never lands on a dotted note
- a compound tie joins whole dotted-quarter beats
- the `w:` lyric line keeps one slot per ABC note element, so ties do not shift
  solfège
- each rhythm-syllable system spells the standard figures correctly

Run it after touching `rhythm-generation.ts`, `generateUnison.ts`, or
`rhythm-syllables.ts`. Both halves are meant to be mutation-tested: break a rule
in the generator and the corresponding check should fail.

### The sweep

`scripts/sweep.ts` walks the configuration space a user can actually reach -
every UIL level with its own voicings, keys, chords, rhythms, ranges and max
skip, across all three simple meters, every measure count the picker offers, all
three voice textures, and both unison modes - which also cover Unison's compound
meters (6/8, 9/8, 12/8, Core rhythms, Counting syllables), and the NYSSMA Voice
levels in every key and meter each draws from (94 combinations x 4, 8 and 16
bars = 282 cells) - and reports the
failure rate per cell. 2,192 cells; `RUNS` (default 12) exercises each.

Run it after touching generation. It exists because narrow checks lie: every
earlier "0% failures" in this project was measured at 4/4, eight bars, with
hand-picked ranges, and the first sweep that walked the real space found 55%.
A cell is something a choir director can select, so a cell that fails is an
exercise somebody cannot get - and the failures cluster rather than spread, so
the per-cell table matters more than the total.

**It sweeps with stepwise eighths ON**, because that is what the app ships;
`STEPWISE_EIGHTHS=0` sweeps with it off. The most recent run: **0 failures in
26,304 exercises** as shipped (2,192 cells, 282 of them NYSSMA Voice, all at 0),
measured 2 October 2026 after the NYSSMA levels. The run before that, 0 failures
in 22,920 exercises (1,910 cells, 75 of them the compound Unison
cells, all at 0), 1 October 2026 after compound meter. The run before
that, 0 failures in 22,020 exercises on 30 September 2026 after the bass was
allowed to leave an eighth by leap (below). 1 failure on 29 September once a failed draw
is drawn again (generateChoral `FAILED_DRAW_RETRIES`): the rhythm is drawn once
per attempt and all ten progressions are fitted to it, so a rhythm that cannot
be harmonised failed them all together, and a new draw brings a new rhythm.
Nothing is relaxed. Before that, 112 (0.51%, 67 cells) after the stepwise
limit learned to yield on the last progressions (build-chord-notes
`STEPWISE_YIELD_AFTER`), against 195 (0.89%, 126 cells) on
28 September after the voice-rhythm pass and the pattern-start fix, and 204
(0.93%, 129 cells) on 22 September after the chromatic-bass pass
(notes/bass-chromatic-notes.md).

That yield: beside an eighth, every voice is held to a step at once, and when
every note within a step was then ruled out by a hard rule (parallels, an
overlap) the step could never succeed, so three progressions in four were
abandoned in four-part minor keys and 16-bar C and A minor at UIL 5 failed
18-25%. Now an upper voice may skip there, on the last three of the ten
progressions only. Allowed on every progression it took upper-voice skips
beside short notes from 0.9% to 4-5% in exercises that never failed, because
each skip replaced a backtrack that would have found the step. The 186 recorded
earlier had drifted to 210 by then without any change to generation, so treat
differences under about 25 failures as noise and A/B the worst cells with more
runs (54 each, say) before believing a change moved them.

That is after the voice-overlap rule was made to yield (build-chord-notes,
`overlapGive`). The hand-calibrated UIL ranges put a three-part voicing's lowest
part almost inside the parts above it, so in keys whose dominant root it can
only reach high - C and Bb - the strict no-overlap rule failed 16-bar SSA and
TBB 80-100% of the time, and the sweep read 913 (4.15%). Now strict for six
retries of a step, then a lower part may reach the note the upper part just
left, then one step past it after twelve; overlaps reach the page at 0.5-1.7% of
adjacent-part steps against Bach's 3.4%, and every major key is 0% in those
voicings. Keeping the lowest part low instead was tried and made G and F worse.

Before the ranges changed it was 432 (1.96%), up from 357 when `dotQuarterEighth` was weighted from 5 to 20, and the
A/B says the weight is the whole of it - the same sweep at weight 5 gives 357
failures against 432, and 268,512 short notes against 297,529. A dotted figure
at the rate the real music writes it costs about 29,000 extra eighths, and every
eighth is another place the stepwise rule can fail to find a note.

A handful of those are a different fault worth knowing about: two-measure
exercises at UIL 5 in a minor key fail on "Failed to generate valid progression"
rather than on note-building - there is not room for the cadence the level
requires. 25-42% in those cells, and unrelated to everything above.

It also reports a quality figure: the share of short notes (an eighth or less)
approached or left by skip, and in the bass approached only. The bass may leave
an eighth by leap, G G c2 or G3 G C2, the way it leaps to the next root, but
not arrive on one by leap, G c G2 or G3 C G2 (chord-generation
`besideEighthAt`, build-chord-notes `bassSkipInto`, non-chord-tone-gen
`approachOnly`). Those leaps out are about 4.6% of short notes. 0.7% as shipped on
30 September, 0.8% before the bass change (0.7% before the yield, 1.0% before the voice-rhythm pass), against 37.1% with
`STEPWISE_EIGHTHS=0`.

**The option is ON by default**, so that failure rate is live. Before the
redraw the worst cells were the two-bar UIL 5 minor-key cells above, at
17-50% on one draw; the one failure left is one of them (4 Part Mixed, C
minor, 2/4). A failed draw costs 7 ms at two bars and about a second at
sixteen. `failureHint` names the option first when it fires.

Two numbers moved it. Giving build-chord-notes' deadlock escape the fifth to
reach for took skips from 3.3% to 0.3% (every violation left was in the bass;
none came from decoration). Then letting the step limit yield to the ordinary
maxSkip rather than emptying a voice's list took failures from 599 to 389, at
the price of skips going 0.3% -> 1.1% - a blemish on one note against no
exercise at all.

A stepwise-continuation lookahead was also tried and reverted: measured, it did
nothing. And beware judging any of this on a small harness - a 40-exercise run
at one cell read the yield change as making failures *worse* (4 against 9) and
nearly got it thrown away. That difference was noise; the sweep is the gate.

### The ladder

`src/lib/ladder.ts` is abcStepByStep: 23 presets from rhythm alone (ta, ti-ti)
through a single line on the Unison page, then two, three and four parts on the
Choral page, to UIL 5 and past it. It follows sight-singing pedagogy - one new
thing per step, the new thing on familiar material, rhythm before pitch, pitch
out from do, unison before parts - and the file's header says how. Keep to that
when adding steps. Class progress is stored against each step's `id`, so never
rename or reuse one.

`scripts/check-ladder.ts` generates every step in every voicing, key and meter
it allows (`STEP=<id>` for one) and, for Unison steps, checks the line stays in
the step's range and uses at least three pitches - a line stuck on one note
"succeeds". Run it after touching a step or either generator. Step 15 is F and
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
Max 8th skip and Max 16th skip (`src/lib/short-note-skips.ts`, replacing the old
"Move 8th Notes" switch) cap the moves between the short notes inside a figure;
a figure's first note follows Max skip or the exact skips. At 0 (what Move
eighths off maps to in old presets and links) a ti-ti is sung on one pitch, and only inside the pair:
any two eighths in a row used to count, so pairs back to back chained into one
held pitch (up to 18 notes). A note that opens a pair or follows one now moves
when anything lets it. `tests/unit/unison-line-shape.test.ts` holds those rates.

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
(Max skip, or exact skips with what a skip may land on), and with exact skips on a
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
(`SKIP_DRAWS`). Rests end only at breaths - the end of bar 2, 4 or 6 of 8 -
any other rest is sung as the note of its length, and a level with rests gets
one at bar 4 most of the time. `scripts/measure-nyssma-music.ts` measures it
(treble, 200 runs a cell): a listed skip in 49/40/35/95% of Level II-V
exercises before, 100% at every level now; skips per exercise 2.5/2.2/2.0/4.2;
A-B-A 33-41% of moves -> 11-16%, A-B-A-B 11-25% -> 1-4%; top-2 pitches' share
58/53/52/41% -> 52/48/40/38%; rests inside a phrase 80-88% -> 0, 0.8-0.9 rests
per 8 bars. Max skip mode is untouched (its snapshots pin it).

### Play-along videos

Pro, rhythm only: the peach Video button beside Generate on the Unison page
(`PlayAlongVideo.svelte`, `src/lib/play-along/`; anyone else is sent to
/pricing). A backing loop plays while two bars show, one above the other; a
ball bounces from note to note through the top bar, then the bottom, and the
top turns over to the next bar the moment the ball leaves it, so the reader can
always look a bar ahead. How it looks is `scene.ts` (Recess pastels, a colour
a bar, beat dots, a popping count-in, a finish card with confetti). About 1:30: `barsForLength` picks whole loop repeats and an
even number of bars (36 at 4/4, 100). `frameAt` says what is on screen at any
audio time and `ballAt` where the ball is (tests `play-along-timeline.test.ts`);
both are driven by the AudioContext clock, not abcjs's timer, so it stays on the loop for 90 seconds.

The exercise takes its tempo and meter from the loop (never stretched: that
would change its pitch), is written with ties across the barline off (each bar
is shown alone) and counts as one exercise. Long rhythms generate cleanly:
`bun run scripts/check-play-along-length.ts` (24-72 bars, every meter).
The bars are one abcjs render at a bar a line, each line cut out as its own SVG
image (`bar-images.ts`), drawn on one 1920x1080 canvas, so full screen and the
exported video are the same picture. Export records that canvas and the
mix with MediaRecorder in real time - MP4 where the browser can, else WebM - and
cancels itself if the tab is hidden, since a hidden tab gets no frames.

Sound (the overlay's Sound panel): levels for the loop, a guide (the rhythm
played over the loop, on any rhythm sound) and a click (any metronome sound),
live while it plays and into the export; remembered in this browser. abcjs
cannot render the guide while audio is suspended (`prime()` never settles), so
it is rendered once a click lets sound start - at the latest on Play.

Tracks are listed in `backing-tracks.ts` (bpm, meter, bars, where beat 1 falls,
an optional intro) with files in `public/backing/`. A loop repeats for as long
as the exercise; a `fullLength` track is a whole arrangement played once, and
the exercise is written to exactly its bars. The real tracks are arranged from
ONE Splice pack each, so the parts share a session and a key, by
`scripts/backing/<track>.ts` on the shared `engine.ts` (`bun run
scripts/backing/soul-4-4-80.ts`): count-in, an intro, parts entering section by
section, an ending. The samples stay in `~/Splice`; only the finished mix is
committed, which is what Splice's licence allows. Blaine's ear so far: keep
risers and impacts sparing, no vocals over the exercise, no congas in the
reggaeton. 3/4, 2/4 and 6/8 still use synthesized placeholders
(`scripts/make-placeholder-loops.ts`) until real tracks replace them.

## abcTuner

`/tuner` (Pro - `hasPremium()`, checked in `src/pages/tuner.astro`): every
practice tool at full size, a tab each (`AbcTuner.svelte`): tuner, Analysis,
metronome, drone, timer and
the scale challenge. The mic stays on across tabs. In the navbar as abcTuner, and
the practice pages reach it from their tools.

The practice pages carry a Tools button in the bottom-right corner
(`src/components/tools/ToolsWheel.svelte`): a wheel of six tools - tuner,
metronome, drone, starting pitches, analysis, timer - each opening as a card.
A practice page has one metronome (`src/lib/tools/metronome-link.ts`, tests
`metronome-link.test.ts`): the Tools card, the transport's metronome icon,
volume and Click are the same thing, kept in the tuner store (`clickWithMusic`,
`metronomeVolume`, `metronomeRunning`, and the session-only `exercisePlaying`
/ `musicClick`). Its tempo is the page's tempo, set from either side, and its
meter the exercise's. Ticking on its own, it carries on into Play as the
exercise's click from beat 1 of the count-in (`exercisePlays`), and stops with
the music. The click under an exercise follows its subdivision, accent and
sound (`src/lib/playback-click.ts`): Choral writes them into abcjs's drum
pattern (only when this playback clicks, so a change rebuilds the synth),
Unison schedules each beat's clicks with the metronome's own samples. On
`/tuner` there is no exercise and it keeps its own tempo and meter.
Its five sounds (Quartz, the default, Block, Tick, Sine, Square) are Ludwig
Peter Müller's CC0 recordings, chosen by ear: three files each in
`public/clicks` (accent, beat, and a subdivision pre-pitched up), credited in
`public/clicks/CREDITS.txt`. Only beat 1 is accented. For the Choral drum
track each file has a drum note of its own from MIDI 60 up (`drumNoteFor`,
since abcjs caches samples by note), and the soundfont proxy redirects those
notes to the files. Old sound names in settings and presets map across
(`toClickSound`).
Pages publish their exercise with `setPracticeContext(abc, bpm)`
(`src/lib/tools/context.ts`), which reads do, the meter and each part's first
sounding pitch from the ABC through `scoreFromAbc`. The listening tools open the
mic only while showing; the drone (`src/lib/tools/state.ts`), metronome and
timer keep going with the card closed. Analysis has four views: Pitch (the
trace and its half-minute stats), Spectrum (live, with the outline, numbered
harmonics and F1/F2 as overlays), Harmonics (levels, H1 vs H2, ring,
brightness) and Vowel (a guess among ee, eh, ah, oh, oo on a vowel chart).
The maths is `src/lib/tuner/voice-spectrum.ts` (tests `voice-spectrum.test.ts`).
Formants come two ways: below C4 (`LPC_BELOW_HZ`) by LPC on the mic's raw
samples (`TunerEngine.readSamples`), above it by analysis by synthesis over
the harmonics' levels (F1, F2 and F3 searched; a quiet harmonic counts
against a model that would make it audible). On Blaine's own recording of
i e a o u in chest voice at F3, LPC named 67 of 68 frames and analysis by
synthesis flipped between two answers; LPC fails on high voices, where
analysis by synthesis works (his falsetto). The live loop is
`src/lib/tools/voice-analysis.ts`, reading `TunerEngine.readSpectrum`. The singer says low or high voice (the pitch
cannot: a man's [o] above G3 read as a woman's [u]). Vowels are only
trusted below about A4, and rough above E4. It is all from the mic alone; nothing compares
against the written notes yet.
Ported from Blaine's standalone tuner project; see `src/lib/tuner/README.md`.
The detection files are that project's unchanged, so improve detection there
(its `scripts/pitch-bench.ts`) and copy the change across. Canvases take the
site's theme colours through `src/lib/tuner/canvas-colors.ts`.

To test with a real signal, run Chromium with
`--use-fake-device-for-media-stream --use-file-for-fake-audio-capture=<wav>`;
a synthetic 440 Hz tone reads A4 within a cent.

## Accounts

Better Auth (`src/lib/server/auth.ts`) on Prisma ORM 7 + Prisma Postgres
(`DATABASE_URL`; one database shared by Development, Preview and Production).
Email/password with reset and a confirmation email (sent through Resend, not
required to sign in), plus Google when `GOOGLE_CLIENT_ID`/`_SECRET` are set.
Auth endpoints live under `/api/auth/*`; pages are `/login` (also
`?mode=signup|forgot`), `/reset-password`, `/account`.

Classes (`Class`, `ClassProgress`; `/api/classes`, `src/lib/classes.ts`) are
signed-in only: a director's choirs and which presets each has passed, keyed
`step:<id>`, `uil:UIL n` or `saved:<preset id>`. Picked beside the preset on
the practice pages ("Mark passed"), and shown as a grid on `/account`.

A teacher's own rhythm syllables live in `UserPreference.rhythmSyllables`
(`/api/preferences`, `src/lib/syllable-prefs.ts`), edited on `/account` and
offered as "Mine" on the Unison page. The set is plain data
(`CustomSyllables` in `rhythm-syllables.ts`) sent with each exercise as
`customSyllables` beside `syllableSystemId: "custom"`, and turned into a system
by `customSyllableSystem`. Its first template must equal built-in Kodály figure
for figure - `tests/unit/custom-syllables.test.ts` holds it to that.

Educator accounts and students (`src/lib/server/students.ts`, rules in
`src/lib/educator-policy.ts`, `roster.ts`, `join-code.ts`, `seats.ts`; tests in
`tests/unit/students.test.ts`): `user.accountType` is standard, educator or
student. An educator's classes get join codes (KTZ-482); students join at
`/join` or the teacher adds a roster (pasted names or CSV) and prints login
cards. Student accounts have **no email** - they may be under 13 - and sign in
at `/login?mode=student` with class code, username and password (Better Auth's
username plugin; the stored username is `<code>.<name>`, the email a
never-delivering `@students.abc-sightreading.invalid`). Student pages load no
analytics and no feedback form (Layout.astro). Permission checks read
`accountType` from the database (`accountTypeFor`), not the five-minute session
cookie. Deleting a teacher deletes the student accounts they made. 100 seats per
educator (seat packs: stage 4, with Stripe).

A preset holds every setting on its page (Choral `getCurrentParams`, Unison
`currentOptions`): generation, display (lyrics, chords, cursor, hidden and
muted voices), sound (instrument, transposition, volumes) and the metronome: its
subdivision, accent, sound, on/off with the music and level
(`src/lib/preset-click.ts`).
All of it counts toward "edited". Fields added later are optional, so an older
preset loads and leaves what it lacks alone. The one thing a Choral preset does
not keep is full length, which only exists while a UIL level is chosen.

Saved presets go to the account when signed in (`/api/presets`,
`src/lib/preset-sync.ts`) and to localStorage when not - signed-out behaviour
is the old one. The first signed-in load of each list imports that browser's
presets once; the server dedupes by name + creation time.

- Schema: `prisma/schema.prisma`. After changing it: `bun run db:migrate`
  (creates a migration and applies it - **to the shared database**), commit the
  migration, and production picks it up via `bun run db:deploy`. Safer for an
  additive change: write the SQL with `prisma migrate diff --from-schema <old>
  --to-schema prisma/schema.prisma --script`, read it, and apply with
  `bun run db:deploy`, which never resets. (That is how the classes tables went
  in.)
- The generated client is in `src/generated/` (gitignored; `postinstall` runs
  `prisma generate`).
- Billing: Better Auth's Stripe plugin (auth.ts, only when `STRIPE_SECRET_KEY`
  and `STRIPE_WEBHOOK_SECRET` are set; webhook `/api/auth/stripe/webhook`).
  Pro $19.99/yr and Educator $99/yr, found by price lookup key
  (`pro_yearly`, `educator_yearly`, `seat_pack_25` - `src/lib/server/stripe.ts`),
  so the sandbox and live accounts need the same keys and no price ids live in
  code. Prices are tax-inclusive: everyone pays $19.99, $99 or $25 flat, and
  any tax owed comes out of it. Checkout asks Stripe Tax only once it is
  active (`taxReady`); a school is billed tax-exempt through a quote. Pro -> Educator is `subscription/upgrade` with
  the existing `subscriptionId`. Seat packs are a one-time checkout
  (`/api/billing/seats`) granted by the webhook into `SeatGrant`, for a year.
- School quotes (`src/lib/server/quotes.ts`, rules in `src/lib/quote.ts`,
  `SchoolQuote.svelte` on `/account`), for Pro or (once on sale) Educator: a
  Stripe customer for the school (its purchasing contact, address, tax
  exemption - never the teacher's own customer), a finalized Stripe quote,
  net 30. One click emails the PDF straight to up to three purchasing
  addresses, the teacher copied and replies going to them; only from a
  confirmed email. Entering the PO number accepts it: the subscription
  starts, its first invoice carries the PO and goes to the school, and the
  plan starts at once - the subscription row is written by us, since the
  plugin cannot map a school's customer to the teacher. `FEEDBACK_TO` is told
  of every PO. A daily Vercel cron (`/api/cron/po-invoices`, vercel.json;
  set `CRON_SECRET`) reminds purchasing and the teacher a week before the
  invoice is due and, if it falls due unpaid, cancels the subscription, voids
  the invoice and ends the plan (`reviewPoInvoices`; renewals the same).
- Assignments and practice time (rules `src/lib/practice.ts`, tests
  `practice.test.ts`; server `src/lib/server/practice.ts`): a teacher assigns a
  class one preset (step, UIL level or saved - a saved one is copied in) for N
  minutes, optionally due. Students see them on `/account` (student sign-in
  lands there); `?assignment=<id>` on a practice page applies the preset, locks
  the tab content (`inert`) and hides the preset menu. `practice-tracker.ts`
  counts a second when the page is visible and touched, or playback, the
  metronome, drone or tuner is running, within 5 minutes; it reports every 30 s
  to `/api/practice`, which credits at most the claim and at most the time
  since the student's last credit (`PracticeClock`), so tabs don't add up.
  Logged only for accounts in a class, all practice, not just assigned;
  minutes, exercise counts and dates only, deleted after 395 days.
- Codes (rules `src/lib/codes.ts`, tests `codes.test.ts`; server
  `src/lib/server/codes.ts`; owner's page `/admin`, for `ADMIN_EMAILS` (or `ADMIN_EMAIL`) only,
  404 to anyone else): an access code (`AccessCode`) gives Pro or Educator free
  for N days from use - `AccessGrant` rows, read by `planFor` beside
  subscriptions. Links are `/account?code=X`, which survive sign-in/sign-up.
  An affiliate code is a Stripe coupon (duration once) plus promotion code
  made from `/admin`; `recordAffiliateSale` (Stripe webhook,
  `checkout.session.completed`) records the advertiser's cut of what the
  checkout paid before tax in `AffiliateSale`. Payouts are by hand; `/admin`
  marks them paid.
  An advertiser's link, `/?ref=CODE` on any page, keeps the code in an
  HttpOnly cookie for 60 days (middleware.ts, rules in `src/lib/referral.ts`,
  tests `referral.test.ts`); that visitor's Pro checkout then has the discount
  applied (`referralFor` in the checkout params) instead of the box to type a
  code, and pricing and the account page say so (`ReferralNote`). `/admin`
  shows each advertiser's link.
- **Educator is not on sale yet**: `EDUCATOR_ON_SALE` in `src/lib/plan.ts` is
  false, so pricing, the account page, the home page and the guides say
  "coming soon"; checkout (auth.ts hook), quotes and seat packs refuse it on
  the server. Access codes still grant it (beta testers). Flip it to open sales.
- Plans: the rules are in `src/lib/plan.ts` (tests: `billing.test.ts`), the
  database side in `src/lib/server/plan.ts` - `planFor`, `hasPremium`,
  `hasEducatorPlan`. Gate by those, never by reading billing fields. A student
  of a paying educator has Pro; `COMP_EMAILS` (comma-separated) gives Educator
  free. `accountType: "educator"` is set when the Educator plan is paid for and
  stays after it lapses, but seats drop to 0: no one new joins.
- Monthly exercises: 10 signed out (counted in localStorage - a soft nudge), 50
  on a free account (`GenerationUsage`, `/api/usage`, conditional increment),
  unlimited on Pro/Educator. Both practice pages ask `mayGenerate()`
  (`src/lib/usage.ts`) before generating and `countGeneration()` once the score
  is drawn, so an exercise that could not be written costs nothing; `GenerationLimit.svelte` says what is
  left. Pro also unlocks the Tools wheel and `/tuner`.

## SEO

`site` in astro.config.mjs is https://www.abc-sightreading.com, and every page's
canonical link points there (abc.blainecowen.com serves the same pages).
Layout takes `noindex` (accounts, login, join, tools) and `jsonLd`; previews
and local dev are always noindex, and `/robots.txt` turns crawlers away
everywhere but production. The navbar is `client:only`, so the footer in
Layout carries plain links for crawlers. Public pages are listed in
`src/lib/seo.ts` for `/sitemap.xml` - add new ones there. Plan prices shown on
`/pricing` and in structured data come from `src/lib/seo.ts` and
`src/lib/plan.ts`. The Sight Reading Factory comparison quotes their prices
with a date; recheck before editing it. `public/og.png` is the share image.

## Look: "Recess"

Soft pastel blocks, big rounded cards, Fredoka headings over Nunito (loaded in
Layout.astro). Every colour is a `--sr-` token in `src/styles/globals.css`
(light, and a dark block for `themable` pages), exposed to Tailwind as
`sr-*` colours: blue `action` for anything chosen or primary, the pastels
`mint`, `peach`, `butter`, `sky` each with an `-ink` that reads on it, and
`bar-*` for the navy playback bar. The shared classes there (`sr-tok`,
`sr-tab`, `sr-btn`, `sr-panel`, `sr-pastels` for a grid of cards...) carry
the shapes: pills and 28px cards. Use tokens, never Tailwind's own palette
(`slate-600` and the like), or the dark theme breaks. The score paper stays
white in both themes.

## Deploys

`main` deploys to production on every push. Preview branches (`dev`) build
on Vercel only when the commit message contains `[preview]`
(`scripts/vercel-ignore.sh`, vercel.json `ignoreCommand`): each build is about
45 s of build time, and building every dev push spent most of the budget.
Otherwise preview with `bun run dev`, or `vercel build && vercel deploy
--prebuilt`, which builds locally and uses no Vercel build time.

## Tech Stack

- **Astro** (SSR, deployed to Vercel) — pages in `src/pages/`, layout in `src/layouts/`
  - `@astrojs/vercel` 6 only knows Node 18/20 and emits `nodejs18.x` for anything newer, which Vercel rejects. `scripts/fix-vercel-runtime.mjs` (run by `bun run build`) pins the functions to `nodejs24.x`, matching `engines.node`; drop it when Astro is upgraded.
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

After decoration, the unison splice and the rhyme pass, `varyVoiceRhythms`
(`voice-rhythm.ts`, tests `voice-rhythm.test.ts`) adjusts one voice at a time,
inside one chord only: a dotted quarter + eighth whose eighth leaps becomes two
quarters, and where the level allows the dotted figure one part now and then
takes it against quarters in the others (`DOTTED_IN_ONE_PART`, 0.3). A dotted
quarter + eighth is the same length as two quarters, so no pitch or other voice
changes. A pattern's chord starts on its first sung note
(`rhythm-generation.ts`): eighth rest + eighth used to start on the rest and
failed 29 exercises in 40.

The Choral page opens at UIL Level 3 in F major when the address carries no
settings (AbcjsChoral `arrivedBare`); a tab's dot means changed since the
active preset was chosen.

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

## Score layout

Bars per line come from `src/lib/score-layout.ts` (tests `score-layout.test.ts`),
used by both practice pages: up to 4 a line, 3 when the score is dense (lyrics,
or sixteenths), 2 on a phone, and shared out so lines are even (4 bars dense is
2 + 2, never 3 + 1). abcjs takes the number as a preference only and breaks
lines itself when the notes need room, so after drawing each page reads the
split (`drawnLines`) and, if it came out ragged, draws once more capped at the
most bars abcjs fitted on a line.

## ABC Notation Notes

- The project uses `L:1/32` as the default note length, so all `abcValue` entries are multipliers of 1/32nd note (e.g., a quarter note is `abcValue: ["8"]`)
- Multi-voice ABC strings use `%%score` directive and `[V:name]` voice labels
- `abcjs` is SSR-incompatible; all rendering must happen client-side
