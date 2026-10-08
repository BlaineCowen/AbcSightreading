/**
 * "Matinee" (4/4, 86): a minor singalong track, soul. Blaine passed on the
 * lo-fi (Daydream: pads and busy tape drums) and asked for simple drums and a
 * keyboard part; this is that, from one pack, "Sampled Soul - Vintage Song
 * Starters", its "movie" song:
 *
 *   keys      the electric piano's chords, B-flat minor, 86 BPM, a 4-bar
 *             cycle twice: Bbm7 six beats, Fm7 two, Ebm two bars (i v iv).
 *   bass      the song's electric bass guitar, on the same chords.
 *   drums     played from the pack's one-shots, a plain beat: kick on 1 and 3,
 *             the Motown snare on 2 and 4, tight hi-hat eighths (the easy
 *             ride in the second verse), a crash at each section.
 *
 *   count-in   hi-hat quarters
 *   1-4        the piano alone
 *   5-8        + bass and hi-hats
 *   9-16       the full beat
 *   17-24      the ride for the hi-hats
 *   25-28      kick and snare out: piano, bass, hats
 *   29-32      everything, a snare roll into it
 *   33         the home chord, i, ringing
 *
 * Keys: B-flat minor is not one of the page's minor keys, so A minor (SHIFT=-1)
 * is its home; every minor key is within 5 semitones of one render.
 *
 *   SHIFT=-1 OUT=/tmp/matinee-Am bun run scripts/backing/matinee-4-4-86.ts
 */
import { song } from "./engine";

const SHIFT = Number(process.env.SHIFT ?? -1);
const BARS = 33;
const s = song({
  pack: "Sampled Soul - Vintage Song Starters",
  bpm: 86,
  beats: 4,
  bars: BARS,
  tailSec: 3,
  out: process.env.OUT ?? "public/backing/matinee-4-4-86",
  drive: 1.0,
  loudness: { lufs: -15, truePeak: -3 },
});

const part = {
  keys: s.load("OS_SS_86_electric_piano_chords_movie_A#m.wav", { shift: SHIFT }),
  bass: s.load("OS_SS_86_electric_bass_guitar_movie_A#m.wav", { shift: SHIFT }),
  kick: s.load("OS_SS_kick_beefy.wav", { trim: true }),
  snare: s.load("OS_SS_snare_motown.wav", { trim: true }),
  hat: s.load("OS_SS_hihat_tight.wav", { trim: true }),
  hatOpen: s.load("OS_SS_hihat_loose.wav", { trim: true }),
  ride: s.load("OS_SS_ride_easy.wav", { trim: true }),
  crash: s.load("OS_SS_crash_bright.wav", { trim: true }),
  roll: s.load("OS_SS_perc_snare_roll.wav", { trim: true }),
};

const lv = {
  keys: s.toLevel(part.keys, -17), bass: s.toLevel(part.bass, -19),
  // Measured: at -19/-20 the full beat was no louder than the hats alone, and
  // the hats read 10 dB under the ride above 3 kHz (a short, dark sample); so
  // the kick and snare up 3 dB and the hats 7.
  kick: s.toLevel(part.kick, -16), snare: s.toLevel(part.snare, -17),
  hat: s.toLevel(part.hat, -21), hatOpen: s.toLevel(part.hatOpen, -23), ride: s.toLevel(part.ride, -29),
  crash: s.toLevel(part.crash, -25), roll: s.toLevel(part.roll, -24),
};

/** Bars `from`..`to` of a plain beat; `top` is the hi-hats or the ride, `backbeat` the kick and snare. */
function beat(from: number, to: number, o: { top: "hat" | "ride"; backbeat: boolean }) {
  for (let b = from; b < to; b++) {
    if (o.backbeat) {
      s.hit(part.kick, b, 0, lv.kick);
      s.hit(part.kick, b, 2, lv.kick);
      s.hit(part.snare, b, 1, lv.snare);
      s.hit(part.snare, b, 3, lv.snare);
    }
    if (o.top === "ride") {
      for (let q = 0; q < 4; q++) s.hit(part.ride, b, q, lv.ride * (q % 2 ? 0.8 : 1));
    } else {
      // Eighths, the off-beats a touch softer; the last "and" opens up.
      for (let e = 0; e < 8; e++) {
        if (e === 7) s.hit(part.hatOpen, b, 3.5, lv.hatOpen);
        else s.hit(part.hat, b, e / 2, lv.hat * (e % 2 ? 0.7 : 1));
      }
    }
  }
}

// Count-in: four hi-hat quarters.
for (let q = 0; q < 4; q++) s.hit(part.hat, -1, q, lv.hat * 1.3);

// The piano straight through; the bass from 5.
s.loop(part.keys, 0, 32, lv.keys);
s.loop(part.bass, 4, 32, lv.bass);

beat(4, 8, { top: "hat", backbeat: false });
s.hit(part.crash, 8, 0, lv.crash);
beat(8, 16, { top: "hat", backbeat: true });
s.hit(part.crash, 16, 0, lv.crash);
beat(16, 24, { top: "ride", backbeat: true });
beat(24, 28, { top: "hat", backbeat: false });
// A snare roll on the last beat of 28, into the last section.
s.lay(part.roll, { atSec: s.at(28) - part.roll[0].length / 44100, gain: lv.roll });
s.hit(part.crash, 28, 0, lv.crash);
beat(28, 32, { top: "hat", backbeat: true });

// 33: home, i, after the iv. The piano's first bar ringing, the bass's, a crash and a last kick.
s.lay(part.keys, { atSec: s.at(32), lenSec: s.barSec + 2.5, gain: lv.keys, fadeOut: 2.5 });
s.lay(part.bass, { atSec: s.at(32), lenSec: s.barSec + 1.5, gain: lv.bass, fadeOut: 1.5 });
s.hit(part.crash, 32, 0, lv.crash);
s.hit(part.kick, 32, 0, lv.kick);

s.write();
