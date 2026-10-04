import { countInMeasures } from "../count-in";
import { barsForLength } from "./timeline";
import type { FormSection } from "../unison-form";

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
  /**
   * A full-length track's sections, in order (repeated letters are the same
   * music): the exercise's phrases are laid over them (unison-form.ts
   * planFromForm), so its questions and answers land on the track's changes
   * and its opening comes back where the track's does. Their bars add up to
   * `bars`.
   */
  form?: FormSection[];
}

const section = (letter: string, bars: number): FormSection => ({ letter, bars });

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
  bpm: d.bpm,
  meter: d.meter,
  bars: 8,
  downbeatSec: 0,
}));

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
    // Intro, drums and bass, + acoustic guitar, new groove, breakdown, everything.
    form: [section("I", 4), section("A", 8), section("A", 8), section("B", 4), section("C", 4), section("A", 4)],
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
    // Intro, the beat, + shaker and claps, new groove, breakdown, everything.
    form: [section("I", 4), section("A", 8), section("A", 8), section("B", 8), section("C", 4), section("A", 8)],
  },
  // Trap is made at 140 and felt in half time: written at 70, the snare on 2 and 4.
  {
    id: "trap-4-4-70",
    name: "Trap (4/4, 70)",
    file: "/backing/trap-4-4-70.mp3",
    bpm: 70,
    meter: "4/4",
    bars: 24,
    downbeatSec: 0,
    introBars: 1,
    fullLength: true,
    // Montreal, lit off the gas, breakdown, montreal again.
    form: [section("A", 8), section("B", 4), section("C", 4), section("A", 8)],
  },
  // One recording, two meters: cumbia is usually written in 2/4, and the same
  // 36 bars of 4/4 are 72 of 2/4 with the same four-beat count-in.
  {
    id: "cumbia-4-4-100",
    name: "Cumbia (4/4, 100)",
    file: "/backing/cumbia-100.mp3",
    bpm: 100,
    meter: "4/4",
    bars: 36,
    downbeatSec: 0,
    introBars: 1,
    fullLength: true,
    // Intro, the band, trumpets, the bridge, breakdown, everything.
    form: [section("I", 4), section("A", 8), section("A", 8), section("B", 8), section("C", 4), section("A", 4)],
  },
  {
    id: "cumbia-2-4-100",
    name: "Cumbia (2/4, 100)",
    file: "/backing/cumbia-100.mp3",
    bpm: 100,
    meter: "2/4",
    bars: 72,
    downbeatSec: 0,
    introBars: 2,
    fullLength: true,
    // The same sections as the 4/4 listing, counted in bars of 2/4.
    form: [section("I", 8), section("A", 16), section("A", 16), section("B", 16), section("C", 8), section("A", 8)],
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
  return Math.max(0, ...BACKING_TRACKS.filter((t) => t.meter === meter && !t.form).map(barsFor));
}

/**
 * Which exercise a track plays over: its own, written to its form, when it
 * has one; otherwise the one its meter's loops share (plain periods,
 * maxBarsIn long). Tracks with the same key can swap without a new exercise.
 */
export const exerciseKeyFor = (t: BackingTrack) => (t.form ? `${t.meter}|${t.id}` : `${t.meter}|periods`);

export const backingTracksIn = (meter: string) => BACKING_TRACKS.filter((t) => t.meter === meter);
