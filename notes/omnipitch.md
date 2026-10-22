# OmniPitch in abcTuner (the Ensemble tab)

`public/omnipitch/polypitch-1.wasm` is OmniPitch's detector
(`~/Projects/polyphonic-pitch-detector`, Blaine's), built with **default
features only**: Basic Pitch (Spotify, Apache-2.0) with both models (the
standard one and the choir fine-tune) and score-informed separation. No
vocoder: that is Harmelody's, proprietary, and only edits notes.

## Rebuilding

```sh
cd ~/Projects/polyphonic-pitch-detector/polypitch
PATH="$HOME/.cargo/bin:$PATH" cargo build --release --target wasm32-unknown-unknown
cp target/wasm32-unknown-unknown/release/polypitch.wasm \
   ~/Projects/abcSightreading/public/omnipitch/polypitch-2.wasm
```

Give each build a **new name** and change `POLYPITCH_URL`
(src/lib/ensemble-tuning/polypitch.ts): vercel.json caches
`/omnipitch/*.wasm` for a year. Update CREDITS.txt's commit. The loader is a
port of `polypitch/web/polypitch.js`; a new export there needs porting too.

## What was measured (22 October 2026)

`bun run scripts/check-ensemble-real.ts` on the Choral Singing Dataset
quartets OmniPitch built (`data/csd/*_quartet`: one singer a part, each
part's audio and score kept). Truth: each written note measured from its
singer alone.

- The truth itself is only good to about 5 cents: on a singer alone, two
  sound readings of a note differ by a median 4-7 cents and by over 25 on
  3-9% of notes (the score's spans include the moves between notes).
- Separation alone (OmniPitch's own reading) from the mix: median error
  7.8 cents, 56% within 10. Octaves and unisons are the hard cases: the upper
  note of an octave has every harmonic inside the lower note's.
- So a second reading (`harmonic-pitch.ts`): the note's own harmonics in the
  mix, leaving out any another note covers. Where the two agree (within 12
  cents) the note is sure: median 5 cents, 70% within 10, 11% over 25. Where
  they disagree it is unsure (dashed, left out of the parts' figures) and
  the harmonic reading is shown (median 10 cents against separation's 19).
- Parts (`assignParts`): votes from every moment exactly as many notes sound
  as there are parts, the rest by the nearest line. 88% of notes in the
  right part from the mix (44% going note by note, where a resting part was
  taken over by its neighbour and staggered entries split chords).
- **Each part's lean** (what the tab tells a director): within a median 2
  cents of the truth, the worst 9, across the 12 parts. Everyone: within 2.

`bun run scripts/check-ensemble-tuning.ts` (synthetic SATB with faults
planted) and `scripts/check-ensemble-page.ts <wav>` (the tab end to end in
headless Chrome on /dev/ensemble) are the other gates.

## Not done

- Live view while recording (decided against: after the take only).
- A pitch reference other than equal temperament at the tuner's A (just
  intonation against the chord, or the group's own drift as OmniPitch's
  editor judges).
- Takes are kept for the page's life only; Save recording downloads a WAV.
- Measured on quartets (one voice a part). A full choir (several singers a
  part) blurs each note; OmniPitch has `data/csd/*_choir` to measure that.
