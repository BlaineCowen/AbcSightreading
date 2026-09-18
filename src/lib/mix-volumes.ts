/**
 * Separate playback and metronome levels for abcjs.
 *
 * abcjs renders the whole tune - voices and drum track together - into one
 * audio buffer, and its only volume knob (`soundFontVolumeMultiplier`) scales
 * all of it. So the two levels cannot be set on the output; they are set on the
 * notes, through `sequenceCallback`, which abcjs calls with the note map before
 * it renders. The drum track's notes carry the instrument name "percussion".
 */

export const METRONOME_INSTRUMENT = "percussion";

/** The part of an abcjs note-map entry this touches. */
export interface MixableNote {
  instrument: string;
  volume: number;
}

export interface MixLevels {
  /** 0 is silent, 1 is as written. */
  playback: number;
  metronome: number;
}

/** MIDI velocity: abcjs parses it back as an integer, and 127 is the ceiling. */
function scaled(volume: number, level: number): number {
  const safe = Number.isFinite(level) ? Math.max(0, level) : 1;
  return Math.max(0, Math.min(127, Math.round(volume * safe)));
}

export function applyMixLevels<T extends MixableNote>(tracks: T[][], levels: MixLevels): T[][] {
  for (const track of tracks) {
    for (const note of track) {
      const level = note.instrument === METRONOME_INSTRUMENT ? levels.metronome : levels.playback;
      note.volume = scaled(note.volume, level);
    }
  }
  return tracks;
}
