/**
 * "Daydream" (lo-fi, 4/4, 90): the major singalong track, take two. The first
 * take was the floaty synth pads over busy tape drums; Blaine wanted "simple
 * drums and a keyboard part instead of just dominant pads" (as Matinee does).
 *
 *   keys      a lo-fi piano comping the chords, played by hand: a stab on 1,
 *             a lighter one on 3. No piano loop in the library plays these
 *             chords, so they are built from two clean chords of "lofi on
 *             purpose"'s synthi piano (92 BPM): its Cmaj7, and its Em7 moved
 *             by SoundTouch - Am7 (up 5), Dm7 (down 2), and Fmaj7 is the Cmaj7
 *             up 5. C Am Dm Dm | C Am F F (I vi ii, I vi IV), a chord a bar.
 *   pad       the same pack's floaty synth chords (the first take's lead), now
 *             quiet underneath, in the fuller sections only.
 *   bass      one electric bass note ("superbloom"), played on each root.
 *   drums     the Madlib pack's dusty one-shots - kick, snare, closed hat - a
 *             simple beat with a little swing, varied by hand like Matinee's.
 *
 *   count-in   hat quarters
 *   1-4        the piano, quiet hats under it
 *   5-8        + bass and kick
 *   9-16       the full beat, the pad under it
 *   17-24      the same, the hats ringing longer
 *   25-28      kick and snare out: piano, bass, pad, hats
 *   29-32      everything
 *   33         Cmaj7, ringing
 *
 * SHIFT=<semitones> for the other keys (C is 0); OUT=<path, no extension>.
 */
import { song, RATE } from "./engine";
import { shiftChannels } from "../../src/lib/play-along/stretch";

const SHIFT = Number(process.env.SHIFT ?? 0);
const BARS = 33;
const s = song({
  pack: "lofi on purpose…Indie Alt Reveries",
  packs: ["superbloom by Bennett Littlejohn", "Madlib Sample Pack"],
  bpm: 90,
  beats: 4,
  bars: BARS,
  tailSec: 3,
  out: process.env.OUT ?? "public/backing/daydream-4-4-90",
  drive: 1.0,
  loudness: { lufs: -15, truePeak: -3 },
});

// ── The piano's chords, from two clean stabs of the synthi loop (92 BPM) ──────
const synthi = s.load("NH_IAR_92_piano_synthi_Cmaj.wav");
const beat92 = 60 / 92;
/** Its Cmaj7 (beats 0-2) and Em7 (beats 4-8), each with its ring. */
const cmaj7 = s.slice(synthi, 0, 2 * beat92);
const em7 = s.slice(synthi, 4 * beat92, 4 * beat92);
/** A shape moved to a chord, then to the key: whichever octave of the move is smaller. */
const moved = (shape: typeof cmaj7, semis: number) => {
  const total = semis + SHIFT;
  const best = [total, total - 12, total + 12].reduce((a, b) => (Math.abs(b) < Math.abs(a) ? b : a));
  return shiftChannels(shape, best, RATE);
};
const CHORD = { C: moved(cmaj7, 0), A: moved(em7, 5), D: moved(em7, -2), F: moved(cmaj7, 5) };
const ROOTS = ["C", "A", "D", "D", "C", "A", "F", "F"] as const;

const part = {
  pad: s.load("NH_IAR_90_synth_chords_floaty_Cmaj.wav", { shift: SHIFT }),
  bassLoop: s.load("NH_BL_90_bass_electric_liverleaf_Cmaj.wav"),
  kick: s.load("MADLIB_kick_dusted_punch.wav", { trim: true }),
  snare: s.load("MADLIB_snare_otis_reddy.wav", { trim: true }),
  hat: s.load("MADLIB_hihat_big_bar_closed.wav", { trim: true }),
};
const bassNote = s.slice(part.bassLoop, 0, 1.68); // a C2, 65.4 Hz
const lv = {
  piano: s.toLevel(CHORD.C, -17), pad: s.toLevel(part.pad, -27), bass: s.toLevel(bassNote, -20),
  kick: s.toLevel(part.kick, -17), snare: s.toLevel(part.snare, -18), hat: s.toLevel(part.hat, -24),
};

