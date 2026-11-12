# Practice page UI: failures, first visit, home, load times, SEO, full screen, copyright, layout, cursor

Moved out of CLAUDE.md on 27 October 2026, word for word. Read it before touching the practice pages' layout, settings row, cursor, full screen, home page, tour or SEO.

## When an exercise cannot be written

The banner names the setting in the way and helps change it (9 October
2026; `src/lib/failure-fix.ts`, tests `failure-fix.test.ts`;
`FailureBanner.svelte`). Choral's words still come from failure-hint.ts;
Unison's from the generator, the bare range messages put in plain words.
Each failure points at a pill (ringed, `set-pill-warn`, while it stands),
**Show me the setting** opens it and flashes the control inside
(`data-fix="<target>"`, `show-setting.ts`), and where one change usually
clears it a button makes it and tries again: widen the Unison range until
it holds do, mi or so (`widenedRange`; a key-following span grows a step
each way), give Choral's tightest part two steps at the top, 8 bars, let
eighths leap, one larger skip, ties across the barline. A message that is
not about a setting (sound that did not load) keeps the plain box.

## First visit (welcome, Quick start, the tour)

Since 9 October 2026 (Blaine: the app was overwhelming for new users;
`src/lib/tour.ts`, tests `tour.test.ts`). A practice page opened with
nothing in the address (`window.__srArrival`, kept by Layout before a page
rewrites its address) by someone not yet greeted shows a welcome card
(TourLayer.svelte, mounted in Layout; never for students): **Quick start**
opens step 1 of abcStepByStep and writes it at once
(`/sightreading?step=sbs-01-rhythm&start=1`), **Show me around** runs the
walkthrough, Skip closes it. Remembered per browser (`abc-welcome-v1`,
`abc-tour-<page>-v1`), no database field. The walkthrough is a bubble at a
time over a dimmed page, each pointing at a control marked
`data-tour="<id>"` (the steps in `TOUR_STEPS`; a control missing or hidden,
such as Tools on a phone, is left out). It comes back from the "?" at the
end of each settings row, the navbar (desktop icon, Take the tour on a
phone), `?tour=1`, or `/how-to-use`. Keep `data-tour` on the controls when
moving them.

