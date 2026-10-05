/**
 * "Trap (4/4, 70)". Trap is made at 140 and felt in half time, so it is
 * written here at 70: a bar is two of the loops' 140 bars, the snare on 2
 * and 4.
 *
 * The music is the "Dilip Sample Pack" - its "montreal" melodic loop (141,
 * A minor, 16 bars: an F-and-D phrase, then a contrasting one that turns to E)
 * and "lit off the gas" (144, A minor) as a second section, stretched to 140;
 * its long 808, kick and snare. The hi-hats come from the "Trap" pack. An
 * earlier version used the Trap pack's brass loop, which was its only melodic
 * loop and was not good enough.
 *
 * The 808s are real rage-trap 808 loops Blaine picked, from "OPIUM - RAGE
 * TYPE BEATS" (Origin Sound "808 filth", 150, D minor: D held, an A pickup)
 * and "RAGE TRAP 2" (Orbit "808 triad", 145, G# minor: G# moving to F#;
 * Dropgun "808 core", 148, a sustained C). Each is transposed to A - the
 * song's key, and a note that sits under every montreal chord (F, D minor,
 * E) - and stretched to 140. A programmed 808 line (one-shot figures with
 * slides) was tried first and was bad: these held, distorted 808s are the
 * sound.
 *
 *   count-in   hi-hats on the beat
 *   1-8        the beat from the first bar: montreal, the OPIUM 808 (A held, E pickup), snare on 2 and 4, hats
 *   9-12       lit off the gas over the Orbit 808 (A to G), a busier hat groove
 *   13-16      breakdown: montreal thinned to its top, no 808, a pickup back in
 *   17-24      everything: montreal in full, both halves, the OPIUM 808
 *   end        the Dropgun 808's sustained A, kick, the melody's first chord
 *
 *   bun run scripts/backing/trap-4-4-70.ts
 */
import { song } from "./engine";

const BARS = 24;
const TAIL = 3;
const s = song({ pack: "Dilip Sample Pack", bpm: 70, beats: 4, bars: BARS, tailSec: TAIL, out: "public/backing/trap-4-4-70" });
// Only for loading from other packs; they never write.
const from = (pack: string) => song({ pack, bpm: 70, beats: 4, bars: 1, tailSec: 0, out: "/dev/null" });
const trap = from("Trap");
const opium = from("OPIUM - RAGE TYPE BEATS");
const rage = from("RAGE TRAP 2");

// Loops at 141 and 144 are 70.5 and 72 in half time.
const loop = {
  montreal: s.load("DILIP_melodic_loop_montreal_141_Amin.wav", { fromBpm: 70.5 }),
  gas: s.load("DILIP_melodic_loop_litoffthegas_144_Amin.wav", { fromBpm: 72 }),
  hats: trap.load("trap_drm140_lowrise_hats.wav"),
};
const one = {
  kick: s.load("DILIP_kick_yall_thought_this_was_a_game.wav", { trim: true }),
  snare: s.load("DILIP_snare_dapper.wav", { trim: true }),
  hat: trap.load("trap_hat_anotherhat.wav", { trim: true }),
  roll: trap.load("trap_snroll_rapido.wav", { trim: true }),
};

// The 808 loops, each transposed to A (around 55 Hz) and stretched to 140
// (loops at 150, 145 and 148 are 75, 72.5 and 74 in half time).
const bass = {
  opium: opium.load("OS_RAGE_150_synth_bass_808_filth_Dm.wav", { fromBpm: 75, semitones: 7 }),
  orbit: rage.load("ORBIT_RT2_145_synth_bass_808_triad_G#m.wav", { fromBpm: 72.5, semitones: 1 }),
  core: rage.load("DS_RT2_148_bass_808_core_Cmin.wav", { fromBpm: 74, semitones: 9 }),
};