/** Played by hand: each hit a little early or late, a little louder or softer, the same every render. */
let seed = 90;
const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
const human = (src: typeof cmaj7, bar: number, at: number, gain: number, spread = 0.15, lenSec?: number) =>
  s.lay(src, { atSec: s.at(bar, at) + (rand() - 0.5) * 0.014, gain: gain * (1 - spread / 2 + rand() * spread), lenSec, fadeOut: lenSec ? 0.08 : undefined });

const chordAt = (bar: number) => ROOTS[((bar % 8) + 8) % 8];

/** The piano: the bar's chord on 1, ringing to 3; again on 3, lighter. */
function piano(from: number, to: number) {
  for (let b = from; b < to; b++) {
    const c = CHORD[chordAt(b)];
    human(c, b, 0, lv.piano, 0.12, 2 * s.beatSec);
    human(c, b, 2, lv.piano * 0.72, 0.12, 2 * s.beatSec + 0.4);
  }
}

/** The bass on the root: 1 held, a short one on the "and" of 3. In C; SHIFT moves it. */
const ROOT_HZ = { C: 65.41, A: 55.0, D: 73.42, F: 87.31 };
function bass(from: number, to: number) {
  const k = Math.pow(2, SHIFT / 12);
  const notes: { at: number; len: number; hz: number; v?: number }[] = [];
  for (let b = from; b < to; b++) {
    const hz = ROOT_HZ[chordAt(b)] * k;
    notes.push({ at: s.at(b), len: 2.6 * s.beatSec, hz });
    notes.push({ at: s.at(b, 2.5), len: 1.2 * s.beatSec, hz, v: 0.75 });
  }
  s.pitched(bassNote, 65.41, lv.bass, notes);
}

/** Lo-fi swing: the off-beat eighths a little late. */
const SWING = 0.07;
/** The beat. `kick`/`snare` on or off; `open` lets the hats ring on the off-beats. */
function drums(from: number, to: number, o: { kick: boolean; snare: boolean; hatGain?: number; open?: boolean }) {
  const shape = [1, 0.5, 0.8, 0.45, 0.95, 0.55, 0.8, 0.5];
  for (let b = from; b < to; b++) {
    if (o.kick) {
      human(part.kick, b, 0, lv.kick, 0.08);
      human(part.kick, b, 2.5 + SWING, lv.kick * 0.7, 0.1);
    }
    if (o.snare) {
      human(part.snare, b, 1, lv.snare, 0.1);
      human(part.snare, b, 3, lv.snare, 0.1);
    }
    for (let e = 0; e < 8; e++) {
      const at = e / 2 + (e % 2 ? SWING : 0);
      human(part.hat, b, at, lv.hat * (o.hatGain ?? 1) * shape[e], 0.15, o.open && e % 2 ? undefined : 0.12);
    }
  }
}

// Count-in: hat quarters.
for (let q = 0; q < 4; q++) human(part.hat, -1, q, lv.hat * 1.2, 0.05);

piano(0, 32);
drums(0, 4, { kick: false, snare: false, hatGain: 0.55 });
bass(4, 32);
drums(4, 8, { kick: true, snare: false });
drums(8, 16, { kick: true, snare: true });
s.loop(part.pad, 8, 28, lv.pad);
drums(16, 24, { kick: true, snare: true, open: true });
drums(24, 28, { kick: false, snare: false });
drums(28, 32, { kick: true, snare: true });
s.loop(part.pad, 28, 32, lv.pad);

// 33: Cmaj7, after the F. The piano's chord ringing, the bass's C, a last kick.
s.lay(CHORD.C, { atSec: s.at(32), gain: lv.piano, fadeOut: 1.2 });
s.pitched(bassNote, 65.41, lv.bass, [{ at: s.at(32), len: 1.6, hz: 65.41 * Math.pow(2, SHIFT / 12) }]);
human(part.kick, 32, 0, lv.kick, 0.05);

s.write();
