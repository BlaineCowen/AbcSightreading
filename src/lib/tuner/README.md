# abcTuner

The tuner at `/tuner` and the practice pages' tuner widget.

Ported from Blaine's standalone tuner project (`~/Projects/tuner`, Next.js),
which is retired (18 October 2026): this is the tuner now, and detection is
changed here. As ported:

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

New here: `voice-spectrum.ts` (the Analysis tool: harmonic levels, formants
by analysis by synthesis, a vowel guess), `TunerEngine.readSpectrum` (a
read-only view of the analyser for it, which detection never sees), `store.ts` (the zustand store as a Svelte store, same actions),
`controller.ts` (the useTunerEngine hook as module functions - one mic per
page), `scale-challenge-runner.ts` (the challenge hook as a class), and
`canvas-colors.ts` (theme colours for the canvases, which were black-only).

Since the port: `autocorrelation.ts` keeps its scratch arrays between frames
(the same output, checked frame for frame), and `TunerEngine.setPaused` stops
detection in a hidden tab unless Grade or the audio check holds the
microphone (`controller.ts`). The old project's `scripts/pitch-bench.ts`
benchmark was not brought across; a change to detection is checked here with
`scripts/check-grade.ts` and the unit tests.
