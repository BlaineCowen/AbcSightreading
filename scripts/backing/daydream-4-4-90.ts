/**
 * "Daydream" (4/4, 90): the second singalong track, lo-fi. Loops that
 * splice-graph matched across three packs:
 *
 *   harmony   "lofi on purpose... Indie Alt Reveries": the floaty synth chords,
 *             C major, 90 BPM, 8 bars, every change on a barline:
 *             C Am Dm Dm | C Am F F  (I vi ii, I vi IV).
 *   bass      one note from "superbloom"'s electric bass loop (its opening C2,
 *             held 1.7 s, pitch clear), played on each chord's root the way a
 *             sampler would - so the bass is a real bass guitar and always on
 *             the harmony (the loop itself plays its own line, nearer F minor).
 *   drums     "Tape Drums by Tamuz": two boom-bap loops at 90, clean and
 *             trashy.
 *
 *   count-in   the drums' cymbals
 *   1-8        the chords opening from a low-pass; cymbals from 5
 *   9-16       the clean tape drums and the bass
 *   17-24      the trashy drums
 *   25-28      the drums drop out: chords and bass
 *   29-32      everything
 *   33         C, ringing
 *
 * Keys as Barefoot: SHIFT=<semitones> moves the chords (SoundTouch) and the
 * bass (its notes, resampled); OUT=<path, no extension>.
 *
 *   SHIFT=2 OUT=/tmp/daydream-D bun run scripts/backing/daydream-4-4-90.ts
 */
import { song } from "./engine";

const SHIFT = Number(process.env.SHIFT ?? 0);
const BARS = 33;
const s = song({
  pack: "lofi on purpose…Indie Alt Reveries",
  packs: ["superbloom by Bennett Littlejohn", "Tape Drums by Tamuz", "Lavish Lofi & Hip Hop"],
  bpm: 90,
  beats: 4,
  bars: BARS,
  tailSec: 3,
  out: process.env.OUT ?? "public/backing/daydream-4-4-90",
  drive: 1.0,
  // As Barefoot: about -15 LUFS, every key under -1 dBFS true peak on the MP3.
  loudness: { lufs: -15, truePeak: -3 },
});

const part = {
  chords: s.load("NH_IAR_90_synth_chords_floaty_Cmaj.wav", { shift: SHIFT }),
  bassLoop: s.load("NH_BL_90_bass_electric_liverleaf_Cmaj.wav"),
  clean: s.load("TAMUZ_TD_90_drum_clean_loose.wav"),
  trashy: s.load("TAMUZ_TD_90_drum_best_simple_trashy.wav"),
  tents: s.load("BOS_LL_90_Drum_Full_Loop_Tents.wav"),
};
/** The bass note: the loop's first 1.68 s, a C2 (65.4 Hz). */
const bassNote = s.slice(part.bassLoop, 0, 1.68);
const C2 = 65.41;

const lv = {
  // Measured per section: the bass sat above the low mids at -19, so -21.
  chords: s.toLevel(part.chords, -18), bass: s.toLevel(bassNote, -21),
  clean: s.toLevel(part.clean, -18), trashy: s.toLevel(part.trashy, -18), tents: s.toLevel(part.tents, -18),
};

/** The chords' bars: the loop's own 8, so bar n is chord n mod 8. */
const CHORD_ROOTS = ["C", "A", "D", "D", "C", "A", "F", "F"];
/** Each root's bass note and the fifth below it (Hz, in C; SHIFT moves them). */
const BASS: Record<string, [number, number]> = {
  C: [65.41, 49.0], // C2, G1
  A: [55.0, 82.41], // A1, E2 (the fifth above: E1 is too low to speak)
  D: [73.42, 55.0], // D2, A1
  F: [87.31, 65.41], // F2, C2
};
const shifted = (hz: number) => hz * Math.pow(2, SHIFT / 12);

/**
 * The bass line, a bar at a time: the root on 1, held; the fifth on the "and"
 * of 3, short; the root again on 4 - the loop's own lazy shape, on the chord.
 */
function bassBars(from: number, to: number, gain: number) {
  const notes: { at: number; len: number; hz: number }[] = [];
  for (let b = from; b < to; b++) {
    const [root, fifth] = BASS[CHORD_ROOTS[((b % 8) + 8) % 8]];
    notes.push({ at: s.at(b), len: 2.4 * s.beatSec, hz: shifted(root) });
    notes.push({ at: s.at(b, 2.5), len: 0.4 * s.beatSec, hz: shifted(fifth) });
    notes.push({ at: s.at(b, 3), len: 0.9 * s.beatSec, hz: shifted(root) });
  }
  s.pitched(bassNote, C2, gain, notes);
}
const cymbals = (from: number, to: number) => s.loop(part.clean, from, to, lv.clean * 0.8, {}, { startBar: from, highpass: 3000 });
const drums = (k: "clean" | "trashy", from: number, to: number) => s.loop(part[k], from, to, lv[k], {}, { startBar: from });

// Count-in, and the chords opening up from a muffled low-pass over the first 8 bars.
cymbals(-1, 0);
s.lay(part.chords, { atSec: s.at(0), lenSec: 8 * s.barSec, gain: lv.chords, lowpass: [900, 16000] });
cymbals(4, 8);

// 9-32: the chords straight on.
s.loop(part.chords, 8, 32, lv.chords);

// 9-16 clean drums and the bass; 17-24 the trashy loop; 25-28 out; 29-32 back.
drums("clean", 8, 16);
drums("trashy", 16, 24);
drums("trashy", 28, 32);
// Air: the synth chords have almost nothing above 3 kHz and the tape drums are
// dull (those sections measured -37 dB up there, against Barefoot's -28), so
// the top of a lo-fi kit from a third pack (Lavish Lofi's "Tents") rides
// over the drum sections (-30.5 dB above 3 kHz, warmer than Barefoot's -28);
// the tape loops' own cymbals were too dull to.
s.loop(part.tents, 8, 24, lv.tents * 2.0, {}, { startBar: 8, highpass: 3500 });
s.loop(part.tents, 28, 32, lv.tents * 2.0, {}, { startBar: 28, highpass: 3500 });
bassBars(8, 32, lv.bass);

// 33: C, the chords' first bar ringing, the bass's C held, a last hit.
s.lay(part.chords, { atSec: s.at(32), lenSec: s.barSec + 2.5, gain: lv.chords, fadeOut: 2.5 });
s.pitched(bassNote, C2, lv.bass, [{ at: s.at(32), len: 1.68 * 0.99, hz: shifted(65.41) }]);
s.lay(part.trashy, { atSec: s.at(32), lenSec: s.beatSec, gain: lv.trashy, fadeOut: 0.3 });

s.write();
