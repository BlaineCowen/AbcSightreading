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
`games-tune-path.test.ts`), pages `src/pages/games/`, components
`src/components/games/`. End to end: `APP=http://localhost:4472 bun run
scripts/check-games.ts` (`GAME=rhythm|tune|solo|both`, `SHOTS=`) on a dev
server on the local database, as `check-live.ts` (notes/live-practice.md);
clean 2 November 2026.

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

Octavo Academy's game (its `CatchTheTune.svelte`; the rules `tune-path.ts`
copied as they are, with Octavo's tests): Pip gives the key (do mi so mi do,
so below, do, on the piano) and plays a tune of five to eight notes; find
each note on a board of a column a note and a row a syllable (a note the
level leaves out is a thin empty row, so a move over it reads as a skip),
the first given. Seven levels: steps on do re mi, + so, + la, below do, high
do, + fa, leaps. Solo: Each note (right or not at each tap; a second miss
says which way the tune went) or All at once (Check, fix, Show the tune);
hints dim the notes the last one cannot reach. Do is middle C. The tune plays
at 2 seconds a note by default, set with the Speed slider (0.5 to 3 s, right
is faster; `sr-catch-gap`), on this device and on the big screen alike
(Blaine, 2 November 2026: 0.75 s was too quick).

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

## Your own setups (2 November 2026)

Blaine: ta and ti-ti is too limiting; which steps and skips, which note to
start on. The rhythm game's menu ends with **Your own** (`RhythmSetup.svelte`):
meters (one kind at a time, as on the Unison page), the figures with the
Unison page's picker groups and note pictures, ties across the barline, and
rhythm syllables printed under the notes; `roundParams` keeps only the figures
that fit the meter drawn. Catch the tune's menu ends with **Your own**
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
