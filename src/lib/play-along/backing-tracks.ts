import { countInMeasures } from "../count-in";
import { barsForLength } from "./timeline";

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
  /**
   * The song's tonic as a pitch class (0 = C), for a pitched guide (piano,
   * marimba, organ, voice) to play the rhythm on. Read from the packs' file
   * names and checked against the finished mix (pitch-class profiles):
   * soul B flat minor, trap A minor, cumbia F minor, reggaeton G (its pack
   * says G; the mix has C, not C sharp, so G major's notes over a pluck on
   * B and F sharp). Drum loops have none: the guide plays on C.
   */
  tonic?: number;
  /** Bars before the repeating part that serve as the count-in; the meter's own count-in when absent. */
  introBars?: number;
  /**
   * A whole arrangement rather than a loop (scripts/backing/):
   * `introBars` of count-in, then exactly `bars` of music, then its own
   * ending. Played once, so the exercise is exactly `bars` long.
   */
  fullLength?: boolean;
  /**
   * A loop's ending (scripts/backing/drums.ts): an empty bar, the groove into
   * its fill, then a final hit on the last bar's downbeat, ringing
   * ENDING_TAIL seconds past it. The video plays it over the last two bars
   * instead of the loop (audio.ts).
   */
  ending?: string;
}

/** How long an ending's last hit rings after the music, at the track's own tempo (drums.ts). */
export const ENDING_TAIL = 2.5;

/**
 * Simple 8-bar drum loops, one acoustic kit, every meter the videos offer
 * (built by scripts/backing/drums.ts, which reads this list). Loops, not
 * songs: the video repeats them as long as the exercise.
 */
export const DRUM_LOOPS = [
  { style: "rock", label: "rock beat", meter: "4/4", bpm: 70 },
  { style: "rock", label: "rock beat", meter: "4/4", bpm: 90 },
  { style: "rock", label: "rock beat", meter: "4/4", bpm: 110 },
  { style: "boombap", label: "boom bap", meter: "4/4", bpm: 85 },
  { style: "fourfloor", label: "four on the floor", meter: "4/4", bpm: 120 },
  { style: "march", label: "march", meter: "2/4", bpm: 90 },
  { style: "march", label: "march", meter: "2/4", bpm: 110 },
  { style: "waltz", label: "waltz", meter: "3/4", bpm: 90 },
  { style: "waltz", label: "waltz", meter: "3/4", bpm: 120 },
  { style: "sixeight", label: "6/8 groove", meter: "6/8", bpm: 50 },
  { style: "sixeight", label: "6/8 groove", meter: "6/8", bpm: 65 },
  { style: "nineeight", label: "9/8 groove", meter: "9/8", bpm: 60 },
  { style: "shuffle", label: "shuffle", meter: "12/8", bpm: 60 },
] as const;

export const drumLoopId = (d: { style: string; meter: string; bpm: number }) =>
  `drums-${d.style}-${d.meter.replace("/", "-")}-${d.bpm}`;

const drumTracks: BackingTrack[] = DRUM_LOOPS.map((d) => ({
  id: drumLoopId(d),
  name: `Drums: ${d.label} (${d.meter}, ${d.bpm})`,
  file: `/backing/${drumLoopId(d)}.mp3`,
  ending: `/backing/${drumLoopId(d)}-end.mp3`,
  bpm: d.bpm,
  meter: d.meter,
  bars: 8,
  downbeatSec: 0,
}));

export const BACKING_TRACKS: BackingTrack[] = [
  {
    id: "soul-4-4-80",
    tonic: 10,
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
    tonic: 7,
    name: "Reggaeton (4/4, 108)",
    file: "/backing/reggaeton-4-4-108.mp3",
    bpm: 108,
    meter: "4/4",
    bars: 40,
    downbeatSec: 0,
    introBars: 1,
    fullLength: true,
  },
  // Trap is made at 140 and felt in half time: written at 70, the snare on 2 and 4.
  {
    id: "trap-4-4-70",
    tonic: 9,
    name: "Trap (4/4, 70)",
    file: "/backing/trap-4-4-70.mp3",
    bpm: 70,
    meter: "4/4",
    bars: 24,
    downbeatSec: 0,
    introBars: 1,
    fullLength: true,
  },
  // One recording, two meters: cumbia is usually written in 2/4, and the same
  // 36 bars of 4/4 are 72 of 2/4 with the same four-beat count-in.
  {
    id: "cumbia-4-4-100",
    tonic: 5,
    name: "Cumbia (4/4, 100)",
    file: "/backing/cumbia-100.mp3",
    bpm: 100,
    meter: "4/4",
    bars: 36,
    downbeatSec: 0,
    introBars: 1,
    fullLength: true,
  },
  {
    id: "cumbia-2-4-100",
    tonic: 5,
    name: "Cumbia (2/4, 100)",
    file: "/backing/cumbia-100.mp3",
    bpm: 100,
    meter: "2/4",
    bars: 72,
    downbeatSec: 0,
    introBars: 2,
    fullLength: true,
  },
  ...drumTracks,
];

export const backingTrackById = (id: string) => BACKING_TRACKS.find((t) => t.id === id);

/** Bars of count-in before the music: a track's own intro, or the meter's count-in. */
export const countInBarsFor = (t: BackingTrack) => t.introBars ?? countInMeasures(t.meter);

/**
 * How many bars of music a video over `t` has: a full-length track's own, or
 * for a loop about a minute and a half at its tempo, in whole repeats.
 */
export function barsFor(t: BackingTrack): number {
  if (t.fullLength) return t.bars;
  return barsForLength({ bpm: t.bpm, meter: t.meter, loopBars: t.bars, countInBars: countInBarsFor(t) });
}

/**
 * The longest any track in `meter` needs: the video writes one exercise this
 * long and each track uses its first `barsFor` bars, so swapping between
 * tracks in a meter needs no new exercise.
 */
export function maxBarsIn(meter: string): number {
  return Math.max(0, ...BACKING_TRACKS.filter((t) => t.meter === meter).map(barsFor));
}

export const backingTracksIn = (meter: string) => BACKING_TRACKS.filter((t) => t.meter === meter);

/**
 * Semitones from the rhythm staff's placeholder note (B4, MIDI 71) to the
 * track's tonic, the nearest one (F4 up to E5), for a pitched rhythm guide;
 * C without a tonic.
 */
export function guideTranspose(track: { tonic?: number } | null | undefined): number {
  const pc = track?.tonic ?? 0;
  return ((((pc - 11 + 6) % 12) + 12) % 12) - 6;
}
