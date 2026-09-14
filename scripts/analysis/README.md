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
