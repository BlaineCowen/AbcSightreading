# abcTuner

The tuner at `/tuner` and the practice pages' tuner widget.

Ported from Blaine's standalone tuner project (`~/Projects/tuner`, Next.js).
The detection is that project's, unchanged apart from import paths:

- `autocorrelation.ts` - McLeod Pitch Method, keeping every key maximum as a
  candidate rather than committing to one per frame
- `pitch-tracker.ts` - chooses between candidates over time; gates on level
  against a learned noise floor and the recent peak; confirms a new note on
  consecutive frames (more for octave jumps) so noise between notes does not
  flash wrong notes
- `tuner-engine.ts` - mic (echo cancellation on, AGC off), the
  `public/tuner-accumulator.js` worklet, one frame per 2048 samples
- `harmonics.ts`, `pitch.ts`, `metronome.ts`, `note-player.ts`,
  `pitch-history.ts`, `scale-challenge.ts` - as there

New here: `store.ts` (the zustand store as a Svelte store, same actions),
`controller.ts` (the useTunerEngine hook as module functions - one mic per
page), `scale-challenge-runner.ts` (the challenge hook as a class), and
`canvas-colors.ts` (theme colours for the canvases, which were black-only).

Improve detection in the tuner project's terms - its `scripts/pitch-bench.ts`
benchmark runs against the same files - and copy the change across.