/** RMS targets in dB: 808 and snare forward, the melody and hats around them. */
const lv = {
  montreal: s.toLevel(loop.montreal, -19), gas: s.toLevel(loop.gas, -19), hats: s.toLevel(loop.hats, -27),
  opium: s.toLevel(bass.opium, -16), orbit: s.toLevel(bass.orbit, -16), core: s.toLevel(bass.core, -16),
  kick: s.toLevel(one.kick, -18), snare: s.toLevel(one.snare, -18),
  hat: s.toLevel(one.hat, -26), roll: s.toLevel(one.roll, -21),
};
const play = (k: keyof typeof loop, from: number, to: number, gain = 1, opts: { highpass?: number; startBar?: number } = {}) =>
  s.loop(loop[k], from, to, lv[k] * gain, {}, opts);
const hit = (k: keyof typeof one, bar: number, beat: number, v = 1) => s.hit(one[k], bar, beat, lv[k] * v);

/** An 808 loop under bars `from`..`to`, from its own start at `from`; the kick doubles its downbeats. */
function bass808(k: keyof typeof bass, from: number, to: number, v = 1) {
  s.loop(bass[k], from, to, lv[k] * v, {}, { startBar: from });
  for (let b = from; b < to; b++) hit("kick", b, 0, v);
}

/** Snare on 2 and 4, hi-hats on the eighths. */
function backbeat(from: number, to: number, hats = true, v = 1) {
  for (let b = from; b < to; b++) {
    hit("snare", b, 1, v); hit("snare", b, 3, v);
    if (hats) for (let e = 0; e < 8; e++) hit("hat", b, e / 2, e % 2 ? 0.6 : 0.9);
  }
}

/** A hi-hat roll over the last beat of `bar`: 32nds, then a triplet burst. */
function hatRoll(bar: number, v = 1) {
  for (let i = 0; i < 4; i++) hit("hat", bar, 3 + i * 0.125, (0.6 + i * 0.08) * v);
  for (let i = 0; i < 6; i++) hit("hat", bar, 3.5 + i / 12, (0.7 + i * 0.05) * v);
}

// Count-in: hi-hats on the beat, the first louder.
for (let beat = 0; beat < 4; beat++) hit("hat", -1, beat, beat === 0 ? 7 : 5.5);

// 1-8: the beat straight away, montreal over it.
play("montreal", 0, 8);
bass808("opium", 0, 8);
backbeat(0, 8);
hatRoll(3, 0.9);
hatRoll(7);

// 9-12: lit off the gas, a busier hat loop instead of eighths.
play("gas", 8, 12, 1, { startBar: 8 });
bass808("orbit", 8, 12);
backbeat(8, 12, false);
play("hats", 8, 12, 1, { startBar: 8 });
hit("roll", 11, 3, 1);

// 13-16 breakdown: montreal thinned to its top, snare on 4, no 808 or kick;
// the 808 comes back in on the "and" of 4.
play("montreal", 12, 16, 2.8, { highpass: 600, startBar: 12 });
for (let b = 12; b < 16; b++) {
  hit("snare", b, 3, 0.8);
  for (let e = 0; e < 8; e++) hit("hat", b, e / 2, e % 2 ? 0.7 : 1.1);
}
hit("kick", 15, 3.5);
hatRoll(15, 1.1);

// 17-24: everything - montreal from its start, both halves.
play("montreal", 16, 24, 1.05, { startBar: 16 });
bass808("opium", 16, 24, 1.1);
backbeat(16, 24, true, 1.1);
play("hats", 16, 24, 0.7, { startBar: 16 });
hatRoll(19, 0.9);
hatRoll(23, 1.2);

// Ending: the Dropgun 808's sustained A, the kick, the melody's first chord fading.
s.lay(bass.core, { atSec: s.at(BARS), fromSec: 0, lenSec: TAIL, gain: lv.core, fadeOut: TAIL * 0.7 });
hit("kick", BARS, 0, 1.1);
s.lay(loop.montreal, { atSec: s.at(BARS), fromSec: 0, lenSec: TAIL, gain: lv.montreal, fadeOut: TAIL * 0.85 });

s.write();
