# Chromatic notes in the bass

A chromatic note in the bass should be **approached by step and resolved by
step** - up from a raised note, down from a lowered one. This is the one rule
the generator kept breaking. It has been worked on several times, and this is
the state of it as of 22 September 2026 (second pass), for whoever picks it up
next.

**Where it stands (23 Sep 2026):** the rule holds on every exercise generated.
The generator gets it right on its own on all but about one exercise in
several hundred (at UIL 5: 1 of 904 bass accidentals at 8 bars across twelve
keys, 1 of 457 at 16 bars; it was 83 of 931, 8.9%, before this pass), and
`generateChoralExercise` now checks the finished bass with
`bassChromaticFaults` and generates again on a fault, up to three draws. Over
1,200 exercises at 8 bars that fired 0 times; over 600 at 16 bars, once. 0 of
1,023 and 0 of 903 accidentals wrong after it. Generation failures are
unchanged or better (the sweep 204 against 210 the same day; its worst cells
54 against 73 in 1,296). More retries *inside* the search could never have
done this: the escape writes the leap and reports success, so nothing there
fails.

## Where the rule lives

| What | Where |
|---|---|
| Planning a chord's bass note, including the chromatic-bass chords (V⁶/V, V⁶/ii, V⁶/vi) | `findValidBassNote`, `src/lib/chord-generation.ts` |
| Offering a chromatic-bass chord only where the bass can step onto it *and off it inside its range* | `chromBassApproachable`, `src/lib/chord-generation.ts` (~line 570) |
| The resolution a chromatic bass note owes the next step | `owedBassResolution`, `src/lib/build-chord-notes.ts` |
| The deadlock escape: substitutes a bass note when the planned one cannot be used | `src/lib/build-chord-notes.ts`, the block that starts at `missesOwedResolution` |
| Decoration refusing to undo an approach or a resolution | `breaksChromaticStep`, `src/lib/non-chord-tone-gen.ts` |
| The backstop: the finished bass checked, and the exercise drawn again on a fault | `bassChromaticFaults`, `src/lib/bass-chromatic-check.ts`; `BASS_RULE_ATTEMPTS` in `generateChoral.ts` |
| Tests (assert rates, not absolutes) | `tests/unit/bass-accidental-approach.test.ts`, `tests/unit/chromatic-decoration.test.ts` |
| Measuring it | `scripts/analysis/bass_accidentals.ts` |

Two mechanisms carry the rule, and they are easy to confuse:

- **`forcedNextBassPitch`** (chord-generation) - set when a chord was *planned*
  with a chromatic bass, so the next chord's bass is pinned to the resolution.
- **`owedBassResolution`** (build-chord-notes) - set whenever a bass note is
  *written* with an accidental, whoever chose it. The escape can only pay this
  debt if the next chord contains the resolution pitch and the bass can reach
  it.

## What was wrong, and what fixed it (second pass, 22 Sep 2026)

Nearly all of it was one thing seen from different sides: **the escape
re-picks bass notes, and everything downstream was still measured against the
plan.** `generateChordProgression` builds the bass line as a chain, each note a
step or a permitted skip from the one before. The escape in build-chord-notes
re-picks a bass note on *every* retry of a step (not only when the bass was
the problem), and from then on the planned notes after it are measured from a
note that was never written. The chromatic rule is where that shows first,
because it is the tightest constraint in the chain.

Measured at UIL 5 in G, 500 exercises, before: 8.0% problem notes (4.8%
approached by leap, 4.0% unresolved). Every leap was on a planned chromatic-bass
chord; the unresolved split three ways.

1. **Planned accidental reached by leap** (all 12 leaps). The escape had moved
   the bass before a V⁶/V or V⁶/ii; the planned C#/G# was still inside maxSkip
   6 of the new note, so the width test passed it and it was written verbatim.
   Or the retry re-picked the accidental itself, choosing among every C# in the
   range at random. Fixed in the escape: a chromatic-bass chord's planned note
   more than a step from the *last sung* bass note is re-picked; the pool
   prefers the accidental within a step that can also resolve in range; with
   none, the chord is sung in root position (or 6/4) instead - V⁶/vi becomes
   V/vi, and `labelFor` prints it so - and only when even that is unreachable
   does the leap stand. "Last sung" matters: the interior cadence ends on a
   quarter rest, and the note after it was being checked against the rest,
   which is to say not at all. That was the last 0.7%.
2. **Accidental the escape wrote on the first note of a pattern** (8 of 10
   unresolved). V/vi after V, with an eighth before it: nothing diatonic within
   a step, so at retry 9+ the escape put D# in the bass as a dotted quarter -
   and the eighth after it, in the same chord, had nothing within a step (a
   triad has no tone beside its own third; the altered degree was excluded
   outright), so it leapt to B. Fixed two ways: inside a pattern the eighth
   may *repeat* the accidental already sounding (`repeatsAccidental`), and an
   escape-written accidental must be *payable* - the chord after this one has
   to contain the resolution degree. The first version asked the pattern's
   own chord to pay, which a triad never can: it did fix the rule but took
   the sweep's worst cells (UIL 5 minor, 2 and 16 bars, 54 runs each) from
   73 to 105 failures in 1,296. With the repeat allowed and the debt moved to
   the next chord: 54, better than before the pass.
