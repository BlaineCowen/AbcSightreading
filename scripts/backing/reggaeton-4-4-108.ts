/**
 * "Reggaeton (4/4, 108)": "Global Reggaeton", kit 02 - every loop at 108 BPM
 * in G, 2 or 4 bars: kick on every beat, the dembow snare, claps on 2 and 4,
 * hi-hats, two shakers, a busier full-kit loop, a loop that ends in a
 * fill, bass, a synth pluck, two risers, two impacts and a reversed stab. No
 * vocals: they would talk over the exercise. No congas either: tried, and they
 * did not fit.
 *
 *   count-in   kick on each beat, hi-hats
 *   1-4        intro: the pluck opening up from a low-pass, shaker, soft claps
 *   5-12       kick, dembow snare, hats, bass, pluck
 *   13-20      + a second shaker, claps
 *   21-28      new groove: the full-kit loop and its fills, shaker, bass, pluck
 *   29-32      breakdown: no kick, a riser building into
 *   33-40      everything
 *   end        kick, bass and pluck on the downbeat, an impact
 *
 * Transitions, kept sparing: one riser, through the breakdown into the last
 * section; a quiet impact where the beat comes in and where everything
 * returns; the drop into the new groove; the reversed stab and a stop before
 * 13, a stop before 21; the fill loop's own fill every 4 bars where it plays.
 *
 *   bun run scripts/backing/reggaeton-4-4-108.ts
 */
import { song } from "./engine";

const BARS = 40;
const TAIL = 3;
const s = song({ pack: "Global Reggaeton", bpm: 108, beats: 4, bars: BARS, tailSec: TAIL, out: "public/backing/reggaeton-4-4-108" });
const name = (part: string) => `FL_RA_KIT02_108_${part}.wav`;

const loop = {
  kick: s.load(name("KICK")),
  snare: s.load(name("SNARE")),
  clap: s.load(name("CLAP")),
  hat: s.load(name("HIHAT")),
  shakerA: s.load(name("SHAKER_A")),
  shakerB: s.load(name("SHAKER_B")),
  kit: s.load(name("DRUMS")),
  fillKit: s.load(name("DRUM_SFX")),
  bass: s.load(name("BASS_G")),
  pluck: s.load(name("PLUCK_G")),
  revStab: s.load(name("REV_STAB")),
};
const fx = {
  riser4: s.load(name("SFX_01")), // builds over 4 bars to the next downbeat
  drop: s.load(name("SFX_02")), // loud on the downbeat, falling away
  impact: s.load(name("SFX_04")), // a hit on the downbeat
};
// Single hits cut from the loops: the kick on beat 1.
const kickHit = s.slice(loop.kick, 0, s.beatSec);

/** RMS targets in dB: kick and bass forward, the dembow snare clear, percussion around them. */
const lv = {
  kick: s.toLevel(loop.kick, -15), snare: s.toLevel(loop.snare, -20), clap: s.toLevel(loop.clap, -22),
  hat: s.toLevel(loop.hat, -27), shakerA: s.toLevel(loop.shakerA, -27), shakerB: s.toLevel(loop.shakerB, -27),
  kit: s.toLevel(loop.kit, -17), fillKit: s.toLevel(loop.fillKit, -21),
  bass: s.toLevel(loop.bass, -17), pluck: s.toLevel(loop.pluck, -21), revStab: s.toLevel(loop.revStab, -22),
};
const fxLv = {
  riser4: s.toLevel(fx.riser4, -26), drop: s.toLevel(fx.drop, -24), impact: s.toLevel(fx.impact, -21),
};
const part = (k: keyof typeof loop, from: number, to: number, gain = 1, cut: Record<number, number> = {}) =>
  s.loop(loop[k], from, to, lv[k] * gain, cut);
/** An effect laid from the start of `bar`, aligned to the bar grid like a loop. */
const fxAt = (k: keyof typeof fx, bar: number, gain = 1) => s.lay(fx[k], { atSec: s.at(bar), gain: fxLv[k] * gain });

// Count-in: the kick on every beat with hi-hats, so the pulse is plain.
part("kick", -1, 0, 0.75);
part("hat", -1, 0, 1.3);

// 1-4 intro: the pluck opening up from a low-pass in one pass (the
// progression's 4 bars), shaker 16ths and soft claps for a pulse.
s.lay(loop.pluck, { atSec: s.at(0), fromSec: 0, lenSec: 4 * s.barSec, gain: lv.pluck * 1.4, lowpass: [450, 18000] });
part("shakerB", 0, 4, 1.1);
part("clap", 0, 4, 0.7);

// 5-12: kick, dembow snare, hats, bass, pluck. The stab and a stop lead into 13.
fxAt("impact", 4, 0.7);
part("kick", 4, 12, 1, { 11: 2 });
part("snare", 4, 12, 1, { 11: 3 });
part("hat", 4, 12);
part("bass", 4, 12);
part("pluck", 4, 12);
part("revStab", 11, 12);

// 13-20: + the other shaker and claps. A stop leads into 21.
part("kick", 12, 20, 1, { 19: 2 });
part("snare", 12, 20, 1, { 19: 2 });
part("clap", 12, 20);
part("hat", 12, 20);
part("shakerA", 12, 20);
part("bass", 12, 20);
part("pluck", 12, 20);

// 21-28: the new groove - the full-kit loop, with the fill loop on top (its
// fill falls on bars 24 and 28), shaker, bass, pluck. The drop is kept low:
// at full level it crashed over the change.
fxAt("drop", 20, 0.35);
part("kit", 20, 28);
part("fillKit", 20, 28);
part("shakerB", 20, 28, 0.9);
part("bass", 20, 28);
part("pluck", 20, 28);

// 29-32 breakdown: the kick drops out; bass, pluck, shaker and claps, a
// 4-bar riser building into the last section.
part("bass", 28, 32, 0.95);
part("pluck", 28, 32);
part("shakerB", 28, 32);
part("clap", 28, 32, 0.9);
fxAt("riser4", 28);

// 33-40: everything, the fill loop's fills on bars 36 and 40.
fxAt("impact", 32, 0.7);
part("kick", 32, 40);
part("snare", 32, 40);
part("clap", 32, 40);
part("hat", 32, 40);
part("shakerA", 32, 40);
part("fillKit", 32, 40);
part("bass", 32, 40);
part("pluck", 32, 40);

// Ending: kick, bass and pluck together on the downbeat, the impact under them.
s.hit(kickHit, BARS, 0, lv.kick * 1.1);
fxAt("impact", BARS, 0.8);
s.lay(loop.bass, { atSec: s.at(BARS), fromSec: 0, lenSec: TAIL, gain: lv.bass, fadeOut: TAIL * 0.85 });
s.lay(loop.pluck, { atSec: s.at(BARS), fromSec: 0, lenSec: TAIL, gain: lv.pluck, fadeOut: TAIL * 0.85 });

s.write();
