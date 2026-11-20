# Games

`/games` (2 November 2026, Blaine: a Games section up top, a rhythm game and
a solfège game, eventually joined by a code on students' own devices): two
games, each played on one device (free, no account) or hosted by a director
on the big screen while every student plays on their own device (hosting is
Pro, as Live is; students need no account). In the navbar beside Practice,
in the phone menu and the footer; the pages are in `seo.ts`. The old
owner-only prototype `/rhythm-game` (`Abcjs.svelte`) redirects to
`/games/rhythm` and is gone. `?host=1` opens a game on "With your class".

Rules in `src/lib/games/` (tests `tests/unit/games-live.test.ts`,
`games-tune-path.test.ts`, `ear-quiz.test.ts`, `note-rain.test.ts`, `beat-bar.test.ts`), pages `src/pages/games/`, components
`src/components/games/`. End to end: `APP=http://localhost:4472 bun run
scripts/check-games.ts` (`GAME=rhythm|tune|solo|both`, `SHOTS=`) on a dev
server on the local database, as `check-live.ts` (notes/live-practice.md);
clean 2 November 2026.

## Ear training: Solfège and Intervals (17 November 2026)

Blaine: bring learnmusic.fun's ear-training games over, "with modes for
scale degree, fixed do, minor", for points "if their teacher lets them";
Solfège first, then Interval, then Note Rain (which "needs to be fixed").
learnmusic.fun stays up as its own free site. **Dev only for now** (Blaine,
17 November 2026: "take off main, only on dev, unless it's just an admin
feature"): on Production (`VERCEL_ENV` production) the pages, their cards on
/games and `/api/games/round` are an owner's only (`earGamesShown`); on dev,
preview and local servers everyone has them. Not in the sitemap until public. Written fresh in Svelte from
its ideas, not ported (its question makers use Math.random; these are seeded).

- Rules `src/lib/games/ear-quiz.ts` (tests `ear-quiz.test.ts`, property tests
  with fast-check over every level and seed): a round is QUIZ_LENGTH (10)
  questions from a seed (mulberry32), so the browser and the server deal the
  same round. Notes come from a shuffled bag: every note of the level before
  one comes again, never the same answer twice running (the property test
  found so and low so back to back; the bag now joins the next one).
- **Solfège** (`/games/solfege`, `SolfegeEar.svelte`): the key (chord, then
  1 3 5 3 1 5 1, on the KeyStrip card, which now takes its names as props),
  then each note after the tonic (or just the note). Major or minor, eight
  levels in the ladder's order (do mi so; do re mi; up to so; up to la; the
  scale; below do; low so to high do; chromatic), or Custom notes. Named as
  movable do (minor la- or do-based, the site's choice elsewhere too), scale
  degrees, fixed do (C is do, the key's spelling: D major's mi is fa♯) or
  letters. Chromatic syllables are di me fi le te. A random key a round.
- **Intervals** (`/games/intervals`, `IntervalEar.svelte`): two notes up,
  down, either, or together. Levels 1 to 3 are sizes from a major scale
  (step or skip; 2nds to 5ths; to the octave), the answer the size; 4 to 7
  are major, minor and perfect by semitones; Custom picks semitones.
- Play is shared (`EarQuiz.svelte`): tiles (number keys answer, space
  replays), the tiles open only once the note has sounded, the first answer
  counts, a miss shows and plays the right one, Stop goes back to the setup,
  the result card has stars and Level N+1 after 9 or 10. No hosted mode yet.
- **Points** (`src/lib/server/ear-games.ts`, `/api/games/round` and
  `/api/games/finish`): signed in, the server deals the round as a token (the
  setup, the seed, the device's day, an id, signed with BETTER_AUTH_SECRET;
  no table) and marks the answers itself from it. Earns only when one of the
  student's classes has **Games earn points** on (`Class.gamePoints`, off by
  default, the switch on the class's Points tab; owner classes only while
  points are tried out). A round finished faster than an honest one can go
  (each game's `minSeconds` in ear-quiz.ts: the key, then each question's
  wait before its tiles open and the 0.9 s after a right answer, less a
  second; a flat 20 s refused quick students on Just the note and Together)
  or after two hours, or someone else's, earns nothing; a round counts once
  ever, on any day. Rules in `points.ts`: a point a right answer, +5 for
  10/10, nothing under 7; half below the student's level in that game (two
  rounds of 9+ at a level make it theirs, `bests` "gl:<track>") and on Custom;
  repeatFactor by game a day; at most 50 a day from games. `gameCorrect`
  counts toward the new **Good Ears** badge. Game points count on every
  leaderboard the student is on, games switch or not (the switch decides
  only whether they earn); the teacher's panel doesn't split them out yet.
