# Analysing a transcribed score

Tools for reading the hand-transcribed scores in `scores/` — written to work out
what real UIL sight-reading music does, so the generator can be measured against
it rather than against taste.

| script | what it answers |
|---|---|
| `check_abc.py` | Does every bar add up? What range does each part use? |
| `find_leaps.py` | Which leaps look like a missing or stray octave mark? |
| `show_bars.py`  | What are all four parts doing at bar N? |
| `harmony.py`    | Roman numerals, chord vocabulary, rhythm profile, accidentals, non-chord tones, section boundaries. |

Run them with `python3 scripts/analysis/<script>.py [path]`, default
`scores/forgotten.abc`. They need `music21` (`pip install --user music21`), the
same dependency the Bach corpus study used.

## Two things worth knowing before trusting the numbers

**Spell the pitches.** `music21`'s `romanNumeralFromChord` takes the spelling it
is given, and a chord built from MIDI integers comes back spelled with sharps —
an A-flat triad in A-flat major reported as `#VII`. Build `Chord` from names
like `A-4`, not from numbers.

**A non-chord tone has to be measured against the chord, not against the other
singers.** Testing each note against the raw sonority of the other three voices
counts one decoration as proof that another is a chord tone, which put the rate
at an impossible 56%. Against the half-bar roman numeral's own pitch classes it
comes out at 14.5%, which is the range this repertoire actually sits in.

`music21` cannot read this file's voices directly, incidentally — it parses the
four `[V:]` lines into one 176-bar part. The parsing here is hand-rolled for
that reason.

## Harmonic rhythm

`harmonic_rhythm.py` answers "how long does a chord last, and where does the
next one start". Run it on `scores/*.abc` and on generated exercises dumped by
`dump_generated.ts`, and the two are directly comparable.

Measured over the first transcription (44 bars) against 25 generated UIL 5
exercises (400 bars), decoration off in both so the comparison is of harmony
rather than of ornament:

| chord lasts | transcription | generated |
|---|---|---|
| 1 beat  | 50.0% | 54.8% |
| 2 beats | **37.0%** | 21.4% |
| 3 beats | 3.3% | **16.3%** |
| 4 beats | 7.6% | 6.4% |
| mean    | 1.79 beats | 1.78 beats |
| changes per bar | 2.09 | 2.19 |

The *rate* is already right. The shape is not: real writing leans on the
half-bar chord and almost never holds one for three beats, where ours does so
five times as often. A three-beat chord in 4/4 is an asymmetric span - it comes
from tying chord duration to note duration, so a dotted half note becomes a
three-beat chord.

Two things that fooled me on the way, both recorded so they are not repeated:

- **Decoration inflates the apparent change rate.** A passing tone changes the
  sonority on its beat and breaks a run. With decoration on, ours measured 2.32
  changes per bar; with it off, 2.19. Measure harmony with decoration off.
- **"Chord changes land on the metre" is false.** It was the obvious hypothesis
  and the data refused it: new chords begin on beat 1 or 3 in 38% of the
  transcription against 51% of ours. Ours is the more metrically aligned of the
  two.

## Decoration in two voices at once

`tandem_nct.py` asks how often two parts decorate together, and whether the
pair is a figure or a coincidence. Measured over the transcription against 25
generated UIL 5 exercises:

|  | transcription | generated |
|---|---|---|
| moments with 2+ voices decorating | 51.1% | 56.5% |
| of two-voice pairs: parallel, consonant | 45.5% | 64.4% |
| contrary, consonant | 27.3% | 28.1% |

We already decorate in tandem more often than the real music does, and our
pairs are consonant - the clash check sees to that.

**This script cannot see suspensions at all, so do not read a rate for them out
of it.** It infers the chord at each sampling point from the notes sounding
there - which include the decoration itself - so music21 spells a roman numeral
that contains the dissonance and the note is never counted as a non-chord tone.
Passing tones fall between sampling points and survive; a suspension lands
exactly on the chord change, which is exactly where the sampling happens, so it
is absorbed every time. An earlier version of this file reported "0.0% both
voices suspended" and treated it as a finding. It was an artifact.

Use `double_suspensions.ts` for that question instead. It works on the
generator's own note and chord data, so nothing is inferred, and it applies the
real definition: a note that repeats the pitch before it, is not a chord tone of
the chord it is held into, and resolves down by step onto one.

### The double suspension

Two voices held over the chord change together and resolving down in parallel,
as at m15 where soprano A-flat to G and alto F to E-flat make a 9-8 and 4-3
pair. Measured properly over 80 generated UIL 5 exercises:

|  | before | after |
|---|---|---|
| suspensions | 80 | 116 |
| paired as double suspensions | 3 | 21 |
| as a share of suspensions | 3.8% | 18.1% |
| per exercise | 0.04 | 0.26 |

It was rare rather than absent. Two things were needed. A partner's suspension
has to be mirrored **as a suspension** - holding this voice's own previous note
- because copying the contour from its chord tone reproduces the rhythm and the
step down while suspending nothing. And a voice able to complete the figure has
to be let through the probability roll, since waiting for both voices to draw a
suspension on the same beat left it at about one exercise in twenty-five.

A caution on measuring it: matching "a repeated pitch followed by a step down"
finds the shape but not the figure. Most repeated pitches in this music are
ordinary consonant repeats - 3,521 of them against 80 real suspensions in the
run above - and counting those made an early attempt at this read 61 pairs where
there were 3.

## Chromatic notes in the bass

`bass_accidentals.ts` generates a few hundred exercises at a UIL level - its
ranges, chords with their inversions, rhythms and maxSkip, the way the page
applies the level - and classifies every bass note whose accidental differs
from the key: approached by step? resolved by step, up from a raised note and
down from a lowered one? It names the chord before, at and after each fault,
and `VERBOSE=2` prints the ABC of every offending exercise. The rule and its
history are in `notes/bass-chromatic-notes.md`.

```sh
bun run scripts/analysis/bass_accidentals.ts 600 G,C,F,Em
MEASURES=16 VERBOSE=2 bun run scripts/analysis/bass_accidentals.ts 300 G
```