3. **Planned V⁶/V on the top note of the range** (the rest). After I⁶ on B, the
   only step-approachable C# is the one whose D is out of range. Fixed in
   chord-generation: `chromBassApproachable` also requires the resolution in
   range, so the chord is not offered there; and the escape prefers root
   position over an accidental it can step onto but never leave.
4. **Decoration** (a third of the unresolved at the page defaults). Lower
   neighbours on leading tones, passing tones falling away from raised notes,
   appoggiaturas landing between a G# and its A. Fixed in `figureRejection`:
   a figure is refused if it *adds* a chromatic-step fault over the plain
   chord tone. Applies to every voice, and costs nothing - a refused figure
   leaves the chord tone.

And one **lookahead**: when the escape re-picks a note and the *next* chord is
a chromatic-bass chord, it prefers a note within a step of the accidental the
next chord was planned on, so the approach survives the substitution.

### The one that cost too much

The lookahead was first written for every next planned note - within a step
beside an eighth, within maxSkip otherwise - so no substitution could strand
the plan. It took the rule to 100% and cost **4.2% of exercises** outright
(from 0.3%) at UIL 5 in G over 600; released after eight retries it still cost
0.8%. Restricted to chromatic-bass next chords: 0.3% and the same 100%. The
escape runs only where the search is already stuck, and a preference applied
on every retry keeps choosing the same note, so the run never escapes. That is
the same lesson as the four attempts recorded in the escape's comments.

## What is still wrong

- **The generator itself, about 1 in 500 at 16 bars.** An eighth after a
  substituted G, under V⁶ in E minor, where the chord has no tone within a step
  and the range has no room for the root. A true dead end; the escape leapt.
  The regenerate backstop catches these on the page, but a cell where *every*
  draw broke the rule would still get through after three attempts (the result
  carries `regenerated`, and the analysis script counts it). None has been
  seen.
- **Upper voices are not at 100%, and are not behind the backstop.** Measured with the same harness over every
  voice (UIL 5, 8 bars, six keys): soprano 96% approached / 99.5% resolved,
  alto 95% / 99%, tenor 98% / 98%. Nothing in this pass looked at them beyond
  the decoration gate, which applies to all voices. The upper voices derive
  their obligation from the last committed note (`chordNotes.at(-1)`), so the
  retry leak fixed in the first pass does not exist there; the leaps are
  something else, and would want the same treatment - a harness first, then
  the mechanism. Do not just widen the backstop to them: at 2-5% per
  accidental it would be regenerating a large share of exercises and hiding
  the cause.

## How to measure it

Do not eyeball exercises; the rates were single-digit percentages and are now
fractions of one. `scripts/analysis/bass_accidentals.ts` reproduces a UIL
level the way `applyUILPreset` does - ranges from `voiceRanges`, chords through
the page's `withInversions` (which adds the chromatic-bass inversions with
their parents), rhythms minus rests, `maxSkip` - and classifies every bass
accidental against the previous and next sounding notes, skipping repeats of
the same note. `VERBOSE=2` prints the ABC of every offender; that is how every
mechanism above was found. Sample sizes below ~500 exercises move the numbers
by 2-3 points on their own, and a 40-exercise run will mislead.

Reproduce a user's settings by applying the **UIL level**, not the share link:
a link carries neither the level nor the rhythms, chords, ranges or chromatic
frequency.

## Things that have been tried and cost more than they bought

Recorded in the comments around the escape, and worth reading before touching it
again: restricting the escape so a chromatic bass note *must* be approached by
step was tried four ways in an earlier pass and either bought nothing or cost
32-64% of 48-measure exercises outright. This pass did narrow the escape - but
only for the chromatic-bass chords, with root position as the fallback, and
with the general lookahead measured and cut back (above). Prefer-with-fallback
is still the only shape that has worked here, and the fallback has to be a
*different chord voicing*, not a smaller pool.

## First pass (earlier on 22 Sep 2026, commit e851a4b)

**The debt was lost whenever a step was retried.** Every attempt at a step
writes its bass note and sets `owedBassResolution` from *that* note before the
upper voices are placed; when one failed, the retry saw the failed attempt's
debt instead of the one the step owed. Fixed by capturing the debt at the start
of the step and restoring it at the start of every attempt. This is why the
problem tracked the UIL level: UIL 4 and 5's wider, lower upper ranges make
exactly these steps need a second attempt. At UIL 5 in G, 29 of 32 unresolved
bass accidentals were this one bug. Also added, as preferences with a
fallback: a chromatic bass note is preferred where its resolution is inside the
bass's range. That pass took the rule from 26% wrong to 12%; this one takes it
from 12% to 0.
