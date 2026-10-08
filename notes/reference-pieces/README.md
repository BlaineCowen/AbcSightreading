# Reference pieces

Blaine's own sight-reading examples, written to be typical of a UIL level
and voicing, transcribed (MuseScore MIDI or an Ableton project) for the
choral writers to be measured against. Each file: title, voicing, level,
key, meter, voice names (top part first), and `parts`: per voice a list of
`[start, length, midi]`, in quarter notes from the first beat, sounding
pitch. A piece with a pickup starts at its pickup.

- `silence-and-tears-SA-L1`: F, 24 bars, A B A. Tune around mi and fa over
  an alto holding do. Shaped `src/lib/two-part-treble.ts`.
- `the-frog-TB-L1`: G, pickup and 24 bars. The same texture an octave down;
  mostly quarters, dotted half and quarter at phrase ends.
- `oh-lovely-spring-SSA-L2`: G, 24 bars. Tune (mi fa re), soprano 2 holding
  do, alto a bass on do and low so; opens in unison.
- `by-the-cradle-SSA-L3`: D, 32 bars. Tune higher (so la fa) with leaps
  inside the chord, soprano 2 a third under it, alto holding do; soprano 1
  rests bars 17-20 while soprano 2 carries the tune.

Ableton projects are read with `python3 scripts/read-als.py <project dir>
<out.json>` (arrangement clips only; notes released early are held to the
next note, so check any real rest by hand).
