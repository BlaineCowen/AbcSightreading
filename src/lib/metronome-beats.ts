/**
 * Deciding when the metronome should click.
 *
 * abcjs's `beatCallback` fires once per *subdivision*, not once per beat, and
 * the cursor needs a high subdivision count to glide smoothly. That makes the
 * callback the wrong thing to hang a click on: at 16 subdivisions the metronome
 * would sound sixteen times a beat.
 *
 * `beatNumber` arrives as `currentBeat / beatSubdivisions`, so whole beats are
 * exact binary fractions (1/16 = 0.0625) and land precisely on integers - but
 * this tracks the last whole beat sounded rather than testing a float for
 * integrality, so it stays correct for any subdivision count, including ones
 * that do not divide cleanly.
 *
 * Lives here rather than inside the component so it can be tested directly;
 * the failure it guards against is audible but not visible, and a browser tab
 * that is throttled or backgrounded cannot demonstrate the click rate at all.
 */
export type MetronomeBeatState = {
  /** The last whole beat that produced a click; -1 before playback starts. */
  lastClickedBeat: number;
};

export function newMetronomeBeatState(): MetronomeBeatState {
  return { lastClickedBeat: -1 };
}

export type MetronomeClick = {
  /** Whether this callback should sound a click at all. */
  click: boolean;
  /** True on beat one of the measure, which is accented. */
  isDownbeat: boolean;
};

/**
 * @param beatNumber - as handed to abcjs's beatCallback; fractional between beats.
 * @param beatsPerMeasure - for picking out the downbeat.
 */
export function metronomeClickFor(
  state: MetronomeBeatState,
  beatNumber: number,
  beatsPerMeasure: number
): MetronomeClick {
  const wholeBeat = Math.floor(beatNumber);
  if (wholeBeat === state.lastClickedBeat) {
    return { click: false, isDownbeat: false };
  }
  state.lastClickedBeat = wholeBeat;
  return {
    click: true,
    isDownbeat: beatsPerMeasure > 0 && wholeBeat % beatsPerMeasure === 0,
  };
}
