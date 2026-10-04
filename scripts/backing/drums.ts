/**
 * Simple drum loops for the play-along videos: one acoustic kit ("Indie
 * Rocker" one-shots), a handful of plain styles in every meter the videos
 * offer, each at a tempo or two. 8 bars that loop without a seam (engine
 * `loop: true`): a crash on bar 1, the groove, a short fill in bar 8. As
 * loops, the video repeats them for as long as the exercise and counts in on
 * the loop's last bar - its fill.
 *
 *   rock         4/4   kick 1 and 3, snare 2 and 4, hi-hat eighths
 *   boom bap     4/4   kick 1, the "a" of 1 and the "and" of 3, snare 2 and 4
 *   four floor   4/4   kick every beat, snare 2 and 4, open hats on the "and"s
 *   march        2/4   kick 1, snare 2, hi-hat eighths
 *   waltz        3/4   kick 1, snare and ride on 2 and 3
 *   6/8, 9/8     kick on 1, snare on the last beat, hats on every eighth
 *   12/8 shuffle kick 1 and 3, snare 2 and 4, ride triplets
 *
 * Compound meters count dotted-quarter beats (three eighths each), as the
 * app does (src/lib/meter.ts): 6/8 at 50 is fifty dotted quarters a minute.
 *
 *   bun run scripts/backing/drums.ts            # every loop
 *   ONLY=drums-rock-4-4-90 bun run scripts/backing/drums.ts
 *
 * The loops built are DRUM_LOOPS in src/lib/play-along/backing-tracks.ts.
 */
import { song } from "./engine";
import { DRUM_LOOPS, drumLoopId } from "../../src/lib/play-along/backing-tracks";

type Hit = [sound: Sound, beat: number, v?: number];
type Sound = "kick" | "kickSoft" | "snare" | "hat" | "hatOpen" | "ride" | "crash" | "tomHi" | "tomLo";

interface Style {
  meter: string;
  /** Beats a bar (dotted quarters in compound meter). */
  beats: number;
  /** The groove for bars 1-7; bar 8 keeps its first part and ends in `fill`. */
  bar: (b: number) => Hit[];
  /** Where the fill starts, in beats, and what it plays. */
  fill: { from: number; hits: Hit[] };
}

const eighths = (beats: number, sound: Sound, on = 1, off = 0.6): Hit[] =>
  Array.from({ length: beats * 2 }, (_, i) => [sound, i / 2, i % 2 ? off : on] as Hit);
/** Compound meter: three eighths a beat, the first accented. */
const tripletEighths = (beats: number, sound: Sound, on = 1, off = 0.6): Hit[] =>
  Array.from({ length: beats * 3 }, (_, i) => [sound, i / 3, i % 3 ? off : on] as Hit);

