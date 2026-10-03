/**
 * The backing loops a play-along video can run over. Each is an audio file in
 * public/backing/ (credited in public/backing/CREDITS.txt) at a known tempo and
 * meter: the exercise takes its tempo and meter from the loop, never the other
 * way round, because stretching a loop with playbackRate would change its pitch.
 *
 * A loop cut exactly on the bar with no lead-in has `downbeatSec: 0`.
 */
export interface BackingTrack {
  id: string;
  name: string;
  /** Path under public/, e.g. "/backing/groove-100.mp3". */
  file: string;
  /** Beats a minute: quarters in simple meter, dotted quarters in compound. */
  bpm: number;
  meter: string;
  /** Length of the repeating part, in bars. */
  bars: number;
  /** Where beat 1 of the repeating part falls in the file, in seconds. */
  downbeatSec: number;
  /** Bars before the repeating part that serve as the count-in; the meter's own count-in when absent. */
  introBars?: number;
  /**
   * A whole arrangement rather than a loop (scripts/backing/):
   * `introBars` of count-in, then exactly `bars` of music, then its own
   * ending. Played once, so the exercise is exactly `bars` long.
   */
  fullLength?: boolean;
}

/**
 * Placeholders for the meters with no real track yet: a synthesized groove
 * each, from scripts/make-placeholder-loops.ts. Replace them, and delete the
 * files. Real tracks are arranged from Splice packs in scripts/backing/.
 */
const placeholder = (meter: string, bpm: number): BackingTrack => ({
  id: `placeholder-${meter.replace("/", "-")}`,
  name: `Practice groove (${meter}, ${bpm})`,
  file: `/backing/placeholder-${meter.replace("/", "-")}.wav`,
  bpm,
  meter,
  bars: 4,
  downbeatSec: 0,
});

export const BACKING_TRACKS: BackingTrack[] = [
  {
    id: "soul-4-4-80",
    name: "Soul band (4/4, 80)",
    file: "/backing/soul-4-4-80.mp3",
    bpm: 80,
    meter: "4/4",
    bars: 32,
    downbeatSec: 0,
    introBars: 1,
    fullLength: true,
  },
  {
    id: "reggaeton-4-4-108",
    name: "Reggaeton (4/4, 108)",
    file: "/backing/reggaeton-4-4-108.mp3",
    bpm: 108,
    meter: "4/4",
    bars: 40,
    downbeatSec: 0,
    introBars: 1,
    fullLength: true,
  },
  placeholder("3/4", 96),
  placeholder("2/4", 100),
  placeholder("6/8", 60),
];

export const backingTrackById = (id: string) => BACKING_TRACKS.find((t) => t.id === id);

export const backingTracksIn = (meter: string) => BACKING_TRACKS.filter((t) => t.meter === meter);
