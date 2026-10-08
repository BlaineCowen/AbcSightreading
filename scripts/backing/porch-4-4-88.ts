/**
 * "Porch" (blues shuffle, 4/4, 88): a plain twelve-bar blues to sing over,
 * in place of the lo-fi (Blaine: "lofi isn't really the best to sing along
 * to"). The Splice library has no blues pack, so the piano and bass are
 * played note by note from the FluidR3 soundfont (soundfont.ts), and the
 * drums from the Sampled Soul pack's one-shots. Played, not looped, so every
 * key is rendered exactly, with no pitch shifting.
 *
 *   form      I I I I | IV IV I I | V IV I V, three times: three four-bar
 *             phrases a chorus, 36 bars, the play-along's length at 4/4.
 *             The I is a sixth chord (C E G A), the IV too (F A C D), so
 *             nothing in them rubs against a sung ti or mi; only the V is a
 *             seventh (G B D F).
 *   piano     shuffle comping, played by hand: short chords on 2 and 4 and the
 *             swung "and" after 2, a lighter one on 1; a second figure
 *             answering every other bar.
 *   bass      a walking boogie in quarters: 1 3 5 6 up, 8 6 5 3 back down.
 *   drums     a shuffle: kick on 1 and 3, snare on 2 and 4, the hi-hat on
 *             every beat and its swung "let"; the ride in the last chorus.
 *
 *   count-in   hi-hat quarters
 *   1-12       piano and bass, the hats and kick; the snare from 5
 *   13-24      the full shuffle, a snare roll into 25
 *   25-36      the ride, a crash at 25
 *   37         the I, ringing
 *
 * SHIFT=<semitones> for the other keys (C is 0); OUT=<path, no extension>.
 */
import { song } from "./engine";
import { soundfontNote } from "./soundfont";

const SHIFT = Number(process.env.SHIFT ?? 0);
const BARS = 37;
const s = song({
  pack: "Sampled Soul - Vintage Song Starters",
  bpm: 88,
  beats: 4,
  bars: BARS,
  tailSec: 3,
  out: process.env.OUT ?? "public/backing/porch-4-4-88",
  drive: 1.0,
  loudness: { lufs: -15, truePeak: -3 },
});

/** The swung "and": the last third of the beat (a shuffle's triplet). */
const AND = 2 / 3;

const drum = {
  kick: s.load("OS_SS_kick_beefy.wav", { trim: true }),
  snare: s.load("OS_SS_snare_motown.wav", { trim: true }),
  hat: s.load("OS_SS_hihat_tight.wav", { trim: true }),
  hatOpen: s.load("OS_SS_hihat_loose.wav", { trim: true }),
  ride: s.load("OS_SS_ride_easy.wav", { trim: true }),
  crash: s.load("OS_SS_crash_bright.wav", { trim: true }),
  roll: s.load("OS_SS_perc_snare_roll.wav", { trim: true }),
};
type Sound = typeof drum.kick;

/** A soundfont note, loaded once. */
const notes = new Map<string, Sound>();
const note = (inst: string, midi: number) => {
  const k = `${inst}:${midi}`;
  if (!notes.has(k)) notes.set(k, s.load(soundfontNote(inst, midi), { trim: true }));
  return notes.get(k)!;
};
const PIANO = "acoustic_grand_piano", BASS = "electric_bass_finger";

const lv = {
  // Each soundfont note is levelled as one: middle C's.
  piano: s.toLevel(note(PIANO, 60), -21), bass: s.toLevel(note(BASS, 36), -16),
  kick: s.toLevel(drum.kick, -16), snare: s.toLevel(drum.snare, -18),
  hat: s.toLevel(drum.hat, -22), hatOpen: s.toLevel(drum.hatOpen, -24), ride: s.toLevel(drum.ride, -31),
  crash: s.toLevel(drum.crash, -25), roll: s.toLevel(drum.roll, -24),
};

/** Played by hand: each hit a little early or late, a little louder or softer, the same every render. */
let seed = 88;
const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
const human = (src: Sound, bar: number, at: number, gain: number, spread = 0.15, lenSec?: number) =>
  s.lay(src, {
    atSec: s.at(bar, at) + (rand() - 0.5) * 0.014,
    gain: gain * (1 - spread / 2 + rand() * spread),
    lenSec, fadeOut: lenSec ? 0.06 : undefined,
  });

// ── The form ─────────────────────────────────────────────────────────────────
const FORM = ["I", "I", "I", "I", "IV", "IV", "I", "I", "V", "IV", "I", "V"] as const;
type Fn = (typeof FORM)[number];
const chordAt = (bar: number): Fn => FORM[bar % 12];