const STYLES: Record<string, Style> = {
  rock: {
    meter: "4/4", beats: 4,
    bar: (b) => [...eighths(4, "hat"), ["kick", 0], ["kick", 2, 0.9], ...(b % 2 ? [["kickSoft", 2.5, 0.7] as Hit] : []), ["snare", 1], ["snare", 3]],
    fill: { from: 3, hits: [["snare", 3, 0.9], ["tomHi", 3.25, 0.85], ["tomLo", 3.5, 0.95], ["tomLo", 3.75, 0.9]] },
  },
  boombap: {
    meter: "4/4", beats: 4,
    bar: () => [...eighths(4, "hat", 0.9, 0.5), ["kick", 0], ["kickSoft", 0.75, 0.75], ["kick", 2.5, 0.9], ["snare", 1], ["snare", 3]],
    fill: { from: 3, hits: [["snare", 3, 0.9], ["snare", 3.5, 0.7], ["snare", 3.75, 0.8]] },
  },
  fourfloor: {
    meter: "4/4", beats: 4,
    bar: () => [["kick", 0], ["kick", 1], ["kick", 2], ["kick", 3], ["snare", 1, 0.85], ["snare", 3, 0.85],
      ["hatOpen", 0.5, 0.7], ["hatOpen", 1.5, 0.7], ["hatOpen", 2.5, 0.7], ["hatOpen", 3.5, 0.7]],
    fill: { from: 3, hits: [["kick", 3], ["snare", 3, 0.7], ["snare", 3.25, 0.75], ["snare", 3.5, 0.85], ["snare", 3.75, 0.95]] },
  },
  march: {
    meter: "2/4", beats: 2,
    bar: () => [...eighths(2, "hat"), ["kick", 0], ["snare", 1]],
    fill: { from: 1, hits: [["snare", 1, 0.8], ["snare", 1.25, 0.7], ["snare", 1.5, 0.85], ["snare", 1.75, 0.95]] },
  },
  waltz: {
    meter: "3/4", beats: 3,
    bar: () => [["kick", 0], ["ride", 0, 0.9], ["snare", 1, 0.55], ["ride", 1, 0.7], ["snare", 2, 0.55], ["ride", 2, 0.7]],
    fill: { from: 2, hits: [["tomHi", 2, 0.85], ["tomHi", 2.5, 0.8], ["tomLo", 2.75, 0.9]] },
  },
  sixeight: {
    meter: "6/8", beats: 2,
    bar: (b) => [...tripletEighths(2, "hat"), ["kick", 0], ...(b % 2 ? [["kickSoft", 2 / 3, 0.7] as Hit] : []), ["snare", 1]],
    fill: { from: 1, hits: [["snare", 1, 0.9], ["tomHi", 4 / 3, 0.85], ["tomLo", 5 / 3, 0.95]] },
  },
  nineeight: {
    meter: "9/8", beats: 3,
    bar: () => [...tripletEighths(3, "hat"), ["kick", 0], ["kickSoft", 1, 0.75], ["snare", 2]],
    fill: { from: 2, hits: [["snare", 2, 0.9], ["tomHi", 7 / 3, 0.85], ["tomLo", 8 / 3, 0.95]] },
  },
  shuffle: {
    meter: "12/8", beats: 4,
    bar: () => [...tripletEighths(4, "ride", 0.9, 0.55), ["kick", 0], ["kick", 2, 0.9], ["snare", 1], ["snare", 3]],
    fill: { from: 3, hits: [["snare", 3, 0.8], ["snare", 10 / 3, 0.7], ["tomLo", 11 / 3, 0.95]] },
  },
};

const BARS = 8;

if (import.meta.main) {
  // The list of loops lives in the app's catalogue, so the two cannot drift apart.
  for (const loop of DRUM_LOOPS) {
    const { style, bpm } = loop;
    const id = drumLoopId(loop);
    if (process.env.ONLY && process.env.ONLY !== id) continue;
    const st = STYLES[style];
    if (st.meter !== loop.meter) throw new Error(`${id}: the ${style} pattern is in ${st.meter}`);
    const s = song({ pack: "Indie Rocker", bpm, beats: st.beats, bars: BARS, tailSec: 0, out: `public/backing/${id}`, loop: true });
    const kit: Record<Sound, ReturnType<typeof s.load>> = {
      kick: s.load("TS_IR_kick_straight_up_dry.wav", { trim: true }),
      kickSoft: s.load("TS_IR_kick_straight_up_soft.wav", { trim: true }),
      snare: s.load("TS_IR_snare_ringy_punch.wav", { trim: true }),
      hat: s.load("TS_IR_hats_15_warm_tight.wav", { trim: true }),
      hatOpen: s.load("TS_IR_hats_15_warm_open.wav", { trim: true }),
      ride: s.load("TS_IR_ride_vintage_ping.wav", { trim: true }),
      crash: s.load("TS_IR_crash_medium_thin_big.wav", { trim: true }),
      tomHi: s.load("TS_IR_tom_rack_balanced.wav", { trim: true }),
      tomLo: s.load("TS_IR_tom_floor_punch_attack.wav", { trim: true }),
    };
    /** RMS targets in dB: kick and snare forward, cymbals behind. */
    const target: Record<Sound, number> = {
      kick: -14, kickSoft: -16, snare: -16, hat: -25, hatOpen: -26, ride: -27, crash: -22, tomHi: -17, tomLo: -17,
    };
    const lv = Object.fromEntries((Object.keys(kit) as Sound[]).map((k) => [k, s.toLevel(kit[k], target[k])])) as Record<Sound, number>;
    // A little life in the loudness, the same every build; the timing stays exact.
    let seed = bpm * 31 + style.length;
    const wobble = () => 0.94 + ((seed = (seed * 16807) % 2147483647) / 2147483647) * 0.12;
    const play = (b: number, [sound, beat, v = 1]: Hit) => s.hit(kit[sound], b, beat, lv[sound] * v * wobble());

    for (let b = 0; b < BARS; b++) {
      const last = b === BARS - 1;
      for (const h of st.bar(b)) if (!last || h[1] < st.fill.from) play(b, h);
      if (last) for (const h of st.fill.hits) play(b, h);
    }
    play(0, ["crash", 0, 1]);
    s.write();
  }
}
