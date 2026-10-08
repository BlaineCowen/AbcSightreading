# Metronome: plan (8 October 2026)

Measured against Tonal Energy's metronome (Blaine's screenshots). Decisions:
spoken counting is the "different sounds for numbers"; everything reaches the
click under an exercise too, through one model.

## Where it stands
- `src/lib/tuner/metronome.ts`: the lookahead scheduler (Web Audio).
- `src/lib/tuner/meters.ts`: 10 meters, beat note, subdivisions allowed, groupings (5/8 2+3, 7/8 2+2+3).
- `src/lib/playback-click.ts`: `barClicks(beats, subdivision, accent)` is the one bar pattern; Choral turns it into an abcjs drum pattern, Unison schedules it per beat.
- The tuner store holds meter, subdivision (clicks per beat), accent (beat 1 only), sound, volume; `metronome-link.ts` makes the Tools card, /tuner and the page's click one metronome.
- Tap tempo on the Tools card. Drill already ramps tempo between exercises (`practice-run.ts` `rampBpm`).

## The model (phase 1, everything else stands on it)
A bar is a list of beats, each with a **level** and a **subdivision pattern**:
- **Level** per beat: accent, normal, soft, silent. Default: accent on 1, normal elsewhere (today's behaviour). Groupings (5/8, 7/8, 12/8) keep their lighter group accents as a preset of levels, not a rule.
- **Pattern** per beat: a grid (1, 2, 3, 4, 6, 8 slots) and which slots sound, at what level. Today's subdivisions are the full grids. New ones are masks:
  - off-beat (rest, eighth)
  - swing (triplet, middle silent)
  - triplet with the first silent
  - the sixteenth figures (1-e-&, 1-&-a, 1-e-a)
  - 32nds
  - quarter-note triplets over two beats, which needs a pattern spanning two beats.
- **`barClicks` becomes `barPattern(meter, levels, pattern)`**, returning timed events. The scheduler, Unison's click and Choral's drum pattern all read it. abcjs drum patterns take `z` for a silent slot, so masks work there.
- **Stored** in the tuner store, presets and links; older ones map across (subdivision n is the full grid, accent on/off is beat 1's level).
- **Tests:** the pattern maths, the drum-pattern string, and a snapshot that today's settings make exactly today's clicks.

## Phase 2: the face of it
- Beat tiles across the top (as Tonal Energy's 1 2 3 4): the current beat lights; tap a tile to cycle its level; its height shows the level.
- A subdivision picker drawn as notation (SVG glyphs, grouped: straight, triplet, with rests).
- Visual flash: off, beats, bars (for a TV in a classroom, full screen).
- On /tuner at full size, on the Tools card compact. The Unison and Choral Display menus show the same picker for the exercise click.

## Phase 3: practice assistant
- **Tempo ramp:** start, target, +N BPM every M bars (or every M seconds), optional ramp back down. Shares Drill's ramp rules.
- **Silent bars:** play X, mute Y, repeating (the class keeps the pulse).
- **Random dropped beats:** a percentage, never beat 1 of a phrase start.
- **Time limit**, and a count-in of 1 or 2 bars with a visual count.
- **Under an exercise:** silent bars and dropped beats apply to the click as the music plays (Unison: skip the scheduled clicks; Choral: per-bar `%%MIDI drumoff`/`drumon` written into the tune as it is played, never into the exported ABC).
- The rules are pure functions over (bar number, beat, seed), unit tested, so a run is repeatable.

## Phase 4: presets
- Quick buttons: 2/4, 3/4, 4/4, 6/8, swing, backbeat (2 and 4), 5/8, 7/8.
- Own presets: meter, tempo, levels, pattern, sound, assistant settings. Saved like page presets (account when signed in, this browser when not), with a "presets set the tempo" switch.

## Phase 5: spoken counting
- **Modes:** off, voice only, voice with the click; voice level.
- **Counts in the page's own syllables:** Counting (1 e & a, 1 la li in compound), Kodály (ta ti-ti, tika-tika), or the teacher's own. The words come from the same tables as the score's syllables (`rhythm-syllables.ts`), so the voice and the page never disagree.
- **Recordings:** short dry samples in `public/voice/<voice>/` (the numbers 1-12, e, and, a, la, li, ta, ti, ka, ri, trip, let...), trimmed to their onset so they land on the beat; two voices. Recorded by Blaine, or made with a TTS service offline and checked by ear: his call.
- Under an exercise it counts what the music is doing, beat by beat.

## Order and size
1. Model and tests: a day. The gate is today's settings clicking exactly as before, in both pages and the Tools metronome.
2. Beat tiles and pattern picker: a day.
3. Assistant: a day.
4. Presets: half a day.
5. Spoken counting: a day of work once the recordings exist.

Leave out: Ableton Link, randomized sounds, decimal tempos, A/V offset.
