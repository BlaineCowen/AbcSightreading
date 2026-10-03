/**
 * "Soul band (4/4, 80)": "Sampled Soul - Vintage Song Starters", whose "fall
 * in love" stems are all 80 BPM, A#m, 8 bars, plus its drum loops and hits.
 *
 *   count-in   hi-hat on each beat, a soft kick on 1
 *   1-4        intro: the electric piano opening up from a low-pass, light hats
 *   5-12       drums (pack loop "brooks") + bass + electric piano
 *   13-20      + acoustic guitar
 *   21-24      new groove (loop "lunar"), strings and electric guitar
 *   25-28      breakdown: thin drums, bass, strings, the sax melody enters
 *   29-32      everything
 *   end        crash, kick and the home chord
 *
 * Transitions: a reversed crash swelling into each big section, snare fills,
 * a stop before the new groove, a crash on each section's downbeat.
 *
 *   bun run scripts/backing/soul-4-4-80.ts
 */
import { song } from "./engine";

const BARS = 32;
const TAIL = 4;
const s = song({ pack: "Sampled Soul - Vintage Song Starters", bpm: 80, beats: 4, bars: BARS, tailSec: TAIL, out: "public/backing/soul-4-4-80" });

const stem = {
  bass: s.load("OS_SS_80_electric_bass_guitar_fall_in_love_A#m.wav"),
  keys: s.load("OS_SS_80_electric_piano_chords_fall_in_love_A#m.wav"),
  acoustic: s.load("OS_SS_80_acoustic_guitar_chords_fall_in_love_A#m.wav"),
  electric: s.load("OS_SS_80_electric_guitar_chords_fall_in_love_A#m.wav"),
  strings: s.load("OS_SS_80_strings_chords_fall_in_love_A#m.wav"),
  sax: s.load("OS_SS_80_saxophone_melody_fall_in_love_A#m.wav"),
  drumsA: s.load("OS_SS_80_drum_loop_brooks.wav"),
  // The pack's other groove, recorded at 74; a small stretch to 80.
  drumsB: s.load("OS_SS_74_drum_loop_lunar_resampled.wav", { fromBpm: 74 }),
};
const one = {
  kick: s.load("OS_SS_kick_beefy.wav", { trim: true }),
  snare: s.load("OS_SS_snare_motown.wav", { trim: true }),
  snareTight: s.load("OS_SS_snare_tight.wav", { trim: true }),
  roll: s.load("OS_SS_perc_snare_roll.wav", { trim: true }),
  hat: s.load("OS_SS_hihat_tight.wav", { trim: true }),
  crash: s.load("OS_SS_crash_bright.wav", { trim: true }),
  ride: s.load("OS_SS_ride_easy.wav", { trim: true }),
};
const swell = s.reversed(one.crash);

/** RMS targets in dB: drums forward, bass under them, chords behind, the sax melody on top. */
const lv = {
  drumsA: s.toLevel(stem.drumsA, -17), drumsB: s.toLevel(stem.drumsB, -17.5), bass: s.toLevel(stem.bass, -19),
  keys: s.toLevel(stem.keys, -23), acoustic: s.toLevel(stem.acoustic, -24), electric: s.toLevel(stem.electric, -25),
  strings: s.toLevel(stem.strings, -25), sax: s.toLevel(stem.sax, -21),
  kick: s.toLevel(one.kick, -13), snare: s.toLevel(one.snare, -15), snareTight: s.toLevel(one.snareTight, -17),
  roll: s.toLevel(one.roll, -18), hat: s.toLevel(one.hat, -24), crash: s.toLevel(one.crash, -22),
  ride: s.toLevel(one.ride, -26), swell: s.toLevel(swell, -24),
};
const part = (k: keyof typeof stem, from: number, to: number, gain = 1, cut: Record<number, number> = {}) =>
  s.loop(stem[k], from, to, lv[k] * gain, cut);
const hit = (k: keyof typeof one, bar: number, beat: number, v = 1) => s.hit(one[k], bar, beat, lv[k] * v);
const swellInto = (bar: number) => s.into(swell, bar, lv.swell);

