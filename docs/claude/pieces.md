# Your own music (pieces)

Moved out of CLAUDE.md on 27 October 2026, word for word. Read it before touching /pieces, MusicXML import, piece assignments or graded attempts.

## Your own music (pieces)

`/pieces` (My music, Pro, never a student; in the navbar for anyone signed
in, My library for a student): a teacher uploads MusicXML from MuseScore,
Sibelius, Finale or Dorico (.mxl, .musicxml, .xml) and plays it
(`/pieces/<id>`).

**The director's view** (14 October 2026, Blaine: he could only see what his
students saw, with boxes over the bars): the owner's view, also when they
open one of their own assignments (then a Director view / Student view
switch, the assignment's bars ready to rehearse; Student view is exactly the
student's page, attempts included). Each part's instrument (any of
`INSTRUMENTS`), volume, mute, solo and show or hide, saved to the piece.
Rehearse: Starting pitches (each sounding part's first note in the bars, low
to high, then together), Count-in, Click, Loop, tempo, Key (up or down six
semitones, saved with the piece: `src/lib/pieces/transpose.ts` moves the
model itself, keys and notes spelled as the new key spells them, and the
music is drawn and played from that; abcjs's `visualTranspose` drew line 1's
key and another on every later line; tests `pieces-transpose.test.ts`; an
assignment is always as written, since it is graded so; the sound can be
in a key of its own, `PieceSettings.sound`, null to sound as drawn, 15
October 2026, Blaine: transpose the written music and the audio
separately: the Key popover's second row, The sound, Same as the music or a
key stepped up and down; playback, starting pitches, tapped notes and what
Grade listens for come from `heard()`, the drawing from `music()`, and
Grade names notes as drawn), Choose bars by tapping the first and last
bar on the music (`barHits`), and Full screen (fullscreen.ts, as the practice
pages). Practice mixes: one part loud and the rest at `MIX_SOFT` (rules.ts
`mixLevel`); "Offer practice mixes in class libraries" lets the students of
a class library use them too, and Add to a class library puts the piece in
one without assigning it (`POST /api/classes/<id>/library/<piece>`). The
piece's own settings (`PieceSettings`: transpose, practiceMixes) are kept in
its `parts` JSON under `PIECE_KEY`, so they needed no migration; everything
that lists parts skips that key (`storedParts`, `storedPartIds`). The bars in
play are never boxed: the notes outside them fade (score-dom `fadeOutside`;
an assignment's lead-in fades less). Every view now plays through
`SectionPlayer` (the bars rendered to sound and started on the audio clock),
at one tempo (the slider; tempo marks inside the piece are not followed).
`bun run scripts/check-piece-viewer.ts` (`SHOTS=`, `FILE=`, `PHONE=`) checks
all of it on the dev server through `/dev/piece` (dev only, 404 elsewhere),
which draws PieceViewer while the script answers its API with a piece read
from MusicXML (by default a three-part round in the shape of Ghost of John).

**Laid out as the practice pages** (14 October 2026, Blaine; matched again 16
October: the practice pages' width, the title centred, Assign to a class
ending the settings row as New exercise does, Listen and grade in peach,
the playback bar's metronome icon, volume and Click pill): the owner's
and a library song's view have the settings pills (Key, Parts with the mixer
and practice mixes, Bars, and for the owner Class libraries), a toolbar over
the score (Starting pitches, Listen and grade) and the shared PlaybackBar
(Count-in and Click in its extra slot). A tapped note is where Play starts
(marked, named in a chip; tapped while playing, it jumps there), Pause keeps
the place, and a new tempo carries on from it. Where Play starts is a
line the height of the system (score-dom `cursorLine`, 15 October 2026,
Blaine: the start was hard to see): at the paused place, the tapped note,
or the first note of the bars in play, labelled under it; while playing a
blue line follows the music instead. Loop goes round to the top of the
bars in play, not to the tapped note (Blaine). A loop's next pass is booked on the audio
clock on the beat the last bar ends (`bookLoop`, SectionPlayer `play`'s
`at`), its count-in or first note landing on the next beat while the pass
before rings out; it waited for the release to end and came in about 320 ms
late (16 October 2026); a repeat does not count in again (the count-in is the
first pass's), which made every repeat wait a bar. The click has a volume
slider in the playback bar, the metronome's own setting (`metronomeVolume`),
live while playing (SectionPlayer `setClickVolume`). The music has its own volume beside it, every part
together (SectionPlayer `setMusicVolume`, kept in this browser), and the
count-in says "1, 2, Ready, Go" over the playback bar as the practice pages'
does (PieceViewer `passCountIn`, from the audio clock; 23 October 2026). Loop with the whole piece in play asks for the bars
on the music, first then last, and plays them round (`toggleLoop`); a chip
says what is looping, with Change. The playback bar's Layout menu
(score-view.ts, kept as "pieces"): size, bars per line, line spacing; a
change while playing carries on from the same place. `LOOP=1
scripts/check-piece-viewer.ts` checks all three, and that the playing line
stays on its note through a layout shift. Repeats are followed: the
whole piece's sound plays them (write-abc), so the cursor, a start from a
note and grading read the sound's time through `src/lib/pieces/timeline.ts`
(`playedBars`, `Timeline`; tests `pieces-timeline.test.ts`), and
`scheduleForPiece` takes that order. **Listen and grade** is Grade's own
panel (GradePanel, with a `setup` slot and no New exercise) on one part of
the bars in play: Pitch & rhythm (the sound made with the other parts, every
part with yours quietly, or a cappella) or Note by note (each note lit, Pip
on it, and the other parts' notes under it played as it comes up, never your
own pitch class), in the key chosen, letter names. Practice: nothing is
kept on the server. Each practice run is recorded in this browser
(grade-recording) and the results offer **Hear your take** (15 October 2026,
Blaine: hear back grades in My music): the Unison page's `TakePlayer`, with
"With the music" playing the run's own sound as heard (SectionPlayer's
buffer, kept at the run's end as `takeSound`, `TakeMusic.buffer` and
`bufferAt`) and the click; the note line and cursor follow it. Note by note
has no music under it; a tapped note of the part sung plays it from there,
as on the Unison page (23 October 2026). Gone with a new run or Close. `check-piece-viewer.ts` covers all of it (fake microphone: the run
starts, runs and grades; `PIP_SHOTS=` pictures Pip). Pip rides just left of
the note now, on both pages (Blaine: behind the cursor, not on the note).

**Graded attempts** (`src/lib/pieces/attempts.ts`, schedule.ts; server
`src/lib/server/attempts.ts`; tests `pieces-attempts.test.ts`): a student
starts one (`POST /api/assignments/<id>/attempts` with their part; counted
then, so stopping part way still uses one of a limited number), the page
runs Grade's Pitch & rhythm (`GradeRunner`, the Unison page's engine) on
their part's notes from the model (`scheduleForPiece`: 32nds from the
excerpt's first downbeat, ties held), with what the teacher chose to hear
(SectionPlayer, below) plus a click and count-in (t0 from the audio clock;
not yet measured end to end with a fake microphone the way the Unison
page's was), then sends the scores and each note's marks
(`PATCH .../attempts/<attempt>`) and the take, straight to private Blob
(`/api/attempt-takes` signs it: the student's own attempt, under two hours
old, no take yet; `attempts/<assignment>/<attempt>.webm`). The student is
told first that their teacher hears it and it is kept 90 days; the daily
cron (`/api/cron/po-invoices`, `deleteOldTakes`) deletes takes past that,
and any left by a deleted attempt; deleting the assignment deletes its takes.
The teacher's class card shows each student's part, attempts and best (a
link opening that attempt: `?attempt=` puts its marks on the music and plays
its take, `/api/attempts/<id>/take`). The teacher can Try the grading in
the assignment; nothing is kept.

Before each attempt a dialog checks the setup (`AudioCheck.svelte`, rules
`src/lib/pieces/audio-check.ts`, tests `audio-check.test.ts`; Blaine, after
SmartMusic): headphones on (wired; Bluetooth lags), a speaker test (four
notes, "Yes, I heard them"), a microphone test (a live meter until a voice is
held half a second), and the beep test: three A5 beeps played while the
tuner listens; heard in two of three (the beep's pitch class in a third of
the frames, or 10 dB over the quiet after it) means the microphone will hear
the accompaniment and grade it, so headphones or a lower volume are asked
for (Go on anyway is allowed). Passed once in a tab (`abc-audio-check-v1`,
sessionStorage), later attempts open on the last step with Check my setup
again. The microphone it turns on stays on into the attempt.

Assigning (Educator, as every assignment): a class's assignments are two
kinds, kept apart wherever they show (Blaine: "a clear distinction between
generated sight reading and my library"): **Sight reading** (sky; a step, a
level or a saved preset, written new each time, for minutes) and **My
music** (peach; `piece:<id>` keys, `page: "piece"`). Assign practice asks
which first. A piece assignment is bars of a piece (`src/lib/pieces/assign.ts`,
tests `pieces-assign.test.ts`); each student chooses their own part when
they open it (Blaine, so one assignment serves every section; kept in their
browser, `abc-piece-part-<assignment>`). A part they may choose is one line
over those bars (no chords, no second voice: one microphone hears one note),
and the bars keep one meter. The teacher chooses what students hear with
their part (`hearing`, `levelFor`): the other parts with their own silent;
every part with theirs quietly (`QUIET_LEVEL`); only the parts the teacher
picks (a piano); or a cappella, a click only. Every student has Starting
note, a Click, and can tap any note to hear it (abcjs `clickListener`, the
drawn element mapped to its model notes). Also the tempo, attempts (as many
as they like, or up to 20), strictness; minutes optional (0 is no time
goal). The form (`AssignPieceForm.svelte`) is on a class's card and in the
viewer (Assign to a class), says why bars cannot be assigned, and draws the
excerpt. Every bar of a piece is numbered as the teacher's score numbers it
(write-abc: `%%barnumbers 1`, and `%%setbarnb` in the body before the first
voice's `%%MIDI program`, since abcjs throws on it in a header with voices
and counts one short after a MIDI line). In the form the teacher taps bars on
the whole piece (Tap the first graded bar, the last, where the lead-in
starts) or picks them from lists; the graded bars are shaded peach, the
lead-in sky (`score-dom.ts` `shadeBars`). A **lead-in** (`leadIn`, at or
before the graded bars, one meter throughout): playback starts there, heard
and not graded. `/pieces/<id>?assignment=<id>` opens it for a student (and for the
teacher, in the director's view first): the whole piece, the bars outside
the assignment faded and the first scrolled to, their part marked "(you)"; Play plays the lead-in to the last graded bar through
`SectionPlayer` (section-player.ts: those bars rendered to an AudioBuffer
off screen, started at a known moment on the audio clock, the count-in and
click scheduled on that clock, since abcjs's `%%MIDI drumoff` silences its
count-in too), and the cursor follows the audio clock (`soundingAt`). Grade's
t0 is when the music is heard plus the lead-in. Checked in headless Chrome on
a Mozart quartet: the shading, a tap mapping to its bar, the count-in exact
(2.12 s for four beats at 120 plus the 0.12 s start). Practice time counts
(page "piece"). A student reads the piece through the assignment (`pieceForReader`); a piece
cannot be deleted while assigned.

- `src/lib/pieces/read-musicxml.ts` reads the file into `PieceScore`
  (model.ts), the truth about the piece: 48 ticks a quarter, written order,
  repeats and voltas kept as written (abcjs plays them), each bar keeping its
  printed number. Grace and cue notes, drum parts and D.S./coda jumps are
  left out and listed in `warnings`. A tie between different pitches (a
  slur exported as a tie) is dropped. Parts map to the nearest instrument we
  can play (`nearestProgram`).
- `src/lib/pieces/write-abc.ts` writes ABC from it for abcjs only (L:1/192):
  a voice per staff and MusicXML voice, `%%MIDI program` after each voice's
  first body `V:` line (the only place abcjs takes it per voice),
  `transpose=` for playback of a transposing part, which is drawn as
  written. Two abcjs habits it writes around: a partly tied chord is tied as
  a whole (`[Fca]72-`; abcjs holds only notes on the same staff place), and a
  tied-over note's accidental does not carry (abcjs forgets it, as engravers
  do). `voices[].elements` pairs each drawn note with its model note
  (`drawnElements`), for grading marks later.
- `bun run scripts/check-pieces.ts <files or folder>` imports real files
  (put them in gitignored `pieces-samples/`) and checks every four-bar
  excerpt plays exactly as the model says. Clean on 9 October 2026 over a
  Bach chorale, string quartets by Beethoven, Mozart and Schumann, and the
  Maple Leaf Rag (music21's public-domain corpus). Tests `pieces-read.test.ts`.
- Storage: the server reads the upload (the page zips a plain file first so
  it fits the 4.5 MB request limit, 4 MB compressed at most), keeps the file
  and the model (gzipped JSON) as private Blobs under
  `pieces/<user>/<piece>/` and a `Piece` row (`src/lib/server/pieces.ts`,
  `/api/pieces`, rules in `src/lib/pieces/rules.ts`).