Defaults on a first visit (checked in a fresh browser on production, 9
November 2026): treble, F major, do mi so, 8 bars, Reading as Any, no
solfège, no rhythm syllables, counting voice off (`DEFAULT_VOICE`). Quick
start's step 1 is a rhythm drill and shows ta and ti-ti by design. Blaine:
annotations stay off by default; the tour's Display step says they can be
added, and that a teacher can set up their own syllables on the account.
Anything else someone sees (a tenor's treble-8, say) is their own browser's
saved settings (`sightReadingOptions`, the reader) or a link's.

abcStepByStep is easier to find: the preset menu opens on it when no
built-in preset is active (`sectionToOpen`), a mint strip above the
settings shows the step, what it adds, All steps (`sr-open-presets`, which
opens the menu at a section) and Next step (`nextStepAfter`); the landing
page, the signed-in home (no exercise yet) and /how-to-use link step 1.

## Home page (signed in)

`/` is two pages (8 October 2026): the landing page for anyone signed out
and every crawler (`src/components/Landing.astro`, unchanged), and for
someone signed in their home (`HomeDashboard.svelte`, sent `private,
no-store`): Continue (the last exercise), Unison and Choral, Recent
exercises, My courses (the subscribed sets and instrument courses, with
Choose courses; the navbar's Tracks left for here and the footer's Courses), a student's
assignments, an educator's classes, and Account and settings.
Laid out symmetrically for focus (16 October 2026, Blaine: "so messy",
then "unsymmetrical"): one full-width card to pick up the last exercise
(step 1 for a newcomer) with Unison and Choral as pills inside it; a row of
equal tiles (My music, My courses, Classes or abcTuner, Can you sing it?; a
student's are My library, abcTuner and the challenge); the founders offer
as a modal the first time a teacher who may join comes home ("Not now"
remembered in this browser, `abc-founders-offer-v1`), then a solid peach strip; then the earlier exercises (four, then Show all). The
navbar's practice pages and abcTuner are one Practice menu on desktop
(Navbar.svelte), beside My music or My library; the phone menu lists all.

Recent exercises are kept on the account (`RecentExercise`, the last
`MAX_RECENT` = 20; `/api/recent`; rules in `src/lib/recent-exercises.ts`,
tests `recent-exercises.test.ts`). Both practice pages remember each
exercise once its link is packed (`rememberExercise`, signed in only): the
preset's name or the kind of exercise, a line of what it is, and the same
link Share gives, so it reopens exactly. The same link again moves to the
top. A stored link must be a path to the page it names (`checkRecent`), since
the home page shows it as a link.

The home is drawn on the server with its data (index.astro reads what
/api/recent, /api/tracks, /api/usage and /api/assignments would, and passes
it in; `client:load`, not `client:only`): it used to fetch each list after
loading and jump as each arrived. Keep it that way; a new section brings its
data from index.astro too.

## Load times

Measured with Lighthouse at phone settings (8 October 2026, production):
landing, pricing and the guides 86-89, Unison 69, Choral 73, SEO 100 on all.
What was fixed then, and should stay fixed:
- **Fonts are ours** (`public/fonts`, `@font-face` in globals.css, the two
  Latin files preloaded in Layout, cached a year by vercel.json, so a new
  font file needs a new name). Google's stylesheet held up every page's first
  paint by about 0.85 s. Only the Analysis tool's IPA vowels still come from
  Google, loaded without blocking.
- **Nothing that appears after load may push the page down.** The landing's
  free-month strip was drawn in the browser (CLS 0.108, over Google's 0.1
  line); it now comes with the page (`initial` on FreeMonthPromo).
- **Tone.js loads on the first sound** (AbcjsSingle `loadTone`): importing it
  builds an AudioContext at once, and it is 81 KB compressed. The Unison
  page's script went from 188 to 129 KB.
- **The Tools cards load when the wheel opens** (ToolsWheel `CARDS`).

## SEO

`site` in astro.config.mjs is https://www.abc-sightreading.com, and every page's
canonical link points there (abc.blainecowen.com serves the same pages).
Layout takes `noindex` (accounts, login, join, tools) and `jsonLd`; previews
and local dev are always noindex, and `/robots.txt` turns crawlers away
everywhere but production. The navbar is `client:only`, so the footer in
Layout carries plain links for crawlers. Public pages are listed in
`src/lib/seo.ts` for `/sitemap.xml` - add new ones there. Plan prices shown on
`/pricing` and in structured data come from `src/lib/seo.ts` and
`src/lib/plan.ts`. The Sight Reading Factory comparison quotes their prices
with a date; recheck before editing it. `public/og.png` is the share image.

## Full screen

Both practice pages have a full-screen button in the playback bar (beside
Loop; F toggles it, Esc leaves): the score alone, as wide as the screen, for
a TV or projector (`src/lib/fullscreen.ts`). It asks for the browser's full
screen and puts `sr-focus` on <html>; globals.css then hides the site
header and footer, `.focus-hide` (the page title and intro, the Grade
button) and every child of the component's `.focus-main` except
`.focus-score` (the score) and `.focus-keep` (the room left below the score
while playing), and draws the playback bar larger (`zoom: 1.2`) as one
centred row: the instrument (voices) and metronome volumes with their mute
buttons (the pages mark them `.fs-keep`; the bar's other secondary controls
wait), the transport, an Annotations drop-up, the tempo and Exit. The page
still scrolls, so the score follows the music as it always does; widened,
abcjs (`responsive: "resize"`) draws it bigger. The settings are hidden, so
the annotations are switched on and off from that drop-up
(`annotationChoices`): the solfège systems on Unison (the syllable systems
on rhythm only; one at a time), chord symbols and the solfège systems on
Choral. Where the browser has no
full screen (iPhone Safari) the same view runs inside the window.

## Copyright

Every exercise carries "© <year> abcSightReading · abc-sightreading.com"
(`src/lib/copyright.ts`, tests `copyright.test.ts`), as the play-along video
carries the site's address: centred under the drawn score on both practice
pages (a `%%center` line added where the score is drawn, never to the ABC the
grading reads; abcjs draws it at 21 px whatever `%%textfont` says, so
`styleCopyright` sizes it after drawing, divided by the page's own scale, to
about 11 px), so in print and a saved PDF too; in the MusicXML's `<rights>`;
as the MIDI file's copyright notice (meta event FF 02 opening track 1,
`midiWithCopyright`); and in the ABC file (`abcFileFor`).

## Floating elements

`bun run scripts/check-overlaps.ts` reports every pair of fixed or sticky
elements that overlap, on each page at desktop, tablet and phone sizes and
in the states that add floating things (a clap run with the tap pad, Grade's
strip, the Tools card), and which is on top. Clean on 6 October 2026 at five sizes (4K, 1440p, desktop, tablet, phone) after
three fixes (the Tools card overlapped its button at 4K): the tap pad sat on the Tools button (it is now a centred key
clear of both corners, bar + 5rem, in rem so it clears Grade's strip at 4K too), and on a tablet Grade's strip covered the Feedback
button (it is narrower by the corner buttons there).

## Big screens

On a wide screen (1600 px and up) the practice pages stay one column but
take most of the width (`.focus-main.wide`: up to 84vw, the site
container's cap lifted); two columns, settings beside the music, were tried
and Blaine did not like them. From 2200 px the root font size steps up (18,
20, 22 px at 2200, 2800, 3400) so the interface is not tiny on a 4K
monitor; Tailwind sizes in rem, its breakpoints in px. Things placed in px
beside things sized in rem drifted into each other at 4K (the Feedback
button, the Tools card): place them by the other's rem size.

## The settings row (both practice pages)

The settings are one row of pills above the score, each showing what is
chosen; a pill opens only its own choices in a popover under it (a sheet
from the bottom on a phone), with Done and New exercise at its foot
(`settingPop`). It replaced the Setup / Rhythm / Notes / Range tabs (7
October 2026), which showed every control at once. Unison: a Pitched /
Rhythm only switch first, then key, meter, length, notes (degrees, skips,
range), rhythms, clef (the chord progression is no longer an option);
rhythm only hides key, notes and clef. Choral: voicing, key, meter, length, rhythms, chords (the
old Harmony tab), More (voice texture, voice ranges). The controls inside
are the ones the tabs held, unchanged. New exercise ends the row and
carries the month's count (`setbar-count`); the playback bar's Generate
steps aside while most of the row is on screen (`hideGenerate`), and the
usage banner beside Preset shows only at 3 or fewer left
(GenerationLimit `LOW_LEFT`). With a preset active, a pill changed since it
was chosen has a dot (`pillChanged`). Focus moves into a popover as it
opens and back to its pill on Done or Esc; while one is open, Tools and
Feedback step aside (`html.sr-pop-open`). The boxes ease in and out (down
from their pill, up as a sheet on a phone; none with reduced motion), and on
touch screens every control in the playback bar is at least 44 px tall.
Choral's history is Previous, and Latest while looking back.

The score has its own toolbar above it: Display (the old Score options:
sound, transpose, annotations, cursor; Unison's Dynamics there is Off or On,
On is every mark, a preset with its own set, as NYSSMA's, shows On and
keeps it), and on Unison Drill, Video and Listen and grade (`toolPop`). Only
Listen and grade stays in full screen.

On Choral, with a solfège system on, Display > Annotations has an **Under**
row: each part can be switched off, so the basses read syllables while the
rest read notes (`lyricsOff`, written by `assembleAbcString`; tests
`lyrics-off.test.ts`). Empty is every part, byte for byte the old score; the
last part on keeps its syllables (none at all is the system's own button).
Full-length pieces honour it in every section. It rides in links
(`solfegeOff=`), presets and the "edited" signature, and is in the full-screen
Annotations menu.

## The preset row and the Teach pill (9 November 2026)

Blaine: "That top bar is getting really cluttered", then "lets do the teach
pill". The preset row (PresetDropdown) is three pills: Preset (mint),
Reading as (sky, Unison only), Class (butter, `.class-pill`, a select sized
to the class chosen with `field-sizing: content`). Save current and "Saved
to your account" left the row: saving is the Preset menu's footer, **Save
these settings** (with where they are kept); the row still offers Save, Save
as new, Keep as my version and Revert while a preset is edited.

The score toolbar is Display, Drill (Unison), **Teach** and Listen and
grade. `TeachMenu.svelte` holds Assign to a class (Educator, `usage` tier;
both pages, `assignThis`), Go live (LiveTeacher with `item`, which binds
`status` and `student` up) and Make a play-along video (Unison). The menu
is always in the page and only hidden, so Live keeps its session while it
is shut; while Live is on, the pill is mint and reads "Live CODE · devices".
A student account gets the Video button alone, as before. On a phone the
menu is a sheet above the playback bar. The Ensemble page keeps its own
Live button. A TypeScript cast inside Svelte 4 markup compiles nowhere but
passes `astro check`: keep casts in the script.

## Disappearing bars (9 November 2026)

Blaine: "an option to the display for disappearing measures. This will
erase the measure we get to so you are forced to read it faster". Display >
Read ahead > **Disappearing bars** on Unison and Choral, kept in this
browser (`sr-vanish-bars`). `src/lib/vanishing-bars.ts` (tests
`vanishing-bars.test.ts`): each playing event's bar comes from abcjs's
`abcjs-mm<n>` class, and that bar's music (notes with their ledger lines,
rests, beams, lyrics, chord symbols) takes `.sr-gone` (opacity 0,
globals.css); the clef, key, time signature, bar lines and bar numbers stay.
A bar earlier than the last (a loop, a repeat, a jump back) brings them all
back first; Stop, the end, turning it off, and a Grade run ending bring
everything back. Choral wipes only while `isPlaying`: Stop's seek to 0 fires
the first bar's event and wiped bar 1 again. Checked in headless Chrome at
120 bpm on both pages: bars wiped behind the cursor, none after Stop.

**In chunks** (same day, Blaine: not always erasing 2 beats ahead, but "2
beat chunks that will disappear when the cursor gets there"): under the
toggle, Disappears a bar at a time (the above) or 1, 2, 3 or 4 beats at a
time (`sr-vanish-ahead`). `chunksOf` cuts each bar into chunks of that many
of the meter's beats from its first note (abcjs's `noteTimings`, `qpm`);
`makeChunkVanisher` runs on each note's event, and when a note starts a new
chunk the whole chunk goes, with everything drawn in its bar up to the
chunk's last note (`hideThrough`: lyrics, beams). A note earlier than the
last brings all back. Checked at 60 bpm, 2-beat chunks, on both pages.

## The Display and Drill menus (9 November 2026)

Blaine: "lets lean up the display and drill ui... It always feels clunk and
weird to have to scroll inside that menu". Both are rows now (`.pop-rows`,
`.pop-row`: the setting's name in a 8.5rem column, its choices beside it,
smaller tokens; one column on a phone), the long explanations moved into
each row's hover title, and a short hint inline only where a number needs
one (transpose's key, the speed ramp's tempos). Display: Sound, Transpose,
Under the notes (Choral: On the score, then Syllables under and Sing minor
when they apply), Dynamics (Unison), Cursor, and Disappearing as one row
(Off, Bar, 1 to 4 beats). Drill: Start drill, Exercises, Times each, Speed
up, Reading time, and **On the repeats** folded shut (`<details>`,
`drillRepeatsOpen`), its six rows inside. Measured on a 1440 x 900 laptop:
Display 590 to 389 px tall, Drill 630 to 352, both clear of the playback
bar; on a phone the Display sheet fits without scrolling.

## The playing cursor

One look on every score page (16 October 2026, Blaine: My music's cursor is
the better one, match the others to it): a soft blue bar the height of the
whole system, just left of the notes and behind the music, and the notes
being played turned blue, a held part staying lit while another moves.
`src/lib/score-cursor.ts` (`makeCursor`, `placeCursor`, `systemSpan`,
`NoteLight`; style `.abcjs-cursor` and `.sr-now` in globals.css) for Unison,
Choral, Piano and Ensemble, placed from abcjs's callbacks; My music draws the
same from its model (pieces/score-dom.ts `cursorLine`). The Display cursor
modes (smooth, beat by beat, note by note, off) still say where the bar goes.

**Where Play starts** (23 October 2026, Blaine's item 9: pausing or clicking
a note should start there, and show where even with the cursor off;
`src/lib/start-point.ts`, tests `start-point.test.ts`): on Unison and Choral
a tapped note is where Play starts, marked by My music's orange line (it said "Start" under it until 5 November 2026, when Blaine called the word clutter; `startLine`, the line drawing now in `src/lib/score-line.ts`
so a practice page does not load My music's ABC writer). Play counts in to it,
on the audio clock beside the timeline's own count-in (which is the first bar
of the audio and cannot lead into the middle): the clicks when the click is on,
"1, 2, Ready, Go", then the music from the note with the cursor and click taken
up there. The count-in leads to the downbeat of the note's bar, and the bar's
notes before it are silent, as rests, the click going on through them
(`barStartOf`; 27 October 2026, Blaine: start from the measure's beat 1 with
rests before the note), so a note off the beat comes in on its own beat
(`startLeadIn` on both pages; Choral also sets the controller's own
percent, or its timer restarted from the top). A tap while playing jumps there
with no count-in; Pause leaves a "Paused" line; Stop goes back to the tapped
note; Back to start and a new exercise forget it; a redraw keeps it (kept by
its `startChar` in the ABC). Loops and drills still go from the top, and a tap
does nothing during a Grade run. `bun run scripts/check-start-point.ts`
(`PAGE=unison|choral`): the count-in, the audio started at the note's offset a
count-in after Play, nothing lit before it, Paused, Stop, a jump, Back to
start, and a bar's second note coming in later than its first by the time
between them.

A tapped note on Unison sounds at once (`playNote`, `Tone.immediate()`): at
Tone's default time, 0.1 s ahead, its one-voice synth went on sounding the
note tapped before for that long ("sometimes it plays the previous note",
27 October 2026). abcjs picks the right note; a tap reaches it twice (touch,
then the browser's mouse click), so the same note within `SAME_TAP_MS` sounds
once.

## Score layout

The playback bar's **Layout** menu (both pages, kept in full screen;
`src/lib/score-view.ts`, tests `score-view.test.ts`) sets the score's size
(0.5x to 5x; Unison's 2x and Choral's 1x are the old defaults - bigger is
a narrower staff that `responsive: "resize"` scales up), the bars per line
(Auto, or 1, 2, 3, 4, 6: `measuresPerLine`'s `want`, still capped at what
abcjs fitted) and the space between lines (Tight, Normal, Wide: `%%staffsep`
written into the tune as it is drawn). Remembered per page in this browser.
It replaced Unison's Size buttons.
Measure numbers (on by default; Annotations on both pages, both Unison
modes, and the full-screen drop-up) are `scoreView.measureNumbers`, saved
with the layout: `withMeasureNumbers` writes `%%barnumbers 1` as the score
is drawn (every bar but the first), never into the ABC exported or graded.

Bars per line come from `src/lib/score-layout.ts` (tests `score-layout.test.ts`),
used by both practice pages: up to 4 a line, 3 when the score is dense (lyrics,
or sixteenths), 2 on a phone, and shared out so lines are even (4 bars dense is
2 + 2, never 3 + 1). abcjs takes the number as a preference only and breaks
lines itself when the notes need room, so after drawing each page reads the
split (`drawnLines`) and, if it came out ragged, draws once more capped at the
most bars abcjs fitted on a line. On Unison it also draws with a bar fewer a line, as far
as one, while two words under the notes are closer than about a space
(`wordsCrowded`, 5 November 2026, Blaine: tika syllables "aren't aligning"
with sixteenths). abcjs gives an annotation below the staff no width when it
spaces notes, so a beat of sixteenths ran "ka ti ka" into "kati ka". An
invisible spacer (`y`) between the notes was tried and dropped: bare `y` made a
beat of sixteenths wider than three quarters, and `y5` broke the beam. A dense
sixteenth exercise in "ti ka" now draws one bar a line on a laptop.

**Following the music on Choral** (1 November 2026, Blaine: turn on beat 3,
not 4, and the next system should always be visible): half a bar before a
line ends (beat 3 in 4/4, at least a beat; `lineTurnMs`, abcjs's
`lineEndAnticipation`, set at the tempo the synth was built at) the next
line is brought fully on screen (`revealNextLine`); when a line starts it is
placed by `scrollToPlayingLine` (scroll-to-system.ts, tests
`scroll-to-system.test.ts`): the usual margin above it, shrinking to 12 px
(the navbar hides on a scroll down) until the line after it clears the
playback bar. Where even that will not fit, the line being sung stays whole.
Measured at 1280 wide, Choral's default size, 16 bars of SATB: at 900 tall
both lines whole at every line; at 720 tall a system is about 345 px, two
do not fit, and the next line shows about three quarters (a quarter before)
until the turn at beat 3. A smaller default size (0.9 looked fine to Blaine)
would fit both; left at 1x for now.

**Students' practice page froze (9 to 12 November 2026).** TeachMenu.svelte took `student` back from a LiveTeacher in each of its two branches (bind:student); a new LiveTeacher starts at "not a student", so for a student account the branches swapped forever, each swap mounting a new LiveTeacher, and the page's main thread never came free (headless Chrome could not even evaluate `1`). Found with a test class (scripts/load-class.ts) and a CDP pause on the frozen page. TeachMenu now asks `signedInUser()` itself and LiveTeacher is only in the teacher's branch. Never let a child's bound value choose which branch holds that child.
