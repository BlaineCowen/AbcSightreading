# Play-along videos

Moved out of CLAUDE.md on 27 October 2026, word for word. Read it before touching the Video button, backing tracks, guitar renders or the play-along export.

### Play-along videos

Pro, rhythm only: the Video button on the score's toolbar on the Unison page
(`PlayAlongVideo.svelte`, `src/lib/play-along/`; anyone else is sent to
/pricing). A backing loop plays while two bars show, one above the other; a
ball bounces from note to note through the top bar, then the bottom, and the
top turns over to the next bar the moment the ball leaves it, so the reader can
always look a bar ahead. How it looks is `scene.ts` (Recess pastels, a colour
a bar, beat dots, a popping count-in, a finish card with confetti). About 1:30: `barsForLength` picks whole loop repeats and an
even number of bars (36 at 4/4, 100). `frameAt` says what is on screen at any
audio time and `ballAt` where the ball is (tests `play-along-timeline.test.ts`);
both are driven by the AudioContext clock, not abcjs's timer, so it stays on the loop for 90 seconds.

The exercise takes its tempo and meter from the loop (never stretched: that
would change its pitch), is written with ties across the barline off (each bar
is shown alone) and counts as one exercise. Long rhythms generate cleanly:
`bun run scripts/check-play-along-length.ts` (24-72 bars, every meter).
The bars are one abcjs render at a bar a line, each line cut out as its own SVG
image (`bar-images.ts`), drawn on one 1920x1080 canvas, so full screen and the
exported video are the same picture. Each picture holds only its own line,
and is framed from the music with a row always kept below it for solfège or
syllables, so turning labels on or off in the video never rescales the
music. Dynamics are not in the pictures at all (`extractDynamics`, tests
`play-along-dynamics.test.ts`): abcjs put them under the staff, or over it
once there were words under it, and every bar's frame grew to hold them, so
the music was drawn small. The scene draws each one: on a bar's first note
just before the staff, on a later note under it. Export records that canvas and the
mix with MediaRecorder in real time - MP4 where the browser can, else WebM - and
cancels itself if the tab is hidden, since a hidden tab gets no frames.

Tracks, tempo and syllables, all without a new exercise where possible: the
video writes one exercise per meter, as long as the longest track in it
(`maxBarsIn`), and each track uses its first `barsFor` bars, so swapping
between tracks in a meter is instant and free; only a track in another meter
(marked "new exercise" in the picker) writes and counts a new one. The tempo
goes from half speed to 150% in 5% steps (`tempoChoices`), shown as BPM and
percent in a fixed-width button so "Adjusting…" never moves the controls. The
backing is warped offline with the pitch kept (`stretch.ts`, soundtouchjs,
LGPL-2.1; types in `src/types/soundtouchjs.d.ts`), lined up with the grid by
cross-correlating envelopes. Slowing down far needed two fixes: SoundTouch's
automatic ~120 ms slices doubled every drum hit at half speed, so below 1x the
slices are fixed at 25 ms; and the attacks are restored - each onset of the
original pasted back at exactly its new time with a 25 ms lead-in (which
also removes the early copies speeding up leaves). Measured on clicks: within
2.2 ms of the beat from 0.5x to 1.5x, no echoes, no drift over 90 s (tests
`play-along-stretch.test.ts`); on the real tracks 223 of 225 hits within
5 ms. A full song at half speed takes up to 3 s to warp, on the main thread,
under "Adjusting tempo…" (a Web Worker would free the page if that matters).
The bars stay the same, so half speed makes a 1:30 video three minutes.
A pitched guide sound (piano, marimba, organ, voice) plays the rhythm on the
song's tonic, not the rhythm staff's placeholder B (`tonic` on each song in
backing-tracks.ts, `guideTranspose`; drum loops, with no key, take C): soul
B flat minor, trap A minor, cumbia F minor, reggaeton G, from the packs' file
names checked against each mix's pitch-class profile (reggaeton's pluck sits
on B and F sharp, which reads as B minor, but the mix has C and not C sharp). The
syllables picker (Off, Kodaly, Counting, Mine) starts at the page's choice and
redraws from the exercise's data through the page's `playAlongAbc`, never a
new exercise.

