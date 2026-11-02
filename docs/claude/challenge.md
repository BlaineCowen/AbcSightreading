# Can you sing it? (/challenge)

Moved out of CLAUDE.md on 27 October 2026, word for word. Read it before touching /challenge.

## Can you sing it? (/challenge)

The shareable sing-and-get-graded clip (14 October 2026; the vault's
"Instagram filter game" idea). Instagram no longer takes outside filters
(Meta closed Spark AR in January 2025), so it is our own page that works
like one: **free, no account, no exercise count**, built phone first. Eight
quarter notes in C at three levels (`src/lib/challenge/exercise.ts`): Warm-up
(steps do to so, climbs to fa or so, home to do, one repeat at most), Skips
(steps and skips in an octave, two skips at least, ends on a do), Wild
("musicality zero": a third to an octave every move, never the note two
before, never home). Higher voice reads treble, lower bass; any octave
counts. Seeded (`?l=wild&v=high&c=<seed>`), so "Challenge a friend" sends the
same eight notes, and the page says so.

The phone listens with the tuner's own detector (`TunerEngine.start(stream)`
now takes a stream it does not own: camera and microphone are one request,
since on iOS a second microphone request can silence the first). Each note is
judged as Grade's Note by note judges, on Easy (`challenge/run.ts`, the same
constants and `noteScore`). The whole picture is one 720 x 1280 canvas
(`challenge/scene.ts`): the selfie camera on top, with nothing drawn over it
from Go on (Blaine: the whole frame free while singing; "Can you sing it?"
shows only before Go), the staff below drawn by hand (no abcjs: eight quarters need only a
staff; the clefs and the 4/4 are abcjs's own outlines, `challenge/glyphs.ts`,
placed where abcjs puts them, since a font clef sat wrong on a phone without
the font), Pip and its ring, trail, ghost and
confetti as on the practice page, no solfège (Blaine: not needed; a wrong note held says "too high" or "too
low"), the level as a small pill on the paper,
the points, and the abcSightReading logo at the foot (`brand-mark.ts`, the
navbar's "abc" outlines; Blaine: the logo, so people search for us). Before Go the notes are hidden (eight bobbing "?",
"Hear do" plays do in the singer's voice), so nobody rehearses them. Go
draws fresh notes (a friend's link keeps theirs the first time) and shuffles
them in (`scene.shuffle`, `SHUFFLE_MS`): they fly about the whole frame in
colour, flicking through pitches, and land one by one, so every video shows
they were drawn on the spot (Blaine: show it is not the same thing every
time). Try again keeps the notes and skips the shuffle; New notes shuffles a
new set. Then the first note plays (on the engine's context, so it is in the
video), then the run; the verdict holds 2.6 s at the end, on the paper under
the notes and the confetti up the sides, so the camera is clear for the
singer's reaction (Blaine). The
canvas and the microphone (with the played notes) are recorded with the
play-along's recorder (MP4 where the browser can); the button is a red
Record, and a REC badge with the time (on the page, not in the video) shows
while it records. Share video hands the file to the share sheet (Instagram,
TikTok, Messages); Save video downloads it. On an iPhone a download goes to
Files, never Photos, so there the one button is Save to Photos (the share
sheet, where Save Video is) and there is no download (`IOS=1` in the check). Nothing is uploaded. While running it takes the whole screen
(`.staged`), the canvas fitted at 9:16, 48 px buttons in a bar clear of the
home indicator, and the screen kept awake.

`bun run scripts/check-challenge.ts` (dev server; `LEVEL=`, `VOICE=`,
`SEED=`, `THEME=`, `SHOTS=<dir>`): an iPhone-sized touch viewport, a fake
camera and a synthesized singer, note 3 a step high first (corrected) and
note 5 an octave down (still first try); checks every outcome, the link's
seed, a recorded video, no sideways scroll, Hear do playing do, and New
notes drawing different notes. Clean in every level, both voices, both
themes (14 October 2026). Tests: `challenge.test.ts`. Blaine tried it on his phone
and it looked right; it went to main the same day (14 October 2026).

Advertised on the home page: a butter card under the landing page's hero
(and "Just here for fun?" in the hero), and a card on the signed-in home,
both with Pip (`PipFace.svelte`, bobbing; still with reduced motion).