// Count-in: hi-hats on the beat, loud enough to count from, a soft kick on 1.
for (let b = 0; b < 4; b++) hit("hat", -1, b, b === 0 ? 2.6 : 2.2);
hit("kick", -1, 0, 0.5);

// 1-4 intro: one continuous pass of the piano (bars 1-4 of the progression),
// so the filter sweeps smoothly, and the same piano as the next section.
s.lay(stem.keys, { atSec: s.at(0), fromSec: 0, lenSec: 4 * s.barSec, gain: lv.keys * 1.7, lowpass: [700, 18000] });
for (let b = 0; b < 4; b++) {
  for (let beat = 0; beat < 4; beat++) hit("hat", b, beat, beat % 2 ? 1.5 : 1.8);
  hit("kick", b, 0, 0.7);
}
hit("roll", 3, 3.5, 0.9);
swellInto(4);

// 5-12: drums, bass, electric piano. A fill at the end leads into the guitar.
part("drumsA", 4, 12, 1, { 11: 3 });
part("bass", 4, 12);
part("keys", 4, 12);
hit("crash", 4, 0);
hit("snare", 11, 3, 0.9); hit("snare", 11, 3.5, 0.75); hit("snareTight", 11, 3.75, 0.7);

// 13-20: + acoustic guitar. At the end the band stops on beat 3 for the change.
part("drumsA", 12, 20, 1, { 15: 3.5, 19: 2 });
part("bass", 12, 20);
part("keys", 12, 20, 0.8);
part("acoustic", 12, 20);
hit("crash", 12, 0, 0.9);
hit("snareTight", 15, 3.5, 0.7);
hit("kick", 19, 2, 0.9); hit("snare", 19, 2, 0.9);
hit("roll", 19, 3, 0.8); hit("roll", 19, 3.5, 1);
swellInto(20);

// 21-24: the new groove; strings take the chords, electric guitar comps.
part("drumsB", 20, 24, 1, { 23: 3 });
part("bass", 20, 24);
part("strings", 20, 24);
part("electric", 20, 24);
hit("crash", 20, 0);
hit("snare", 23, 3, 0.85); hit("snareTight", 23, 3.25, 0.6); hit("snare", 23, 3.5, 0.9); hit("snareTight", 23, 3.75, 0.7);

// 25-28 breakdown: kick, hats and a ride, so the sax melody comes through.
for (let b = 24; b < 28; b++) {
  hit("kick", b, 0, 0.9); hit("kick", b, 2, 0.75); hit("snare", b, 1, 0.6); hit("snare", b, 3, 0.6);
  for (let e = 0; e < 8; e++) hit(b >= 26 ? "ride" : "hat", b, e / 2, e % 2 ? 0.55 : 0.85);
}
part("bass", 24, 28);
part("strings", 24, 28, 0.9);
part("sax", 24, 28);
hit("crash", 24, 0, 0.8);
for (let e = 4; e < 8; e++) hit("snare", 27, e / 2, 0.5 + e * 0.06);
swellInto(28);

// 29-32: everything.
part("drumsA", 28, 32, 1, { 31: 3 });
part("bass", 28, 32);
part("strings", 28, 32);
part("sax", 28, 32);
part("acoustic", 28, 32, 0.85);
hit("crash", 28, 0);
hit("snare", 31, 3, 0.9); hit("snare", 31, 3.5, 0.8); hit("snareTight", 31, 3.75, 0.8);

// Ending: crash and kick, the home chord (bar 1 of the progression) ringing out.
hit("crash", BARS, 0, 1.1);
hit("kick", BARS, 0, 1.1);
for (const k of ["bass", "strings", "keys", "acoustic"] as const) {
  s.lay(stem[k], { atSec: s.at(BARS), fromSec: 0, lenSec: TAIL, gain: lv[k] * (k === "keys" ? 0.9 : 1), fadeOut: TAIL * 0.8 });
}

s.write();
