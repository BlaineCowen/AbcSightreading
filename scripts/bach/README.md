# Bach corpus analysis

Measuring the 371 four-part chorales to settle questions about this generator
that were otherwise being answered from taste.

## Setup

    python3 -m pip install --user music21

The corpus ships with music21; there is nothing to download. 331 of the bundled
chorales are genuinely S/A/T/B with no extra instrument, and those are the ones
these scripts use.

## Scripts

| | |
| --- | --- |
| `clashes.py` | Every vertical interval, by semitone, over chordified slices. |
| `pairs.py` | The same, counted the way we count our own output - each pair of overlapping notes once - so the two are comparable. |
| `dissonance.py` | For each minor 2nd / minor 9th: is the dissonant voice approached and left by step, where does it fall in the bar, which voices. |
| `nct_by_chord.py` | Which non-chord tones appear over which Roman numeral, as intervals above the chord root. |
| `nct_types.py` | Every non-chord tone classified by melodic shape - passing, neighbour, suspension, anticipation, appoggiatura, escape - with beat placement and voice. |
| `iv_minor.py` | The specific worklist question: the 2nd above the root of iv in minor. |
| `suspension_clash.py` | How often a suspension, as against a passing tone, creates a half step. |

Each takes an optional chorale limit: `python3 scripts/bach/pairs.py 40`.

## What it has told us so far

**The rate was never the problem.** Counted identically, Bach writes a minor 2nd
or minor 9th between two voices in **0.82%** of overlapping pairs. This generator,
before any clash guard existed, wrote **0.83%**.

**The handling is the whole rule.** Of Bach's 1,233 clashing pairs across 331
chorales, the dissonant voice is:

    approached AND left by step    99.0%
    one side stepwise               1.0%
    neither side                    none at all

It is not that he avoids the interval - it is that he only ever passes through
it. That is what `clashesBySemitone` enforces now: a clash reached or left by
leap is refused, a clash stepped into and out of stands. Which means passing
tones, neighbours and suspensions may sound one and appoggiaturas may not, since
leaping into the dissonance is what an appoggiatura is.

Also worth knowing, and not yet used: 55% of them fall on weak beats, 27% on
downbeats (the suspensions), and they cluster between Alto-Bass (26%),
Soprano-Alto (24%) and Tenor-Bass (23%) rather than in the outer pair -
Soprano-Bass is only 6%.

## What was taken from it, and what was not

Three faults in the generator were fixed because the corpus showed the code was
not doing what it claimed - none of them a style preference:

- **`checkAnticipation` was not a definition of an anticipation.** It accepted a
  step *or a third*, looking only forwards, which is a description of nearly
  every melodic move.
- **A weight meant "how often this wins when it is in the running"**, not how
  often it appears, so a type that fits everywhere won uncontested. Anticipation
  ran at 34% of decorations and stayed at 25% even when cut to a weight of 1
  against a passing tone at 30.
- **A suspension could land anywhere in the bar.** The held dissonance belongs on
  the strong beat.

Deliberately **not** taken, because they are this composer's taste rather than
rules of harmony:

- his exact mix (passing 50.1%, neighbour 17.9%, suspension 13.6%, appoggiatura
  9.9%, anticipation 1.8%) - our weights are round numbers in that *order* only
- his beat distribution per type
- his habit of decorating the soprano less than the inner voices (8.3% vs 14.9%)

A **escape tone** (step in, leap out) is 3.4% of his non-chord tones and we have
no such decoration at all. That is a real gap rather than a preference, and is
still open.

## Still open

The per-chord question from the worklist - which non-chord tones belong over
which harmony, the `iv`-in-minor suspension case - needs the chord label per
beat as well. music21's `chordify()` plus `romanNumeralFromChord` is the way in;
the catch is that a chordified slice contains the non-chord tones too, so the
label has to be taken from the reduced sonority rather than the slice as it
stands.