- End to end: `scripts/check-ear-games.ts` (header has the server it needs):
  the rules through `award()`, the token checks over HTTP, a whole Solfège
  round and a whole Interval round in the browser as a student, the switch,
  signed out, phone width.

## 18 November 2026: customizing, Note Rain, assigning (Blaine's notes)

- **Levels and Customize are tabs** on every game (`GameLevels.svelte`): Levels
  as big numbered cards (never a menu), Customize with the game's own choices;
  what both share (key, speed, names...) sits under the panel. Blaine: the
  custom option was "hidden at the bottom and really hard to find". The tabs
  follow the web guidance (labelled tablist, aria-selected, arrows, an
  underline as well as colour). Checks find them by `[data-game-levels=<game>]
  [data-tab=customize|levels]` and `[data-level=<index>]`.
- **Solfège on a piano keyboard** (`NoteKeyboard.svelte`, after
  learnmusic.fun's SyllablePoolPianoSelector; "important to me"): the scale's
  notes are white keys, the others black keys between them (minor's white keys
  are natural minor, so si is a black key), labelled with their names; it is
  both Customize's note chooser and the answer tiles (`QuizRound.keyboard`,
  number keys and `data-answer` as before). On a phone a long keyboard scrolls
  sideways rather than squashing (keys at least 2.6rem).