/** Piano voicings in C, around middle C: I6, IV6, V7. Moved to the key by SHIFT. */
const VOICING: Record<Fn, number[]> = { I: [55, 57, 60, 64], IV: [57, 60, 62, 65], V: [55, 59, 62, 65] };
/** Bass roots in C (C2, F2, G2) and the boogie's steps from the root. */
const ROOT: Record<Fn, number> = { I: 36, IV: 41, V: 43 };
const UP = [0, 4, 7, 9], DOWN = [12, 9, 7, 4];

function chord(bar: number, at: number, v: number, beats: number) {
  const len = beats * s.beatSec;
  for (const m of VOICING[chordAt(bar)]) human(note(PIANO, m + SHIFT), bar, at + (rand() - 0.5) * 0.01, lv.piano * v, 0.12, len);
}

/** The piano: figure A (1 light, 2, its swung "and", 4) and, every other bar, B (the "and" of 1, 3, the "and" of 3). */
function piano(from: number, to: number) {
  for (let b = from; b < to; b++) {
    if (b % 2 === 0) {
      chord(b, 0, 0.55, 0.5);
      chord(b, 1, 1, 0.4);
      chord(b, 1 + AND, 0.7, 0.3);
      chord(b, 3, 0.95, 0.4);
    } else {
      chord(b, AND, 0.7, 0.3);
      chord(b, 1, 0.9, 0.4);
      chord(b, 2 + AND, 0.75, 0.3);
      chord(b, 3, 0.95, 0.6);
    }
  }
}

/** The walking boogie: up on the bar's first time through a chord, back down the next. The V turns round on its seventh. */
function bass(from: number, to: number) {
  for (let b = from; b < to; b++) {
    const f = chordAt(b);
    const down = b > 0 && chordAt(b - 1) === f;
    const steps = f === "V" && b % 12 === 11 ? [0, 4, 7, 10] : down ? DOWN : UP;
    steps.forEach((st, q) => human(note(BASS, ROOT[f] + st + SHIFT), b, q, lv.bass * (q === 0 ? 1 : 0.85), 0.1, 0.92 * s.beatSec));
  }
}

/** The shuffle. `top` the hats or the ride; `snare` on 2 and 4 or not. */
function shuffle(from: number, to: number, o: { top: "hat" | "ride"; snare: boolean; topGain?: number }) {
  for (let b = from; b < to; b++) {
    human(drum.kick, b, 0, lv.kick, 0.08);
    human(drum.kick, b, 2, lv.kick * 0.85, 0.08);
    if (o.snare) {
      human(drum.snare, b, 1, lv.snare, 0.1);
      human(drum.snare, b, 3, lv.snare, 0.1);
    }
    const g = o.topGain ?? 1;
    for (let q = 0; q < 4; q++) {
      if (o.top === "ride") {
        human(drum.ride, b, q, lv.ride * g * (q % 2 ? 0.85 : 1));
        human(drum.ride, b, q + AND, lv.ride * g * 0.6);
      } else {
        human(drum.hat, b, q, lv.hat * g * (q % 2 ? 0.8 : 1));
        // The last "let" of every other bar rings open.
        if (q === 3 && b % 2 === 1) human(drum.hatOpen, b, q + AND, lv.hatOpen * g * 0.8);
        else human(drum.hat, b, q + AND, lv.hat * g * 0.55);
      }
    }
  }
}

// Count-in: four hi-hat quarters.
for (let q = 0; q < 4; q++) human(drum.hat, -1, q, lv.hat * 1.3, 0.05);

piano(0, 36);
bass(0, 36);
shuffle(0, 4, { top: "hat", snare: false, topGain: 0.8 });
shuffle(4, 12, { top: "hat", snare: true });
s.hit(drum.crash, 12, 0, lv.crash * 0.7);
shuffle(12, 24, { top: "hat", snare: true });
s.lay(drum.roll, { atSec: s.at(24) - drum.roll[0].length / 44100, gain: lv.roll });
s.hit(drum.crash, 24, 0, lv.crash);
shuffle(24, 36, { top: "ride", snare: true });

// 37: home after the V, the I6 held with the bass's root, a crash and a kick.
for (const m of VOICING.I) s.lay(note(PIANO, m + SHIFT), { atSec: s.at(36), gain: lv.piano, fadeOut: 2 });
s.lay(note(PIANO, 48 + SHIFT), { atSec: s.at(36), gain: lv.piano * 0.8, fadeOut: 2 });
s.lay(note(BASS, ROOT.I + SHIFT), { atSec: s.at(36), lenSec: 2.5, gain: lv.bass, fadeOut: 1.5 });
s.hit(drum.crash, 36, 0, lv.crash);
s.hit(drum.kick, 36, 0, lv.kick);

s.write();
