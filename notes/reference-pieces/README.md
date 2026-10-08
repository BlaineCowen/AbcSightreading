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

- `the-rainbird-SSA-L3`: F, pickup and 32 bars, the second half restating
  the first. Tune (fa mi so), soprano 2 holding do, alto a bass on do, so
  and la (36% leaps) as in Spring: Level 3's other lower texture.

- `give-me-more-love-SSA-L5`: E flat, 42 bars, Level 5: the 5A version stops
  at bar 32, 6A is all of it (UIL: 32-36 for 5A, 12-16 more for 6A). The tune higher (so la ti do), soprano 2 a moving
  part around mi, the alto moving around do and re (half its moves repeat);
  close triads (80% complete), eighths as common as quarters in the tune,
  secondary dominants (fi, si) and a turn to the relative minor (bars 25-28).

- `our-hero-SATB-L3`: G, pickup and 32 bars. Soprano the tune (mi so fa
  re), alto holding do (62%) with ti and la, tenor filling the chord (so mi
  fa, 26% leaps), bass on the roots (do and so, 39% leaps); 83% complete
  triads, do doubled most. Women alone bars 10-12 and 26-28, men 13-16.

- `a-demon-in-my-view-SATB-L5`: F, 3/4, pickup and 48 bars, Level 5: 5A
  stops at bar 32, 6A is all of it. Soprano the tune (mi 39% in the 5A part, 70% steps); the alto
  no longer holding do (38%; la 22, so 19), an inner part like the tenor (mi
  do so); bass on the roots (do 48%, a third of its moves leaps); 90%
  complete triads; a turn to D minor, secondary dominants.

Ableton projects are read with `python3 scripts/read-als.py <project dir>
<out.json>` (arrangement clips only; notes released early are held to the
next note, so check any real rest by hand).