- **Solfège's new options** (ear-quiz.ts, all through `checkSolfegeSetup`, so
  the server deals what the browser plays): `ref`, the note heard before each
  question: nothing, do, mi, so or la (minor: la, do, mi), replacing
  `tonicFirst` ("Play do first" was unclear to Blaine; old saves read as do or
  nothing); `key`, a fixed key or a new one each round; `anyOctave`, a note
  may come an octave up or down inside 53..79 (learnmusic.fun's range). With
  the old options a round deals exactly as before (13,532 rounds compared
  against the previous code, 0 different).
- **Intervals in one key** (`sameKey`): one tonic a round, drawn first, both
  notes of every question in its major scale (every size from a minor 2nd to
  the octave is in a major scale), and the key plays first (`intro`, so the
  too-fast floor adds the key's seconds). Blaine: "really hard when it jumps
  around between keys".
- **Tap the rhythm's beat bar**, replaced the same day by the lane (below):
  Blaine, "not what I meant at all. I meant a Guitar Hero style bar going
  across". `beat-bar.ts` and its test were deleted with it.
- **Note Rain** (`/games/note-rain`, `NoteRain.svelte`, rules
  `note-rain.ts`, tests `note-rain.test.ts`): brought over from
  learnmusic.fun fresh (Blaine called it the storm game: its timed round is a
  "60-sec storm"). Dev only, as the ear games (`earGamesShown`). Notes fall on
  white cards drawn by abcjs (each note of the round drawn once and reused);
  name the lowest before it lands; a wrong answer rests the buttons 0.45 s
  (no mashing); three strikes. Rounds: a 60-second storm, 20 notes, or
  Endless. Levels: three notes, five notes, the lines, the spaces, the whole
  staff, staff and middle C, ledger lines; Customize is a drawn staff
  (`StaffPicker.svelte`) with every note the clef offers, tap to choose
  (Blaine: the old Lowest and Highest steppers were unclear). **The speed**:
  learnmusic.fun's Hard started at 1.2x, added 0.75x a minute and stopped at
  2.2x, so a note fell in about 5.8 s at the start of a storm and 1.8 s at its
  end ("I can play it easily with my mouse while talking"). Here it doubles
  every 40 s from Relaxed 0.7, Medium 1, Fast 1.5 or Extreme 2.2, with no top
  (a note never falls faster than 0.65 s, but they come closer together and up
  to 8 at once): Medium 6 s at the start, 2.1 s at a minute; Extreme 2.7 s,
  under 1 s at a minute. The look is plain (no clouds, hills or rain:
  "the backgrounds are corny"). Naturals only for now (learnmusic.fun has keys
  and accidentals); no piano answer mode yet.
- **Assigning a game** (`game-assignments.ts`, server
  `src/lib/server/game-assignments.ts`, check `scripts/check-game-assignments.ts`):
  **Assign to classes** under a game's setup (`AssignGame.svelte`, an account
  with classes; Educator on the server) gives the game as it is set up to the
  classes chosen, with a goal (so many rounds at or above a score: right of
  10, notes named, percent, stars), a due day and a note. **Its own tables**
  (`GameAssignment`, `GameAssignmentResult`, migrations
  `20261118000000_game_assignments` and `..._game_result_round`), not
  `Assignment`: main's practice pages send an assignment with a page they
  don't know to Choral, whose fetchAssignment redirects to itself, and the
  database is shared. Students see them with their assignments
  (`StudentAssignments`, a butter "Game" tag), open `/games/<game>?ga=<id>`:
  the banner (`GameAssignmentBanner`), the setup locked, no levels, Customize
  or Assign. **Ear games are marked on the server**: `/api/games/round` deals
  from the assignment's stored setup whatever the browser sends, the token
  carries `ga`, `/api/games/finish` records the round (`checked`, its round id
  unique, so once). Note Rain, the rhythm game and Catch the tune report their
  score from the device (`checked` false); they earn no points. On the live
  site the assignments of dev-only games are hidden with the games. The
  teacher sees each in the class's Assignments tab on /teach
  (`ClassGameAssignments`), with who is done, and Remove. Results go with the
  class, the student or the assignment, and after 395 days (the daily cron).
  Not yet: the gradebook and Google Classroom for games.

### 18 November 2026, later: Blaine's second round of notes

- **Tap the rhythm's lane** (`RhythmLane.svelte`, on by default, `Lane`
  button, `sr-rhythm-lane`): a slim strip (40px) under the music, outside
  abcjs's SVG. Each note is a pill as long as it lasts, sliding right to left
  into a hit line 18% in, 3.2 beats seen ahead; rests are dashed gaps; beat
  lines, bar lines, the count-in's beats numbered. One strip moves by
  transform. **It runs on the scoring's clock**: `set(beat)` from
  `(performance.now() - audioToPage(ctx)(musicSec)) / beatMs`, the audible
  time the taps are scored against. Drawn on `ctx.currentTime` instead, taps
  on the line scored 37%; on the page clock, 100%.
  `scripts/check-rhythm-lane.ts` (headless; a backgrounded Chrome tab runs
  3 frames a second and taps late) presses Space as each count-in line and
  pill reaches the hit line and expects 90% or more: 100% on levels 1, 4,
  8 and 11. After a round the lane fits the whole rhythm, its pills green,
  yellow or red like the notes.
  **Still, it lines up under the music** (19 November 2026, Blaine: "make
  sure the bars under the notes line up with the starts of notes better"):
  before a round and after it, each pill starts under its note's drawn
  left edge (measured by cursor in the paper, as `rhythm-marks.ts` finds
  notes; beats between are spread evenly, bar ticks on the drawn barlines).
  abcjs spaces by look, so even beats had drifted (a half note at 270px in
  the score was at 55px in the lane). Four bars draw on two lines and keep
  even beats. Playing, the lane still scrolls at an even speed.
  `scripts/check-lane-under-notes.ts`: every level, 1200px and 420px, every
  pill within 3px of its note (0.0px measured, 66 rhythms).
  **"Under the notes" is now the default lane** (the same day, Blaine:
  "have the bars always underneath the notes, statically, the distance you
  would hold that note", then "need to make it work when there are multiple
  lines"): three buttons, Under the notes / Scrolling / No lane
  (`sr-rhythm-lane` = still, scroll or off; the old "on" reads as still).
  `RhythmLaneStill.svelte` lays a row under each line of music over the
  drawing: lines start where the bars before them end (so a note tied over
  from the line before shows at the row's start), each barline ends its bar
  (a note ending on it stops there), the row sits under the lowest thing
  drawn on its line (syllables too). RhythmGame draws with `%%staffsep 85`
  and paddingbottom 34 in this mode to leave the room. Nothing scrolls; a
  line moves along the row being played and the sounding note's pill glows.
  `scripts/check-lane-under-notes.ts` (2 and 4 bars, 1200px and 420px,
  every level): every pill within 3px of its note, its row below its line
  and above the next: 88 rhythms, 0.0px. `MODE=still BARS=4
  scripts/check-rhythm-lane.ts` taps as the line reaches each pill and
  checks the rows never move against the music: 100% on levels 1 and 8;
  scrolling still 100% on level 4.
- **Holding the long notes** (19 November 2026, Blaine: "grade not holding
  out longer notes, like half notes should be held at least 1 beat, dotted
  half notes at least 2. Don't have to go all full value"): solo rounds keep
  each tap's press and release (spacebar keyup, the Tap pad's pointerup;
  `presses`), and `gradeHolds` in `game-score.ts` finds each note's own tap
  again from its graded timing. A note of 2 beats or more must be held its
  length less one beat (`holdNeeded`: half 1, dotted half 2, whole 3), with
  a quarter beat of grace; still down at the end counts. One let go too soon
  keeps half its timing credit (its beat is not right, it marks yellow) and
  the result says how many. Live rooms do not send releases and are not
  checked for holds. `tests/unit/rhythm-holds.test.ts`;
  `check-rhythm-lane.ts` with `HOLD=full` (none flagged, 100%) and
  `HOLD=tap` (every long note flagged), by key or `INPUT=pad`.
- **The Tap pad, out of the way** (the same day: "scroll so the tap bar is
  out of the way of the rhythm and add a way to hide it or make it
  smaller"): a Tap pad choice, Big / Small / Hidden (`sr-tap-pad`; Hidden is
  the spacebar only; Small is a slim key lower down, `TapPad size`). As a
  round starts the page scrolls the music up so its foot is just above the
  pad (never its top above the window), with room added below the game
  while it plays. `check-rhythm-lane.ts` checks the music is clear of the
  pad all round long.
- **The pad lower and smaller in the game** (the same day: "too big and too
  high on some screens"): its usual place is above the playback bar and
  Grade's strip, which the game page does not have, so it floated about
  176px up. `TapPad low` (the game passes it) puts it 0.75rem from the foot
  (or the safe area), 24rem wide, `clamp(3rem, 9svh, 4.25rem)` tall (Small:
  14rem, up to 3rem), and drops "or Space" under 560px tall. Practice pages
  keep the old place.
- **Beats on the bars** (the same day: "a way to show beat values on the
  bars"): a Beats toggle beside the lane choices (`sr-rhythm-beats`, off at
  first) writes each note's length in beats on its pill in either lane:
  1, 2, ½, ¼, 1½, and ⅓, ⅔ in compound meter (`beatLabel()` in
  `src/lib/games/beat-label.ts`, `tests/unit/beat-label.test.ts`). A note
  tied onto the next line has it on its first piece only.
- **Full screen, the page following the music, the options** (Blaine, 20
  November 2026: "make it look better on fullscreen like our regular rhythm
  reading where it auto scrolls on line and fix the interface to pick the
  options"):
  - *Full screen*: a button at the stage's top right (F, Esc; the icon
    alone on a phone) uses the practice pages' `createFullscreen()`
    (`src/lib/fullscreen.ts`, `html.sr-focus`). The title, the two tabs,
    the levels and options (`.setup`) and the how line are `.focus-hide`;
    `rhythm.astro` lifts the page's max width under `sr-focus`. The music is
    then drawn as wide as the screen. F before a rhythm is written does
    nothing (there would be no Exit button to press).
  - *Following the line*: the lines and their beats come from the drawing
    (`drawnLines()` in `rhythm-marks.ts`, shared with the still lane, so a
    tie held onto a line does not shift it). As a round starts, the first
    line (with the count-in's word) comes up clear of the Tap pad. A beat
    before a line ends, the next is brought on if it fits without pushing
    the current line's top off. As it starts, it is brought fully on, its
    top first when it cannot fit. The page keeps 70vh of room below while a
    round runs, and the result is scrolled into view after.
  - *The still lane scales*: `--k` (the drawing's width over abcjs's own
    units, 0.82 to 1.9) sizes the rows, pills and beat numbers, and a
    ResizeObserver measures again when the drawing changes size (entering
    full screen, turning a phone).
  - *Phones*: under 500px wide (not with the scrolling lane), one bar to a
    line at staffwidth 300, about twice as big; drawn again when a resize
    crosses that line, never mid-round. `%%stretchlast 1` keeps a short last
    line as wide as the rest.
  - *Options*: two fieldsets, "The round" (Bars, Tempo, Grading: what an
    assignment sets) and "On screen" (Lane, Tap pad, the beats checkbox).
    Each choice is native radios drawn as one pill (arrow keys come free),
    tempo stays a select (six values), and the beats are a checkbox. Narrow
    (a container query on the group): each label over its choices, sharing
    the width; under 17rem they may wrap. Hooks: `data-bars`,
    `data-strictness`, `data-lane-mode`, `data-pad-size`, `data-show-beats`,
    `data-full-screen`.
  - *Checks*: `check-rhythm-lane.ts` takes `W`, `H` and `FULL=1`, and with
    the still lane checks the line being played and its row sit between the
    window's top and the pad (the whole music no longer fits at 4 bars drawn
    big). With the following turned off it fails at 844x390.
    `check-lane-under-notes.ts` draws each rhythm in the page's column, then
    enters full screen at 1200, 1920 and 2560 wide (paper 864 to 1104, 1824
    px) and checks the pills again: with the ResizeObserver off they land
    216 to 848 px from their notes. Headless Chrome does grant the real
    full screen (`document.fullscreenElement` is set).
- **Rhythm levels shown as symbols** (Blaine: the cards said "Ta, Ti-ti, Ta
  rest"; "use the symbols we have instead, and do the same whenever a new one
  is added"): `levelNews()` in `rhythm-levels.ts` gives each level the
  figures and meters no earlier level had, from the ladder, so a new step
  gets its symbols with no one writing them. The card draws the Unison
  picker's own SVGs (`src/assets/svgs/<figure>.svg`, at their natural size)
  and stacked time signatures; the name stays as the accessible name and
  as `levelName` in assignment titles. Level 10 "Two beats" (Blaine: "I
  don't understand the point") is the ladder's 2/4 step, sbs-10-rhythm: its
  card now shows 2/4 and "New: 2 beats a bar". Kept, since ids are permanent.
- **Note Rain's picker in real notation** (Blaine: "the customize feature
  looks really ugly", "we don't have a regular clef": the picker had the word
  "Treble" on its side and dashed ghost notes): `StaffPicker.svelte` draws
  the clef and all 17 notes as whole notes with abcjs, chosen blue and the
  rest grey, each a button the staff's height (38px wide on a desktop) with
  a name chip; under 34rem it scrolls sideways so notes stay a finger wide.
- **Note Rain's sky** is the sky pastel, the cards white with a tinted border
  and shadow, the music on them larger (scale 1.5); the answer buttons are
  panels, not the sky's colour (Blaine: "the white notes on the white
  background don't look good").
- **Solfège says what is playing** (Blaine: "make it work like
  learnmusic.fun, where it says this note is Do, what's the ? note"):
  `QuizRound.steps` gives the notes' labels, and EarQuiz shows them as big
  cards, "do → ?", each lit as it sounds (`play`'s `onStep`), with "This note
  is do. What's the next note?"; after a miss, "do → so" and "From do, that
  was so." The reference note (do by default) and its 1.1 s gap are as
  before, so rounds and the server's floor are unchanged.

### Plan: theory speed games (not built)

Blaine (18 November 2026): gamified theory drills "such as note reading,
aimed at getting faster, similar to Note Rain", and teachers assigning
specific content, "e.g. recognizing the key signatures C, F, G, D and B♭
quickly enough".

1. **One engine, many decks.** Note Rain's loop (fall, name the lowest, three
   strikes, a ramp, Endless) with the card's content and the answers
   swapped: a deck is a list of cards (what to draw with abcjs) and the
   answer buttons. Decks: note names (Note Rain itself), key signatures
   (major, then relative minor), intervals on the staff, triads (root
   position, then inversions), rhythm values and rests, accidentals in a key,
   note values in counts. Each deck has levels (pedagogy first: one new
   element a step) and a Customize of its own (key signatures: tick the keys).
2. **Goal is speed, measured.** Besides the falling mode, a "sprint": N cards,
   one at a time, answer as fast as you can; the score is cards right and the
   median time a card. A teacher's goal can then be "these five key
   signatures, 20 right, under 2 s each", which is what "quickly enough"
   means. Per-card times also feed the tricky list (slowest, not only missed).
3. **Assigning**: the same Assign to classes (game-assignments.ts) with the
   deck and its chosen cards as the setup; the goal gains a time ("under N s
   a card"). Rounds are dealt by the server from a seed as the ear games are
   (a token, marked on the server), since a sprint's cards are a fixed list.
4. **Order to build**: key signatures first (Blaine's example; small deck,
   abcjs draws them), then intervals on the staff, then triads. Points follow
   the ear games' rules (the class's Games switch).
5. Questions for Blaine before building: should a wrong answer cost a strike
   in the sprint, or only time; minor keys in the same deck or their own;
   should students see the class's fastest times (a leaderboard), given
   students under 13.

## Tap the rhythm (`RhythmGame.svelte`)

A few bars (2 or 4) of one of abcStepByStep's rhythm steps
(`rhythm-levels.ts`: every ladder step with `rhythmOnly`, so the game follows
the curriculum), written by `/api/generate` exactly as the Unison page asks
for rhythm only (games never count against the monthly allowance), drawn big.
The site's own count-in ("1, 2, Ready, Go", a bar; two in 2/4), tapped along
with, then tap the rhythm on the spacebar or the pad while the click goes on
(Blaine, 2 November 2026: it was two bars, "Listen" then "Tap with the
clicks", and "listen to what?"). Graded by Clap
and grade's rules (`gradeClaps`, beat by beat; `scoreRhythm` in
`game-score.ts`), the notes marked green, butter or red on the music.

**Lag** (`game-lag.ts`): everyone taps along with the count-in, and the median of (tap minus click) is this player's delay: the big screen's
speakers (HDMI, Bluetooth), the sound crossing the room, the device's touch.
It is taken off (`latencyMs`), clamped to -100..350 ms; each click takes the
nearest tap within its window (never past three quarters of a beat, so the
last click never takes the first note's tap), and those taps are not graded.
A player who did not tap the count-in takes the room's median lag; with no
one's, a steady lateness is forgiven as an unchecked Clap and grade forgives
it. Solo uses the device's own Check timing (`tapLatencyMs`) only when the
count-in was not tapped. Lining up on the first note (Blaine's first idea)
was not used: it forgives a wrong first note and shifts every note after it.

Hosted: taps are stamped on the server's clock (Live's `clockOffset`, from
`/api/live/time`), the round starts at a server moment 4 s ahead (`at`), and
the big screen books its clicks on its own audio clock for that moment.
Checked with four devices whose clocks were seconds wrong and whose taps
were 0, 120 and 300 ms late: each scored 100; one a sixteenth late on one
note scored 88.

## Catch the tune (`CatchTheTune.svelte`, `TuneGrid.svelte`)

**4 November 2026 (Blaine's notes on the dev site):**
- **Piano louder.** The games' piano goes in three times as loud through a
  limiter (`gamePiano()` in game-audio.ts: gain `PIANO_BOOST` 3, then a
  DynamicsCompressor at -4 dB, ratio 20, 2 ms attack). Full gain on one
  sample was the most it could give without clipping. `playPiano` takes an
  optional output node for this. The paragraph below keeps the older
  `PIANO_VOLUME` history.
- **The key is plain.** It opens with do mi so held together, then do mi so
  mi do so do, 0.5 s apart. `KeyStrip.svelte` sits above the board all the
  time, so the board never jumps: "First the key", the chord, then each
  syllable lit as it sounds (`onKey` in `playKeyAndTune`), then "Now the
  tune".
- **The playing column is outlined.** A 4 px action-blue frame
  (`.playing` in TuneGrid) is absolutely positioned on that column's grid
  area, `grid-column: n / span 1`. Without the span it runs to the right
  edge, and in normal flow it would take cells from the board. The column
  number turns solid blue. It was a faint butter ring.
- **A second tap on a written note clears it**, silently, solo and on a
  student's device (LiveGame `pick`). check-games tests this.
- **The controls are under the board**, 56 px tall, with Lucide icons (Play
  or RotateCcw for hear, Square to stop, Check on mint, Eye for show the
  tune, SkipForward for the next tune). Above the board they were out of a
  short student's reach on a wall screen. The big screen's host buttons got
  the same.
- **Later the same day:** the key and the Check result are **floating
  cards** over the board (`.boardwrap` is relative). The key card ("First
  the key", the chord, the syllables lit) shows while the key plays and reads
  "Now the tune" on the first note. Taps go through it. The Check card (peach,
  "n of m right", Got it) is an `alertdialog`, and any tap on the board also
  closes it. **A note a Check finds wrong is ruled out**: its square
  (`ruled`, "col:step") stays red with a cross and can't be tapped, and its
  column is emptied to fill in again. **The hint splits the working column**
  into a thick solid border and tint for notes the last one can reach
  (`.can`), and grey stripes with a dashed border for those it can't
  (`.cant`). A legend under the board names them. It keeps its space when
  idle, so the buttons don't jump. This reverses the 2 November "nothing
  dimmed" rule at Blaine's request: he couldn't tell a legal skip from an
  illegal one.
- **The catch is a pop-up** (later on 4 November): a fixed dialog over a
  dimmed page, so nothing scrolls. It used to replace the prompt above the
  board, and the page jumped up to it. It has an ✕, Esc, or a tap outside to
  look at the board, where Hear it again and New tune wait. **Confetti only
  for three stars**: 70 pieces over the whole screen, each with its own
  random place, speed, drift and spin (`bits`), in the pastels. A stagger on
  one formula fell as a dotted diagonal line. **The tune no longer replays
  by itself** after a catch, only from Hear it again. The stats are plain
  lines with icons (Target, Flame, Music), not pills, which read as buttons.
  check-games checks it's fixed, that nothing scrolled, that a two-star catch
  has no confetti, and that nothing plays.
- **The Speed slider fills from the left** (`.fill-range`, a gradient to the
  thumb, since Safari's own range shows no fill). It now holds `3.5 - gap`,
  so the slow end is on the left without `direction: rtl`, which filled it
  from the right.

Octavo Academy's game (its `CatchTheTune.svelte`; the rules `tune-path.ts`
copied as they are, with Octavo's tests): Pip gives the key (do mi so mi do,
so below, do, on the piano) and plays a tune of five to eight notes; find
each note on a board of a column a note and a row a syllable (a note the
level leaves out is a thin empty row, so a move over it reads as a skip),
the first given. Seven levels: steps on do re mi, + so, + la, below do, high
do, + fa, leaps. Solo: a tap writes the note into its column, any column,
and nothing is judged until **Check**, which marks each note right or wrong;
a note changed after a Check loses its mark until the next one; Show the
tune after a failed Check (Blaine, 2 November 2026: one way only; the Each
note mode, which judged every tap, is gone). A tap sounds its note, but not
while the tune is playing (the tune keeps going; a second note on top of it
confused). Stars count failed Checks. Hints tint the notes the last one can reach, in the column being worked on
(nothing is dimmed: Blaine, 2 November 2026, dimming gave too much away). Do is middle C. The tune plays
at 2 seconds a note by default, set with the Speed slider (0.5 to 3 s, right
is faster; `sr-catch-gap`), on this device and on the big screen alike
(Blaine, 2 November 2026: 0.75 s was too quick). A catch shows a mint card in place of
the prompt (Blaine, 2 November 2026: a better success screen): Pip, "Perfect
catch!" or "You caught it!", stars (three with no wrong note, two with one or
two wrong tries or failed Checks, one after more), the clean catches in a
row, the tunes caught, and Next tune; a short confetti fall, none under
reduced motion. The games' piano plays at full gain (`PIANO_VOLUME` 1 in
game-audio.ts, the Tools piano's 0.5 doubled) to carry over a room's
speakers. Repeats are weighted by level (`makePath`): 1.1 on
the steps-only levels, so about half of Steps tunes have one, and 0.3 above,
where skips and leaps are being taught (about 30%); a flat 0.35 left Steps
at 6% and Blaine never heard one. The slider has a turtle at
the slow end and a hare at the fast end and no number beside it (Blaine: a
number changing inline is bad UI); the seconds are in its title and
`aria-valuetext`.

Hosted: the big screen plays the tune and shows the empty board; devices
fill in the board and Send; the big screen reveals when everyone has sent or
the time is up (20 s + 3 s a note), with each note's share right. Points:
right notes after the first out of 100, and up to 20 more for speed when all
are right (`scoreTune`).

## Hosting (`GameHost.svelte`, `host-room.ts`)

A hosted game uses the director's own live room: the same permanent code,
address and poster as Live practice. Live goes on with `page: "game"` and
the room's `game` field (`LiveRoom.game`, `src/lib/games/live-game.ts`
`LiveGame`) holds the game: kind, round id, phase (lobby, playing,
answering, results), the round's public part and the board. Published by
`PUT /api/live/<code>/game` (owner only; it bumps the version and notifies
the push worker, so sockets and polling both carry it). **It is public**:
`publicGame` and `checkGame` keep a tune's notes out of every phase but the
results, and the check confirms no device is ever sent them early.

Answers: `POST /api/live/<code>/game/answer` from a device (rate-limited,
only while the round is playing or answering, one a device a round, sent
again replaces it) into `LiveGameAnswer`; the host reads them with `GET
.../game/answers?round=` about once a second, scores them in the browser
and publishes the board. A new game clears the room's answers, and the daily
cron deletes any older than a day (`deleteOldGameAnswers`). Migration
`20261102000000_live_games` (additive: a column and a table).

Players: a device's name is made up from its random device key
(`game-names.ts`: "Mint Otter"), nothing typed, since students may be under
13; the board finds a device's own row by `playerTag` (a hash, never the
key). While the room plays a game, LiveStudent shows `LiveGame.svelte`
instead of the music and reports the name as its part, so the director's
device count lists the players.

## Custom setups (2 November 2026)

The preset is called just **Custom** in both menus (Blaine: the longer
"Your own: meters, rhythms, ties…" read badly). A round of four bars is
drawn two bars to a line (`roundLayout` in rhythm-marks.ts), on the big
screen and in a phone's review: four on one line were too narrow.

Blaine: ta and ti-ti is too limiting; which steps and skips, which note to
start on. The rhythm game's menu ends with **Custom** (`RhythmSetup.svelte`):
meters (one kind at a time, as on the Unison page), the figures with the
Unison page's picker groups and note pictures, ties across the barline, and
rhythm syllables printed under the notes; `roundParams` keeps only the figures
that fit the meter drawn. Catch the tune's menu ends with **Custom**
(`TuneSetup.svelte`): the notes (low so to high mi), the moves allowed
(repeat, step, skip, 4th, 5th, 6th, octave: tune-path's `allowedMoves`,
optional, so Octavo's levels are unchanged), the notes a tune may start on,
ending on do or anywhere, and the length; a set no tune fits says so
(`canMakeTune`). Both are remembered in the browser (`sr-rhythm-game-own`,
`sr-catch-custom`).

## Class features (2 November 2026)

- **Names**: a student may type their own before the game starts
  (`sr-game-name`); `nameProblem` (game-names.ts) checks it on the device and
  again on the server (answer.ts), undoing disguises (digits, symbols,
  spacing, accents), with distinctive roots found anywhere and short words
  only as whole words, so Bob, Nigel, Cassidy, Essex and Scunthorpe pass
  (tests list both kinds). The teacher removes any name with its × on the big
  screen: it joins the game's `blocked`, the device goes back to its made-up
  name, and the board and teams show that name (`blockName`, from the
  answers' `fallback`). A space typed in the name box is not a tap.
- **Rounds**: 3, 5, 10, 20 or Endless (`total`); after the last round,
  Final results on the big screen (Play again) and on each phone.
- **Teams**: Off, 2, 3 or 4 (Mint, Peach, Butter, Sky). Everyone in the room
  when the first round starts is dealt at random; latecomers join the
  smallest team (`dealTeams`, `joinTeam`). Teams rank by points per player
  (`teamStandings`), so a bigger team does not win by size.
- **What a student missed** (the rhythm): after a round the big screen sends
  the rhythm back with how it was scored (`rhythm.review`: the ABC, the
  strictness, the room's lag), and each phone scores its own taps by the
  same rules and draws the rhythm with them marked (`rhythm-marks.ts`: green
  in time, yellow early or late, red missed). Nothing more is uploaded than
  the taps already were, so it costs nothing. The big screen marks each note
  by the share of the class who had it.
- **The tune board on a phone**: one-letter names in a narrow column and
  every cell 44 px tall (it was a wide shape, 25 px tall with seven notes).
- **A phone stuck on the last tune**: after failed polls a device backed off
  up to 30 s; in a game it now waits at most 5 s while in view
  (`pollDelayMs` `game`). Five tunes in a row followed fine on a steady
  connection, so the backoff (and the stale dev cache of that day) is the
  likely cause rather than the game's own logic.
- `VITE_CACHE_DIR` gives a second dev server its own Vite cache
  (astro.config.mjs): sharing node_modules/.vite left the first serving
  "504 Outdated Optimize Dep" and blank pages.

## Not yet

- The big screen does not play the rhythm itself (it would give it away);
  an option to hear it after the round would help.
- A round's lag and each beat's share right are not shown on the big screen.
- Sound on the students' devices (they are silent, as in Live practice).
