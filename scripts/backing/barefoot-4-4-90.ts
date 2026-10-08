/**
 * "Barefoot" (4/4, 90): the first singalong track - a backing with harmony,
 * for the pitched play-along, made from loops that splice-graph matched
 * across two packs (~/Projects/splice-graph: `sgraph neighbors
 * CO_XC_90_guitar_acoustic_strum_barefoot_chorus_Cmaj`):
 *
 *   harmony   Crossover Country's "barefoot" chorus: an acoustic strum and its
 *             bass guitar, C major, 90 BPM, two bars a chord over 8 bars. The
 *             loop is cut starting on F (IV C V vi); read from its C instead
 *             (`HOME`), the track runs I V vi IV, C G Am F. Started on the F,
 *             the ear heard home arrive two bars in, so every section change
 *             (the drums at 9, the lift at 17) landed two bars early against
 *             the phrase (Blaine: "the drums coming in too early").
 *   drums     Indie Rocker's 90 BPM kit (TS_IR): a full loop, felt hats, a
 *             cymbal course and fills - the graph's best drum match.
 *
 * Every pitched part follows the one progression, so a line can be written
 * over it (the pack's intro guitars play other chords and are left out).
 *
 *   count-in   felt hats
 *   1-8        the strum and the hats; the bass from 5
 *   9-16       the full kit; a fill into 17
 *   17-24      a lift: strum, bass, hats and the cymbal course; a ride swell
 *              through 21-24 into the last section
 *   25-32      everything; toms into the end
 *   33         the home chord, C, ringing with a crash
 *
 * Keys: SHIFT=<semitones> moves the strum and the bass (SoundTouch, timing
 * kept; drums have no key) - C is 0, D 2, F 5, G -5 - so a few renders cover
 * every key within a few semitones of one. OUT=<path, no extension>.
 *
 *   SHIFT=2 OUT=/tmp/barefoot-D bun run scripts/backing/barefoot-4-4-90.ts
 */
import { song } from "./engine";

const SHIFT = Number(process.env.SHIFT ?? 0);
const BARS = 33;
const s = song({
  pack: "Crossover Country",
  packs: ["Indie Rocker"],
  bpm: 90,
  beats: 4,
  bars: BARS,
  tailSec: 3,
  out: process.env.OUT ?? "public/backing/barefoot-4-4-90",
  // Mastered to sit with the other tracks (-14 to -17 LUFS) with the encoded
  // true peak under -1 dBFS: a little drive into the limiter, then loudnorm at
  // the encode (by sample peaks alone it read +1.1 dBFS true peak).
  drive: 1.0,
  // loudnorm holds the peak before the MP3 encoder adds a dB or two: -3 here
  // keeps every key under -1 dBFS true peak on the MP3, at about -15 LUFS.
  loudness: { lufs: -15, truePeak: -3 },
});

const part = {
  strum: s.load("CO_XC_90_guitar_acoustic_strum_barefoot_chorus_Cmaj.wav", { shift: SHIFT }),
  bass: s.load("CO_XC_90_bass_guitar_barefoot_chorus_Cmaj.wav", { shift: SHIFT }),
  drums: s.load("TS_IR_90_drum_chorus_then_verse.wav"),
  hats: s.load("TS_IR_90_hats_felt_out.wav"),
  cymbals: s.load("TS_IR_90_drum_cymbal_course.wav"),
  fill: s.load("TS_IR_90_drum_fill_quick_around.wav"),
  swell: s.load("TS_IR_90_drum_fill_ride_swell.wav"),
  toms: s.load("TS_IR_90_drum_fill_snare_round_toms.wav"),
};

/** RMS targets in dB: the strum carries the harmony, the drums under it, the bass between. */
const lv = {
  strum: s.toLevel(part.strum, -18), bass: s.toLevel(part.bass, -20), drums: s.toLevel(part.drums, -18),
  hats: s.toLevel(part.hats, -25), cymbals: s.toLevel(part.cymbals, -25),
  fill: s.toLevel(part.fill, -18), swell: s.toLevel(part.swell, -21), toms: s.toLevel(part.toms, -18),
};
/** The harmony's loops read from their bar 3, the C, so bar 1 of the song is home. */
const HOME = -2;
// Mastering (measured per section, 120-500 Hz was every section's loudest band:
// the strum's body on top of the bass guitar): the strum keeps nothing below
// 150 Hz, so the bass owns the bottom.
const harmony = (k: "strum" | "bass", from: number, to: number) =>
  s.loop(part[k], from, to, lv[k], {}, { startBar: HOME, highpass: k === "strum" ? 150 : undefined });
const drumsFrom = (k: "drums" | "hats" | "cymbals", from: number, to: number) => s.loop(part[k], from, to, lv[k], {}, { startBar: from });

// Count-in and the opening: the strum alone with the felt hats, the bass joining.
drumsFrom("hats", -1, 8);
harmony("strum", 0, 32);
harmony("bass", 4, 32);

// 9-16: the full kit, a fill into 17. The felt hats carry on under it, low: the
// kit loop is dark, and its sections measured 4 dB less above 3 kHz than the lift.
drumsFrom("drums", 8, 15);
s.loop(part.hats, 8, 15, lv.hats * 0.9, {}, { startBar: 8 });
s.lay(part.fill, { atSec: s.at(15), gain: lv.fill });

// 17-24: lifted out: hats and the cymbal course, then the ride swell building into 25.
drumsFrom("hats", 16, 20);
drumsFrom("cymbals", 16, 20);
s.lay(part.swell, { atSec: s.at(20), lenSec: 4 * s.barSec, gain: lv.swell });

// 25-32: everything, toms into the end.
drumsFrom("drums", 24, 31);
s.loop(part.hats, 24, 31, lv.hats * 0.9, {}, { startBar: 24 });
s.lay(part.toms, { atSec: s.at(31), gain: lv.toms });

// 33: home, after the IV. The strum's C (its bars 3-4) held and let ring, the bass's C, the kit's opening crash.
const ring = s.barSec + 2.5;
s.lay(part.strum, { atSec: s.at(32), fromSec: 2 * s.barSec, lenSec: ring, gain: lv.strum, fadeOut: 2.5, highpass: 150 });
s.lay(part.bass, { atSec: s.at(32), fromSec: 2 * s.barSec, lenSec: ring, gain: lv.bass, fadeOut: 2.5 });
s.lay(part.drums, { atSec: s.at(32), lenSec: 1.5 * s.beatSec + 2, gain: lv.drums, fadeOut: 2 });

s.write();
