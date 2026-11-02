# Piano sight reading

Moved out of CLAUDE.md on 27 October 2026, word for word. Read it before touching /piano-sightreading or its MIDI grading.

## Piano sight reading

`/piano-sightreading` (`AbcjsPiano.svelte`, `src/lib/piano/`, tests
`piano.test.ts`, every level x key x meter x length `bun run
scripts/check-piano.ts`): a grand staff (`%%score {RH | LH}`), a tune over
an accompaniment, a separate system from Choral and Unison (8 October
2026). Everything is asked for through `PianoSettings` (levels.ts: keys,
meters, bars, rhythms, largest skip, reach, hands together or taking turns,
tune hand, accompaniment patterns, chords, chromatic chords, 3rds and 6ths
at cadences, dynamics, tempo); a level is only a set of them. The page shows
every option at every level, each marked with the level that first uses it
(`unlockedAt`; Blaine: no options appearing as levels go up, as much
customization as possible), and the address carries the level and only what
differs from it (`settings-link.ts`).

Harmony first: the tune is the Unison page's progression writer
(`writeProgressionLine`, taking a `progressions` table of its own) inside
the hand's position (`rightHandPosition`: thumb on the tonic at or above
middle C, `reach` steps up; `leftHandPosition` for a tune in the bass),
over `PIANO_PROGRESSIONS` (major, minor with harmonic minor's V, and
chromatic ones through V of V, vi and ii). The tune is accepted only if it
makes no parallel fifths or octaves with the accompaniment it will have and
no augmented second; a passing note a step under a raised one is raised too
(the melodic minor's sixth). The accompaniment plays the same chords in a
pattern (`left-hand.ts`: held root, open fifth, rocking fifths, block, on
each beat, oom-pah, broken, arpeggio, waltz in 3/4, broken in eighths,
Alberti, Alberti in sixteenths; 6/8 takes what fills a dotted-quarter
beat, `patternFits`), the bass root at one place a letter (F2 to E3,
`bassRoot`), block chords in the shapes a beginner learns (C-E-G, C-F-A,
B-F-G). A chord's altered note carries its accidental (`chordAlter`;
PianoNote `alters`), written once a bar per pitch with the natural written
back (assemble.ts). Beams end with the beat (`beamed`, `beamGroup` = one beat: two eighths, four sixteenths, three eighths in 6/8; Blaine, 9 October 2026).

Ten levels, ending where a beginner's Mozart sonata sits (K. 545's first
movement, ABRSM Grade 5, RCM Level 6-7), in method-book order checked
against ABRSM's and RCM's published sight-reading parameters (levels.ts
header): 1-2 hands taking turns (C, G position); 3 hands together, held
root; 4 fifths, IV, F, 2/4; 5 chord shapes, eighths, A and D minor,
dynamics; 6 the tune in the left hand, oom-pah, ii and vi, rests, a 6th's
reach; 7 broken chords, arpeggios, waltz, dotted quarter, D, E minor; 8
Alberti, 3rds and 6ths at cadences, an octave's reach, sixteenths; 9 6/8,
chromatic chords; 10 Alberti in sixteenths, syncopation, dotted eighths,
four sharps or flats, 12 bars. Ids `piano-01`... are permanent. Measured
against Sight Reading Factory's piano levels: notes/srf-piano-study.md.
**Play and grade** (`PianoGrade.svelte`; rules `grade-piano.ts`, the
keyboard `midi.ts`; tests in `piano.test.ts`): a MIDI keyboard through Web
MIDI (Chrome, Edge, Firefox; not Safari), every key stamped on the
performance.now() clock by the event's own timeStamp. Chrome offers MIDI
only on a secure page (https or localhost): on the Tailscale http address
to a dev server it is missing, and the panel says so (`midiProblem`; it
used to blame the browser). Pro, as Unison's Grade (open on the dev server,
which has no billing). In time only (a Note by note mode was taken off,
Blaine: a pianist reads at a tempo): a count-in and a click (throughout or
count-in only) on the page's own AudioContext, beat 1 moved by the output's
latency since the player plays with the click as heard; afterwards each
written note (`expectedNotes`, both hands, MIDI with the key's and its own
accidentals) is matched to a key of the same pitch nearest in time, nearest
pairs first, within three onset windows (Easy, Standard, Strict: a quarter,
an eighth, a sixteenth of a beat; full credit inside it); a key that
matches nothing is an extra and counts as a note scored 0; a missed note
names the key played near it instead. The marking and the end of the run
are on timers, not the frame loop (a page out of sight draws no frames).
The keys sound through the grand piano the exercise plays on
(`piano-voice.ts`: the FluidR3 samples through /api/soundfont, a key-up
letting the note go over 0.25 s, velocity as loudness), with **Piano sound
on/off** beside the keyboard's name for a digital piano that makes its own
(remembered, `piano-key-sound`). Every run keeps its take (keys down and
up), and **Hear it back** plays it from the count-in on a second voice
(so muting the keys leaves the take), with the click or without, the score
marking the written notes as it reaches them and following them, then the
grade's marks back. Stop silences everything: the run, every click still
scheduled (each is kept), the take; the page's Play, Pause and Stop stop
the panel too (`stopRun`, through `bind:this`). Checked 9 October 2026:
Stop with 20 clicks scheduled left none, a take of 46 key events played
back on 20 fetched samples and ended with the grade's 18 green marks back.

**Laid out as the Unison page is** (Blaine, 9 October 2026: the layouts
should match): the settings as a row of pills (Level, keys, meter and bars,
rhythms, skips and reach, hands and accompaniment, chords and more), each
opening its own popover (a sheet from the bottom on a phone) with Done and
New exercise at its foot, a dot on a pill changed from the level, New
exercise with the month's count ending the row (`hideGenerate` while it
shows); above the score the toolbar's Display (layout, measure numbers,
cursor: off, smooth, beat by beat, note by note) beside Play and grade; the
playback bar's Layout menu (`score-view.ts`, kept as "piano": size, bars a
line, spacing, measure numbers), full screen (`createFullscreen`, the
`focus-*` classes) and its annotations. The pill, popover and toolbar CSS is
the Unison page's, copied (AbcjsChoral copies it too).
Layout is Lines, or One scrolling line - the whole exercise as one line
(`withBarsPerLine`, each bar as wide as its busier hand needs, `lineWidth`,
no resize) in a box that scrolls sideways (`#paper-box`; abcjs sets its own
overflow on `#paper`), its title left off, printed in lines. The line
scrolls continuously (`scroller.ts`, Blaine: not a jump a bar): every frame
it is placed from where the moment being played sits on the line (anchors:
each onset's leftmost notehead by its time) and a clock (a run's or a
take's own; playback's resynced at every note abcjs reports), the moment
held a third of the way in. Lines follow line by line (`follow.ts`).
Marks on the score by abcjs's own note elements (staff 0 the right hand,
staff 1 the left, in order): green right, orange early or late, red
missed, blue the notes sounding now. Playback and a run follow the score
(`follow.ts`): each new line is scrolled to a third of the way down the
window. `window.__pianoMidi` (dev only) presses keys from the console or a
test; checked end to end with it on 9 October 2026: a planted late note
(0.30 beats) and a wrong key found exactly, on-time keys within 1-6 ms.

Not yet: exact-notes share links and recent exercises (exercise-link.ts and
recent-exercises.ts know two pages), the Tools wheel, saved presets and
class progress, hearing the take back, holding notes for their length.
