# Testing and the gates: unit tests, the sweep

Moved out of CLAUDE.md on 27 October 2026, word for word. Read it before changing generation, tests, or reading a test failure.

### Tests

`tests/unit/` holds unit tests run with `bun test` (bun's built-in runner; no
framework to install). 1804 pass, 5 skip, 0 fail (23 October 2026). Stability matters because the
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

Latest: 0 failures in 11,568 exercises (2,892 cells, `RUNS=4`), 14 October
2026, after the Ensemble page and Live reached main; no short note
approached or left by skip. Before that, 0 failures in 34,080 exercises
(2,840 cells), 8 October 2026, after
dotted half + quarter left the picker (a dotted half and a quarter, both on
offer; `NOT_OFFERED` in selectable-rhythms.ts) and UIL 3-5 and the ladder.

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