Pitched mode: the same Video button on the Unison page with pitches opens the
video in `mode="pitched"`. The exercise is the page's (key, notes, range,
skips), written about 1:30 long at the page's tempo (in fours; pitched
exercises generate at 24-64 bars in every meter, `check-play-along-length.ts`).
The backing is a drum style in its meter - the loop nearest the page's tempo,
warped to the tempo shown, which stays put when the style changes. The melody
plays on any of the page's instruments (off by default, so the class sings
it), and a bass line (`src/lib/play-along/bass.ts`, tests
`play-along-bass.test.ts`) holds one root a bar on bass guitar (MIDI 33,
E2 to D3; ABC's C is middle C, and it sat an octave higher until heard too
high under the guitar): the
generator gives every note its own chord, changing about every note and a
half, so each bar takes the one chord - the generator's own, slightly
preferred, or a diatonic triad - that best fits the bar's melody, weighted by
length and beat (about 73% of the sung time on its tones); the last bar is
the tonic, the one before it V when the melody allows, and a leading-tone
chord takes V's root (minor's own VII stays). The labels are solfège (Off,
Movable do, Fixed do, Note names), written through the page's `playAlongAbc`.

The pitched video also strums an acoustic guitar under the exercise
(`src/lib/play-along/guitar.ts`, tests `play-along-guitar.test.ts`): Native
Instruments' Session Guitarist (Strummed Acoustic, in Kontakt 8), rendered
by REAPER from the command line. `scripts/guitar/template.RPP` is Blaine's
saved project: Kontakt with eight patterns in its slots (C1 Passenger A, C#1
Passenger C, D1 Campfire A, D#1 Campfire B, E1 3/4 Pattern A, F1 3/4
Pattern B, F#1 Irish Folk C, G1 Irish Folk A; never a muted "Mtd" one).
Kontakt's state is encrypted, so the patterns can only be changed in its
window: load the template in REAPER, change a slot, save (Cmd-S). `rpp.ts`
writes projects around that state (REAPER's format is text) and
`build.ts` renders every chord the progressions use in all twelve keys
(36; the page has nine, but its playback transpose reaches the rest) in each
slot at four tempos (75, 90, 110, 130; triplets 65, 80, 95, 115), one steady bar a chord (the second of a two-bar hold),
plus each style's ending (A#1) on the twenty-four home chords, major and minor, into
`public/guitar/` (61 MB; a video loads two pattern files and an ending,
3-5 MB) and `guitar-manifest.json`: `bun run scripts/guitar/build.ts`,
about 10 minutes. What the instrument wants, found by probing and its manual:
chords from E2 (MIDI 52) up, root lowest, notes arriving low to high (G B D
sent out of order strummed once and stopped); G#1-C2 are endings and C#2-D#2
pickups, so a chord must stay above them; the triplet patterns are 4/4 bars
of triplets (one is a 12/8 bar; 6/8 takes half) and are silent below 65.
The video plays each bar's chord from its clip, a split bar half of each,
the A pattern in phrases 1 and 3 and B/C in 2 and 4, the ending in the last
bar, warped from the nearest rendered tempo (never more than about 11%,
with longer slices than the drums': `stretchBuffer`'s `tonal`, since 25 ms
slices turned a held chord into a buzz at 60 from 70). Slow, the guitar
plays in double time (`guitarDouble`: below 67, triplets 59): the pattern
at twice the tempo, two of its bars to each bar of music, since a strum a
bar at 60 has too few strums to carry it. At each barline the old chord
rings on 30 ms and fades under the new strum, which lands 10-25 ms late in
the render (the strum's spread); and a stretched clip is padded with
silence so SoundTouch gives back its end (it kept the last few hundred ms,
a gap before every barline). Without a progression (a line
that cannot start and end on do, like mi so la, is written by the older walk)
the guitar plays the bass's chord a bar (`barChords`); it used to read only
a progression and was silent there. Those chords come with inversions
("6-6", "1-64"), whose `root` in chords.ts is the bass note, so
`guitarChord` takes the root from `triadNotes[0]`; vii (diminished, never
rendered) is strummed as V7. The count-in strums the home
chord so the key is set before the first note; Guitar level and strum (Pop
strum, Campfire; 4/4 and 2/4 only) in the Sound panel. The page's Playback
transpose moves the whole band: the melody and bass through abcjs's
`midiTranspose` (as the page's own Play), the guitar by playing each chord
in the transposed key (`guitarPart`'s `transpose`, `transposeKey`).

Sound (the overlay's Sound panel): levels for the loop, a guide (the rhythm
played over the loop, on any rhythm sound) and a click (any metronome sound),
live while it plays and into the export; remembered in this browser. abcjs
cannot render the guide while audio is suspended (`prime()` never settles), so
it is rendered once a click lets sound start - at the latest on Play.

Tracks are listed in `backing-tracks.ts` (bpm, meter, bars, where beat 1 falls,
an optional intro) with files in `public/backing/`. A loop repeats for as long
as the exercise; a `fullLength` track is a whole arrangement played once, and
the exercise is written to exactly its bars. The real tracks are arranged from
ONE Splice pack each, so the parts share a session and a key, by
`scripts/backing/<track>.ts` on the shared `engine.ts` (`bun run
scripts/backing/soul-4-4-80.ts`): count-in, an intro, parts entering section by
section, an ending. The samples stay in `~/Splice`; only the finished mix is
committed, which is what Splice's licence allows. Blaine's ear so far: keep
risers and impacts sparing, no vocals over the exercise, no congas in the
reggaeton; the indie pack was too plain (its script is kept, tabled); for
trap, real rage 808 loops transposed to the song's key, never a programmed 808
line. The cumbia is one file listed twice, 36 bars of 4/4 and 72 of 2/4.
Every drum loop ends like a band ending (`ending` on the track,
`<id>-end.mp3`, also built by drums.ts): an empty bar, the groove into its
fill, then crash, kick and snare on the last bar's downbeat, ringing 2.5 s
(`ENDING_TAIL`). audio.ts hands the loop over to it two bars from the end
(a 30 ms crossfade), so the fill leads into the last bar and the final note
lands on the crash; it is warped with the loop, and the bass fades with it.
Full-length songs keep their own endings. The video shows the site's address
(abcsightreading.com) as its wordmark, so a shared video says where it came
from, and the Ball button hides the bouncing ball and its glow (remembered
with the sound settings).
Every meter also has simple 8-bar drum loops from one kit (`DRUM_LOOPS` in
backing-tracks.ts, built by `scripts/backing/drums.ts` with the engine's
`loop: true` - no count-in, cymbal tails wrapped to the start so the loop has
no seam). MP3s live in `public/backing/` (served by the CDN; about 16 MB in
all) - Vercel Blob is not worth it at this size. Chrome decodes them
sample-exact (a loop at 90 is 21.3333 s, first hit at 0 ms).

**Singalong tracks** (in progress, not in the app yet: no MP3 committed, none
in `backing-tracks.ts`): backings with harmony, for the pitched play-along,
each one progression a line can be written over, rendered per key with
`SHIFT=<semitones>` (C is 0) and `OUT=`. Barefoot (4/4, 90; I V vi IV, two
bars a chord): Crossover Country's strum and bass over Indie Rocker's drums,
matched across packs by splice-graph; the engine shifts a looped part's key
(`shiftChannels`, SoundTouch with its delay taken out). Matinee (soul, A
minor, 4/4, 86): one Sampled Soul song's electric piano and bass, its drums
played by hand from the pack's one-shots. Porch (twelve-bar blues shuffle,
4/4, 88; I6, IV6, V7): piano and bass played note by note from the FluidR3
soundfont (`scripts/backing/soundfont.ts`, cached in ~/.cache), so every key
is exact. Mastered to -15 LUFS (the engine's `loudness`). A lo-fi track
(Daydream) was tried and dropped: Blaine, "lofi isn't really the best to sing
along to"; he wants simple drums and a keyboard part, not dominant pads.
