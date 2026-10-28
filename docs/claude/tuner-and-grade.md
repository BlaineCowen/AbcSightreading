# abcTuner, the Tools wheel, metronome, Grade (sing and clap grading)

Moved out of CLAUDE.md on 27 October 2026, word for word. Read it before touching the tuner, metronome, Tools, pitch detection, Grade, clap grading or take playback.

## abcTuner

`/tuner` (Pro - `hasPremium()`, checked in `src/pages/tuner.astro`): every
practice tool at full size, a tab each (`AbcTuner.svelte`): tuner, Analysis,
metronome, drone, timer and
the scale challenge. The mic stays on across tabs. The Drone (on `/tuner`; on a practice page it follows the exercise) and Scale challenge tabs set the key with one tap (`KeyPicker.svelte`, the tuner store's `key`), spelled as a choir reads it (`spellKey`: Eb, not D#). In the navbar as abcTuner, and
the practice pages reach it from their tools.

The practice pages carry a Tools button in the bottom-right corner
(on a phone, 640 px and under, it is in the playback bar's More controls
instead, since it sat over the music: PlaybackBar `tools`, the
`sr-tools-toggle` event) (`src/components/tools/ToolsWheel.svelte`): a wheel of six tools - tuner,
metronome, drone, starting pitches, analysis, timer - each opening as a card.
A practice page has one metronome (`src/lib/tools/metronome-link.ts`, tests
`metronome-link.test.ts`): the Tools card, the transport's metronome icon,
volume and Click are the same thing, kept in the tuner store (`clickWithMusic`,
`metronomeVolume`, `metronomeRunning`, and the session-only `exercisePlaying`
/ `musicClick`). Its tempo is the page's tempo, set from either side, and its
meter the exercise's. Ticking on its own, it carries on into Play as the
exercise's click from beat 1 of the count-in (`exercisePlays`), and stops with
the music. The click under an exercise follows its subdivision, accent and
sound (`src/lib/playback-click.ts`): Choral writes them into abcjs's drum
pattern (only when this playback clicks, so a change rebuilds the synth),
Unison schedules each beat's clicks with the metronome's own samples. On
`/tuner` there is no exercise and it keeps its own tempo and meter.
Its five sounds (Quartz, the default, Block, Tick, Sine, Square) are Ludwig
Peter Müller's CC0 recordings, chosen by ear: three files each in
`public/clicks` (accent, beat, and a subdivision pre-pitched up), credited in
`public/clicks/CREDITS.txt`. Only beat 1 is accented. For the Choral drum
track each file has a drum note of its own from MIDI 60 up (`drumNoteFor`,
since abcjs caches samples by note), and the soundfont proxy redirects those
notes to the files. Old sound names in settings and presets map across
(`toClickSound`).
Every click (the metronome, Unison's click, Choral's drum track) reads one bar
model (`src/lib/tuner/click-pattern.ts`, tests `click-pattern.test.ts`; plan in
notes/metronome-plan.md): a level per beat (accent, normal, soft, off; the
beat tiles, tap to cycle) and a subdivision pattern (a grid and the slots that
sound: off-beats, swing, 1 e &..., drawn as notation in the picker). Unset
(`beatLevels`, `subMask` null) it clicks exactly as before. The practice
assistant (`practice-assistant.ts`, the metronome's Practice panel): count-in,
tempo ramp, silent bars, dropped beats (never beat 1), time limit; silent bars
and dropped beats also reach the exercise click (Unison per beat, Choral by a
drum directive written into each bar of the played copy, `withClickByBar`,
since abcjs lays a multi-bar drum pattern down again at every barline).
Custom time signatures (`customMeter` in meters.ts, tests
`metronome-custom-meters.test.ts`; Custom… on the metronome, `CustomMeter.svelte`):
any top number to 32 over 1, 2, 4, 8 or 16, with a grouping in units of the
bottom number ("7/8:3+2+2" is the stored id; plain "11/8" is 2+2+2+2+3).
Multiples of three over 4, 8, 16 are compound (dotted beats), odd tops over 8
or 16 and any grouping are uneven, the rest simple. An uneven meter's groups
are heard by volume, not a third pitch (`groupLevels`: beat 1 accented, each
group's first beat normal, the rest soft), set when the meter is chosen and
put back by the tiles' Reset. Past twelve beats the counting voice counts
each group from 1 (`spokenBeat`). Exercises never see a custom meter
(metronome-link only takes the table's). Presets (`metronome-presets.ts`,
`MetronomePresets.svelte`, not on a practice page's linked card): Swing,
Backbeat, Off-beats and 3+3+2 keep the tempo; Save this keeps everything
(meter, tempo, levels, subdivision, sound, voice, assistant) in this browser
(`metronomePresets` in the tuner store), up to 24.
The counting voice (`voice-count.ts`, tests `voice-count.test.ts`; Off,
Voice + click, Voice only; Counting 1 e & a / 1 trip let / 1 la li, or Kodály
ta, ti-ti, ti ki ti ki, tri o la) is espeak-ng's plain robot (Blaine's pick),
built by `bun run scripts/voice/build.ts` into public/voice/robot/ with each
word's lead-in (loudness to half its peak) in manifest.json; a word starts that
early so its vowel lands on the beat, and the word before is cut as it comes
in. Subdivisions are said only when a slot is 0.15 s or longer. On Unison the
beat's word is said a beat ahead (`sayNextBeat`), since its click is placed as
abcjs reaches each beat; Choral's click is abcjs's drum track and has no voice
yet. The metronome times beat 1 on its first tick, once the context runs: the
page is busy for most of a second loading samples as it starts.
Pages publish their exercise with `setPracticeContext(abc, bpm)`
(`src/lib/tools/context.ts`), which reads do, the meter and each part's first
sounding pitch from the ABC through `scoreFromAbc`. The listening tools open the
mic only while showing; the drone (`src/lib/tools/state.ts`), metronome and
timer keep going with the card closed. Analysis has four views: Pitch (the
trace and its half-minute stats), Spectrum (live, with the outline, numbered
harmonics and F1/F2 as overlays), Harmonics (levels, H1 vs H2, ring,
brightness) and Vowel (a guess among ee, eh, ah, oh, oo on a vowel chart; hidden for now,
with the spectrum's F1/F2 lines, by `SHOW_VOWELS` in ToolAnalysis.svelte).
The maths is `src/lib/tuner/voice-spectrum.ts` (tests `voice-spectrum.test.ts`).
Formants come two ways: below C4 (`LPC_BELOW_HZ`) by LPC on the mic's raw
samples (`TunerEngine.readSamples`), above it by analysis by synthesis over
the harmonics' levels (F1, F2 and F3 searched; a quiet harmonic counts
against a model that would make it audible). On Blaine's own recording of
i e a o u in chest voice at F3, LPC named 67 of 68 frames and analysis by
synthesis flipped between two answers; LPC fails on high voices, where
analysis by synthesis works (his falsetto). The live loop is
`src/lib/tools/voice-analysis.ts`, reading `TunerEngine.readSpectrum`. The singer says low or high voice (the pitch
cannot: a man's [o] above G3 read as a woman's [u]). Vowels are only
trusted below about A4, and rough above E4. It is all from the mic alone; nothing compares
against the written notes yet.
Ported from Blaine's standalone tuner project, which is retired (18 October
2026): abcTuner is the tuner now, so improve detection here; see
`src/lib/tuner/README.md`. Detection pauses while the tab is out of sight
unless a run holds the microphone (`micHeld`; `TunerEngine.setPaused`, the
mic left open). Canvases take the
site's theme colours through `src/lib/tuner/canvas-colors.ts`.

**OmniPitch** (the abcTuner tab, 22 October 2026; Blaine: OmniPitch's own
editor inside abcTuner, under the abc look): `OmniPitchTab.svelte` frames
`public/omnipitch/editor/index.html`, OmniPitch's editor copied from
`~/Projects/polyphonic-pitch-detector` by `bun run scripts/omnipitch/sync.ts`
with the Recess colours and fonts, the site's theme, the in-browser engine
only and a versioned wasm (12 MB, the vocoder build; loaded only when the
tab opens). How to sync, rebuild and bump the wasm: notes/omnipitch.md. A
part-by-part director's view built on the same detector is stashed on the
branch `ensemble-parts-idea`. `/dev/tuner` is abcTuner with no account
(dev server only).

**Grade** (Unison page, pitched, Pro): "Listen and grade" above the score
opens a strip docked above the playback bar (the page leaves room below the
score for it). Its setup opens with it (remembered in the tuner store:
`gradeMode`, `gradeStrictness`, `gradeCursor`, `gradeClick`,
`gradeReference`; by default Pitch & rhythm, Easy, the cursor beat by beat,
and the key - do mi so mi do so do, the first note - before the count-in)
and chooses. The click is set each time it opens from the page's
metronome (`openGrade`): off unless the page clicks with the music,
subdivided when it does; it kept a click of its own, on every beat, until
7 October 2026, so the metronome off still clicked through the run.

- **Note by note** (`gradeMode: "pitch"`; was "Pitch only"): practice, not graded - the results say "Done: all 13 notes sung" (or how many were skipped), every sung note green. Untimed, note by note. A reference (the first note or the
  key: do mi so mi do, so below, do, a note a beat, a beat's rest, then the
  first note), then the cursor waits on each note - no tempo, no click,
  nothing moves on by itself - until it is sung and held on pitch (any
  octave) for 300 ms; it shows green a moment, then the next note. Singing
  in the first 150 ms after a note is shown is the last one dying away, and
  never counts for it. Each note scores by how it was found: right first
  time (the first pitch held 250 ms was the note) 100, corrected 75 (the
  first try is kept and named: "you first sang re"), after hearing it played
  at most 50, the tonic or chord 10 off, skipped 0; intonation past the free
  cents costs up to 25. It used to be a hybrid - waiting on a note, then
  moving on in time and counting pitch sung ahead toward the next note -
  and a singer following the cursor in time had short notes marked missed
  and attempts counted against the wrong notes (Blaine's saved run).
  **Pip, the pitch guide** (14 October 2026; `src/lib/pitch-guide.ts`, on by
  default, Pitch guide On/Off in the setup, `gradeGuide` in the tuner
  store): while a note is waited on, a ball with a face rides the staff at
  the pitch being sung (folded into the note's octave, placed by staff steps
  from the notehead like grade-feedback), on a spring each frame from the
  runner's 50 ms ticks. Peach far off, butter within a semitone, mint in
  tune; a tag says which way (and the cents within a semitone), a dashed
  line points to the note, a trail streams behind, the ring fills with the
  hold, and the runner's credit (`GradeView.outcome`) pops it with confetti
  and "First try!" or "Fixed it!". A different note held 250 ms shows as a
  named ghost notehead beside the written one. `GUIDE_SHOTS=<dir> MODE=pitch
  scripts/check-grade.ts` screenshots it mid-note. Meant to be filmed: the
  viral idea was a sing-and-get-graded clip.
The key's reference (do mi so mi do, so below, do, then the first note) plays
on the grand piano the exercise plays on (`playPiano` in tools/tone.ts, the
/api/soundfont samples, fetched as the run starts and waited on for at most
`PIANO_WAIT_MS`), at 0.8 of the exercise's beat, held 0.3 to 0.6 s (8 October
2026; it was a soft tone at the exercise's own beat). The first note alone
(the other reference) and the help buttons' note and do play on the piano
too; every pitch of the run is fetched as it starts. A new exercise closes
Grade's strip and its marks.

- **Pitch & rhythm** (`gradeMode: "performance"`): a reference, then the
  exercise runs in time on the page's own TimingCallbacks with no synth (the
  melody never sounds): its count-in, the chosen cursor (off, smooth, beat,
  note) and click (off, beats, or subdivided: twos, threes in compound; the
  count-in always clicks). Nothing waits; at the end the pitch history over
  the run is graded (`gradePerformance`): each note's pitch (the median over
  its middle, right if most of it is within tolerance in any octave; 100 less
  intonation, or 0) and rhythm (the sung onset - from silence, a new pitch or
  a fresh attack - nearest the written one: full credit within the window,
  down to 0 at three times it; a pitch carried on at the right time counts;
  cut short below 60% of its length costs 25; a rest sung through counts as a
  0). Pitch %, rhythm %, overall their mean. Frames are moved back by
  `DETECT_LATENCY_MS` (80), measured end to end: clean onsets land within
  about 15 ms of the beat (median).

Strictness (`STRICTNESS`: Easy, Standard, Strict) sets the pitch tolerance
(50/35/25 cents), the onset window (1/2, 1/4, 1/8 beat), the free
intonation (25/20/12 cents), how far the singer's own tuning may drift and
still be followed (100/50/0 cents) and how much of a note must be held
before it is cut short (35/50/65%) - starting points to tune by singing.

Learned from Blaine's first saved run (a trained singer, 90 pitch on Easy):
three things graded the singing wrongly, not the singer. (1) Each note's
pitch was judged over its written slot, so a singer slightly behind had half
of every eighth heard as the note before; pitch is now judged from the
note's own entry to the next note's. (2) The entry was where the pitch
started, so every consonant ("s", "l", "f") read as lateness; it is now
where the sound starts. (3) Pitch was judged against A440 only, so one
narrow step and the in-tune line after it all lost points; each note is now
judged against the closest of the reference, the singer's settled tuning,
and the interval from the last good note or the note just sung (within the
drift allowance), and credit falls off gradually to nothing at a semitone.
The drift is reported, not scored.

Grade tells the detector which note should be sounding (grade-runner
`setExpectedNotes`, PitchTracker `setExpected`): in Pitch & rhythm the
note written at the moment the frame was sung, the next from a quarter beat
early; in Note by note the note shown. A pitch within 60 cents of it, any
octave, needs clarity 0.65 (`EXPECTED_CLARITY`) where a new note otherwise
needs 0.85; any other pitch keeps the usual bar, so a wrong note is heard
exactly as before. Blaine's run of 8 October (quarters at 60, beat click)
lost two whole notes sung in tune: under the click the voice read 0.7-0.8,
never confirmed, and the tracker learned the singing as noise while it
waited. `bun run scripts/replay-grade-detect.ts grade-runs/<dir>...` replays
sent runs through the detector and grades them again (`EXPECT=0` without
the hint): that run 32% of its notes heard and 55 overall -> 89% and 100,
the two runs of 7 October unchanged (97 and 91-92). check-grade still finds
exactly the planted faults in both modes, with and without the click. The beat is the click as heard
(below, "One clock for the beat"). Replayed with these, that run grades 97 pitch,
99 rhythm.

Grade's setup and results are centred cards over the page (GradePanel);
while it runs only the slim strip shows, so the music is in view. The setup
asks, for a rhythm, Just me or The class (Just me the default), saying what
the chosen one grades; for a sung exercise, Pitch & rhythm or Note by note.
The results show the score, a tally (right; wrong note; not heard; early or
late; sharp or flat; let go early; for claps: in time, early or late,
missed, stray) and Easy / Standard / Strict, which grades the same run again
at once (`GradeRunner.regrade`: it keeps the pitch frames or the claps it
heard). "See it on the music" puts the results away to the strip, whose
Results button brings them back.

**One clock for the beat** (12 October 2026, after learnmusic.fun's Rhythm
Hero): a run in time books every click on the audio clock before it sounds,
on one grid, T0 + k beats (AbcjsSingle `startGradeTimeline`), and the run is
scored by that grid as heard, read through the context's output timestamp
(clap-listener `audioToPage`), the same ruler the claps are stamped with. The
click used to sound when the cursor's timer reached each beat: up to 16 ms
off the scored beat on a fast Mac, 20-60 ms beat to beat in a Windows
laptop's recordings, and claps that followed it were graded by its wobble.
Now 0.1 ms (`bun run scripts/check-grade-clicks.ts`, `CPU=4` for a slow
laptop). The cursor and count-in words are drawing only: they start when the
first click is heard. A run is the exercise playing, as Play is
(metronome-link): a metronome ticking on its own stops as it starts (its
booked ticks cancelled, `Metronome.stop`), and the transport's Click turns the
run's click on and off instead of starting a second metronome. Hear your take
keeps its booked clicks with its sources, so Pause stops them
(`scheduleClick` returns the sound). `OVERLAP=1 CLICK=beat bun run
scripts/check-clap-grade.ts` checks all three: before the fix 43 clicks in a
22-beat run, the metronome ticking on after it, 15 clicks left booked after
Pause. Check timing books its clicks the same way, so a delay
it saves matches a run (any term added to the beat must go in both). The
end-to-end checks clap and sing to the page's own beat (`__gradeDebug.t0`),
not the count-in word on screen, which trails it by a frame; against that,
DETECT_LATENCY_MS fell from 110 to 80 and the fake microphone's delay from 36
to 25.

**Hear your take** (`src/lib/grade-playback.ts`, tests
`grade-playback.test.ts`): every microphone run is recorded (grade-recording,
kept in this browser only, students too; gone when the marks clear), and the
results offer it back. `TakePlayer` decodes the take and plays it on its own
AudioContext with, under it when With the music is on, the exercise rendered
by abcjs (`src/lib/render-abc.ts`, shared with the play-along video's
guide) and the click from the count-in, all started together on the audio
clock so nothing drifts. Its page time drives the cursor (`gradeCursorTo`),
the strip's note line (`gradeDetail`) and `revealTo` (grade-feedback: each
note's trace and marks in a `data-note` group, those not yet heard faint);
tapping a note seeks there. Note by note has no music (it is untimed); the
cursor follows its spans. MediaRecorder stamps its start late:
`TAKE_ALIGN_MS` (74), measured end to end, puts the sung notes within about
10 ms of where they were sung (`scripts/check-grade.ts PLAYBACK=1`, also
`MODE=pitch` and `check-clap-grade.ts PLAYBACK=1`).

After a run the score shows what was sung (`grade-feedback.ts`, an overlay
group in the abcjs SVG): the pitch trace through each note's time (blue in
tolerance, red off, placed by staff steps from each notehead in the key, so
no clef is needed), each note coloured, an arrow where a note came in early
or late, a dashed line under one cut short, a cross over a rest sung through;
beside a wrong note, the note that was sung: a red notehead where it sits, a sharp or flat if outside the key, and its solfège; tapping a note puts its details in the strip ("you sang fa, the note is mi ·
0.35 beats late"). Rules in `src/lib/grade.ts` (tests `grade.test.ts`), the
run in `src/lib/grade-runner.ts`, the strip in `GradePanel.svelte`. While it
listens the tuner store's `micHeld` keeps a Tools card from switching the
microphone off; `pitchHistory` keeps 3 minutes, enough for a long exercise.

**Send this run**, labelled **Report error** on the page ("it helps improve the grading algorithm"; anyone with Grade but students, who may be under 13 and
whose pages carry no feedback form): each run is recorded in the browser and
kept there; after it, Send uploads the results, the exercise and the
recording, with an optional note on what seemed wrong, straight from the
browser into the private `grade-runs` Vercel Blob store (`/api/grade-runs`
signs uploads: signed in, Pro or better, not a student, checked against the
database). The panel says what is sent and that nothing is sent without
Send. `bun run scripts/grade-runs.ts` lists the runs sent and `... pull
[dir]` fetches one into `grade-runs/` (gitignored; the token is in
.env.local). Replay them to tune grading. On the dev server Send is off (there is no
store there) unless `PUBLIC_GRADE_SEND=1` and `BLOB_READ_WRITE_TOKEN` are in
the environment; with `BETTER_AUTH_URL` and `COMP_EMAILS` set too, a second
dev server on another port can test Send end to end with a throwaway account
(done 6 October 2026; delete the account and the upload after).

Does the click cost the singer? Grading keeps echo cancellation, which turns
the microphone down while the speakers sound. Measured on Blaine's two sent
runs (7 October 2026, half and whole notes at 72, speakers, click on and
off; `bun run scripts/check-click-dips.ts <runs>`, tests
`click-dips.test.ts`): inside held notes, the frames just after a click were
as loud and as pitched as those just before (+0.1 dB, 100% voiced; click off
-0.7 dB), and the scores matched (96 on, 94 off). The duck is shorter than a
detection frame (~46 ms), so grading does not feel it; only a recording
played back did, which is why the take skips echo cancellation and grading
keeps it.

Runs can also be saved for review: on the dev server, or with `?gradeDebug=1`,
the microphone is recorded over each run (a second stream, `grade-recording.ts`,
so the detection code is untouched; without the tuner's echo cancellation,
which turned the take down on every click of Grade's beat click and left it
cutting out on playback) and
the results have "Save this run": the recording, and a JSON of everything
the grading used (the ABC, tempo, meter, settings, the pitch frames with
their times, t0, every note's result). Nothing may await between the tuner
starting and the run starting in `startGrade`: the page switches off a
microphone held with no run, and the recording's await once did exactly that.
In Pitch only, a note after a rest has its clock start when the rest ends;
in Pitch & rhythm, a rest counts as sung through only past the onset window
and for a good part of it, and an onset must carry on (a voiced blip is not
an entry).

`bun run scripts/check-grade.ts` checks it end to end on the dev server
(`MODE=pitch`, `STRICT=`, `CURSOR=`, `CLICK=`, `SHOTS=<png>`): Pro answered,
the microphone replaced by a synthesized voice singing the exercise in time
with faults planted (a note a step high, one 0.35 beats late, one left out),
and Grade must find exactly those. It reads the page through a dev-only
`window.__gradeDebug`, and prints where the clean onsets landed (for
`DETECT_LATENCY_MS`).

**Timing check** (13 October 2026, `scripts/check-tap-timing.ts`): Check
timing, in the Clap and grade setup for both inputs, plays eight clicks on
the audio clock and stores how late this device's claps (`clapLatencyMs`) or
taps (`tapLatencyMs`) land after them: the speakers' delay, a TV's HDMI or a
Bluetooth speaker included, which browsers do not report. Taps have it taken
off as claps have theirs. Checked, nothing is forgiven: on a TV 150 ms behind,
a rhythm tapped a 16th early scores 0 on Strict (it scored 100). Unchecked,
steady lateness is forgiven up to `FORGIVE_MAX_MS` (220: Blaine's runs ran
71-215 ms late unchecked) and earliness never, since a delay only makes a clap
late; the results say when it was assumed. Unchecked on a TV a 16th early
still looks on time, which only the check can tell, so the button is
highlighted until it is done. Easy's full credit is 120 ms (it was half a
beat, 400 ms at 75 BPM).

**Clap grading** (rhythm-only Unison, Pro; "Clap and grade"): only each
note's start counts and rests are silence. Clap with the **Microphone** or
the **Spacebar & pad** (`TapPad.svelte`: a wide key floating in the middle
just above Grade's strip, like a space bar (Blaine, 14 October 2026; it was
a round pad at one edge), answering on pointerdown; the spacebar likewise,
key repeat ignored), and **Who**: Just me, or The class - one
device hears the room and grades it as one. Rules in `src/lib/grade-rhythm.ts`
(`gradeClaps`), hearing in `src/lib/clap-detect.ts` (tests
`clap-grading.test.ts`), the runner's mode `"claps"`. Claps are matched to
notes one to one and in order (a small dynamic program), each within its
note's window: three onset windows, never past halfway to a neighbouring
note (reaching to the neighbour let every clap after a missed note slide one
note over). Credit is the singing grade's onset rule, with the full-credit
window capped in ms for claps (`CLAP_FULL_MS`: Standard 80, Strict 50; Easy
uncapped): a share of a beat let Strict forgive 125 ms at 60 BPM, so slow
quarters clapped audibly off scored 100 (12 October 2026). Matching windows
keep the beat's share, so a clap far off is late, not missed. Every clap matched to
no note is a stray. The score is beat by beat (`scoreByBeats`, 12 October
2026), the way a teacher marks: a beat counts its notes' credit only if every
note starting in it was clapped and no stray fell in it (a stray costs its
weight); a beat with no note starting counts only if a stray fell in it, as
0. "Beats right" heads the results. Note by note (credit over notes +
strays) let a wrong rhythm score high: on a sent run's exercise, 2,000
random trials, the steady beat through ti-ti got 70 and a made-up rhythm on
the grid up to 92; beat by beat 56 and 88 (35 on average on Strict), random
times 6-25, the real run 94. A class's clap is a burst (`detectBursts`), timed where
half its energy has arrived; its level is the root of its energy, so against
the room's usual level it is the root of the share of the room that clapped:
a stray from one child in twenty weighs about 0.2, a whole room's 1, and a
note under 0.4 of the usual gets that part of its credit. How together the
room was (the bursts' 20-80% width: Tight, Fair, Ragged) is reported, not
scored.

Tuned on Blaine's first class recordings (6 October, four runs sent with
Send this run; `bun run scripts/replay-clap-run.ts` replays sent runs through
the grading as it stands, as sent and as the other Who). Every note was
clapped in time; the strays sank them (53-82). Three causes, three rules:
- **Chanting.** A "ta" said with the clap is a sharp onset of its own. A
  voice has a pitch and a clap none: `voicingAt` (autocorrelation over 80 ms,
  30 ms past the onset, on the worklet's 16 kHz copy of the sound) read every
  clap 0.08-0.38 and the chant 0.42-0.96, so above `VOICED_ABOVE` (0.45) a
  sound is chant: never a stray, and only filling a note no clap did.
- **A ragged room.** Children a little behind the rest made extra bursts
  after each clap. For The class, a sound within a third of a beat (300 ms at
  most, `CLAP_MERGE_MS`) of a matched clap is that clap. Just me keeps a
  second clap that close as a double clap.
- **Slivers and the room.** A room's clap can split off a faint leading edge
  just ahead of it, nearer the beat, which was matched in its place and the
  note credited as clapped by a handful. For The class, sounds under
  `CLASS_QUIET_SHARE` (15%) of the run's typical level are dropped before
  matching (one child alone is about a fifth and still counts); for Just me,
  under `QUIET_SHARE` (25%) of its claps, from the strays only, since one
  person's quiet clap is still a clap.
Those four runs went 53/61/67/82 -> 77/97/98/99 as The class.
A class chanting on its claps also fills the low band, so a room's clap can
peak with only 8-20% of its power above 1.5 kHz; The class needs 8% there
(`CLASS_HI_SHARE`), Just me still 15%. At 15% the 8 October run lost a
clean clap on beat 2 as missed (89; now 100, no other sent run worse). Two had been
left on Just me; a Just me run whose claps come in clusters now says it
sounded like a class (`soundedLikeClass`). The result lists what was not
counted (chanted syllables, late claps folded in).

The microphone is a stream of its own on the tuner's context, with no echo
cancellation (`ClapListener`; the tuner's stream is the fallback), listened
to by `public/clap-detector.js`. Through the tuner's echo-cancelled stream a
Windows laptop lost 6 of 16 claps on the beat, under the click (a sent run,
12 October 2026: 71, every off-beat clap heard; 96 from its recording). It reads the power above 1.5 kHz and over the whole band
every 128 samples, stamped on the audio clock and moved onto performance.now
(`ClapListener`), since the tuner's 2048-sample frames are too coarse. A clap
is a sudden rise of the high band (9 dB over its floor, and peaking 20 dB
over the quietest of the 30 ms before it) with a fair share of its power up
there (a voice has little). Blaine's first real run (6 October) found 9 dB
over 10 ms too loose: a reflection 60 ms into a clap's ring rose 12 dB and
was counted as a second clap, five strays of nine. It also ran a steady
100 ms behind the 45 ms guess, which at 72 BPM pushed every sixteenth's clap
into the next note's window. So the steady lag (`steadyLag`: the median of
each clap's distance to its nearest note) now centres the windows, and until
Check timing has run it is taken to be the microphone and not counted
(`forgiveLag`); after it, only lateness counts. That run regraded from 56 to
100. On the score each early or late note has a labelled arrow from the note
to where it came in (orange with some credit, red with none), a missed note
says "missed" and a stray has its cross and "extra". The page's click heard back is
learned from the count-in, when nobody claps, with its delay (a Windows
laptop heard it 160 ms late, past the 40 ms once looked in, and the echo took
the note from the clap), and later a sound within 40 ms of a click's echo
counts only if 3 times louder (`withoutClickEcho`); an "echo" as loud as the
run's claps is a room clapping along with the count-in and is not learned; the click is off
after the count-in by default. One person's clap often comes as two sounds,
a faint one then the clap 60-100 ms on: a much louder sound within the 60 ms
refractory time moves the clap to it (detectClaps, `LOUDER_DB`), and two
sounds within 100 ms (half the closest notes at most) are one clap at the
louder (`pairClaps`, solo only). On the raw microphone, without these, Blaine's
6 October solo runs graded 60 and 38; with them 90 and 85. One quiet clap exactly on a click cannot be
told from its echo. The microphone's delay is `CLAP_MIC_LATENCY_MS` (25; it read 36, and 45 through the echo-cancelled stream, against the count-in word on screen,
measured with the fake microphone) until **Check timing** (clap along with
eight clicks) stores the median for this browser (`clapLatencyMs`).
`bun run scripts/check-clap-grade.ts` checks it end to end (`WHO=class`,
`INPUT=keys`, `ECHO=1 CLICK=beat`, `STRICT=`, `MEASURE=1`, `SHOTS=`): claps
synthesized into a fake microphone (a class: twenty per clap, 35 ms either
side), one note late, one missed, one doubled, one stray, placed where each
is unambiguous (a late clap on a note a beat clear of the next); 24 runs
across the variants, sixteenths included, clean on 6 October 2026. The Grade button is kept in full screen,
for a class on a TV.

To test with a real signal, run Chromium with
`--use-fake-device-for-media-stream --use-file-for-fake-audio-capture=<wav>`;
a synthetic 440 Hz tone reads A4 within a cent.
