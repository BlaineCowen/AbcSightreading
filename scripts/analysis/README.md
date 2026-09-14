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
