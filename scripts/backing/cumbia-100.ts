/**
 * "Cumbia (100)": "Tradición - Cumbia". Two of its band loops, both F minor,
 * as the song's verse and its bridge:
 *   - loop 2 (98 BPM): electric bass, piano, acoustic guitar chords, an
 *     acoustic guitar line and a trumpet riff in three harmony parts;
 *   - loop 11 (103 BPM): electric bass, piano montuno and its own riff.
 * They meet at 100 (stretched 2% and 3%, pitch kept). Over them the matching
 * percussion loop and the pack's one-shots: congas, cowbell, guiro,
 * woodblock, cajon, and an F minor chord on piano and on guitar for the end.
 *
 * The first version used one trumpet riff throughout and was repetitive:
 * every trumpet part plays the same rhythm each bar, so now they come in a
 * part at a time and only in some sections, and the bridge brings new chords
 * and a different riff.
 *
 * Cumbia is usually written in 2/4, so the one file serves both meters: 36
 * bars of 4/4 or 72 of 2/4, with the same four-beat count-in (backing-tracks.ts
 * lists it once for each). Bars here are 4/4.
 *
 *   count-in   woodblock on each beat
 *   1-4        intro: percussion and the acoustic guitar line
 *   5-12       the band: bass, guitar chords, piano
 *   13-20      the trumpet riff, one part then two in harmony; cowbell and congas join
 *   21-28      bridge: loop 11's bass and montuno, its riff in the second half
 *   29-32      breakdown, home chords: bass, guitar line, soft piano, guiro
 *   33-36      everything, all three trumpet parts
 *   end        the F minor chord on piano and guitar, low conga and cajon
 *
 *   bun run scripts/backing/cumbia-100.ts
 */
import { song } from "./engine";

const BARS = 36;
const TAIL = 3;
const s = song({ pack: "Tradición - Cumbia", bpm: 100, beats: 4, bars: BARS, tailSec: TAIL, out: "public/backing/cumbia-100" });
const name = (n: string) => `DIASPORA_tradici_n_${n}.wav`;
const verse = (n: string) => s.load(name(`melodic_loop_2_${n}_cumbia_98_bpm_Fmin`), { fromBpm: 98 });
const bridge = (n: string) => s.load(name(`melodic_loop_11_${n}_cumbia_103_bpm_Fmin`), { fromBpm: 103 });

const loop = {
  bass: verse("electric_bass"),
  piano: verse("piano"),
  chords: verse("acoustic_guitar_chords"),
  guitar: verse("acoustic_guitar"),
  tp1: verse("trumpet_1"),
  tp2: verse("trumpet_2"),
  tp3: verse("trumpet_3"),
  bBass: bridge("electric_bass"),
  montuno: bridge("piano_montuno"),
  bTp1: bridge("trumpet_1"),
  bTp2: bridge("trumpet_2"),
  perc: s.load(name("percussion_loop_2_cumbia_clean_98_bpm"), { fromBpm: 98 }),
};
const one = {
  quinto: s.load(name("percussion_one_shot_quintoconga_open"), { trim: true }),
  tumba: s.load(name("percussion_one_shot_tumbaconga_open"), { trim: true }),
  tumbaMute: s.load(name("percussion_one_shot_tumbaconga_muffle"), { trim: true }),
  cowbell: s.load(name("percussion_one_shot_cowbell_middle"), { trim: true }),
  guiro: s.load(name("percussion_one_shot_guiro_slide"), { trim: true }),
  guiroShort: s.load(name("percussion_one_shot_guiro_strike_2"), { trim: true }),
  woodblock: s.load(name("percussion_one_shot_woodblock"), { trim: true }),
  cajon: s.load(name("percussion_one_shot_cajon_slap"), { trim: true }),
  pianoChord: s.load(name("one_shot_piano_Fmin"), { trim: true }),
  guitarChord: s.load(name("one_shot_acoustic_guitar_Fmin"), { trim: true }),
};

/** RMS targets in dB: bass and percussion carry it, chords and piano behind, trumpets on top. */
const lv = {
  bass: s.toLevel(loop.bass, -17), piano: s.toLevel(loop.piano, -24), chords: s.toLevel(loop.chords, -23),
  guitar: s.toLevel(loop.guitar, -23), tp1: s.toLevel(loop.tp1, -20), tp2: s.toLevel(loop.tp2, -22),
  tp3: s.toLevel(loop.tp3, -23), bBass: s.toLevel(loop.bBass, -17), montuno: s.toLevel(loop.montuno, -21),
  bTp1: s.toLevel(loop.bTp1, -20), bTp2: s.toLevel(loop.bTp2, -22), perc: s.toLevel(loop.perc, -20),
  quinto: s.toLevel(one.quinto, -22), tumba: s.toLevel(one.tumba, -21), tumbaMute: s.toLevel(one.tumbaMute, -24),
  cowbell: s.toLevel(one.cowbell, -27), guiro: s.toLevel(one.guiro, -25), guiroShort: s.toLevel(one.guiroShort, -27),
  woodblock: s.toLevel(one.woodblock, -19), cajon: s.toLevel(one.cajon, -20),
  pianoChord: s.toLevel(one.pianoChord, -19), guitarChord: s.toLevel(one.guitarChord, -20),
};
const play = (k: keyof typeof loop, from: number, to: number, gain = 1, cut: Record<number, number> = {}) =>
  s.loop(loop[k], from, to, lv[k] * gain, cut);
const hit = (k: keyof typeof one, bar: number, beat: number, v = 1) => s.hit(one[k], bar, beat, lv[k] * v);

/** Short conga fill over the last beat of `bar`. */
function fill(bar: number, v = 1) {
  hit("quinto", bar, 3, 0.9 * v); hit("quinto", bar, 3.25, 0.75 * v);
  hit("tumba", bar, 3.5, 0.95 * v); hit("tumba", bar, 3.75, 0.85 * v);
}

/** Cowbell on each beat and a tumbao on the congas (muffled 2, open 4 and its "and"). */
function groove(from: number, to: number, v = 1) {
  for (let b = from; b < to; b++) {
    for (let beat = 0; beat < 4; beat++) hit("cowbell", b, beat, (beat % 2 ? 0.75 : 1) * v);
    hit("tumbaMute", b, 1, 0.8 * v);
    hit("tumba", b, 3, 0.9 * v);
    hit("tumba", b, 3.5, 0.8 * v);
  }
}

// Count-in: woodblock on each beat, 1 and 3 a touch louder (one bar of 4/4 or two of 2/4).
for (let beat = 0; beat < 4; beat++) hit("woodblock", -1, beat, beat % 2 ? 0.8 : 1);

// 1-4 intro: the percussion groove and the acoustic guitar line.
play("perc", 0, 4);
play("guitar", 0, 4, 1.1);

// 5-12: the band.
hit("guiro", 4, 0);
play("perc", 4, 12);
play("bass", 4, 12);
play("chords", 4, 12);
play("piano", 4, 12);
fill(11, 0.8);

// 13-20: the trumpet riff - one part, then a second in harmony with the
// cowbell and congas joining.
play("perc", 12, 20);
play("bass", 12, 20);
play("chords", 12, 20);
play("piano", 12, 20, 0.85);
play("tp1", 12, 20);
play("tp2", 16, 20);
groove(16, 20, 0.9);
fill(19);

// 21-28 bridge: new chords. The montuno leads for four bars, then the
// bridge's own riff.
hit("guiro", 20, 0);
play("perc", 20, 28);
play("bBass", 20, 28);
play("montuno", 20, 28);
groove(20, 28);
play("bTp1", 24, 28);
play("bTp2", 24, 28);
// A stop on beat 3 of the bridge's last bar, a conga fill back home.
play("perc", 27, 28, 1, { 27: 2 });
fill(27, 1.1);

// 29-32 breakdown on the home chords: bass, the guitar line, soft piano, guiro.
play("bass", 28, 32, 0.9);
play("guitar", 28, 32);
play("piano", 28, 32, 0.6);
for (let b = 28; b < 32; b++) {
  for (let beat = 0; beat < 4; beat++) { hit("guiro", b, beat, 0.75); hit("guiroShort", b, beat + 0.5, 0.65); }
}
hit("cajon", 31, 3.5, 0.8);
fill(31, 1.1);

// 33-36: everything, all three trumpet parts.
hit("guiro", 32, 0);
play("perc", 32, 36);
play("bass", 32, 36);
play("chords", 32, 36);
play("piano", 32, 36);
play("guitar", 32, 36, 0.8);
play("tp1", 32, 36);
play("tp2", 32, 36);
play("tp3", 32, 36);
groove(32, 36, 1.1);
fill(35, 1.1);

// Ending: the F minor chord on piano and guitar, low conga and cajon.
hit("pianoChord", BARS, 0, 1);
hit("guitarChord", BARS, 0, 0.9);
hit("tumba", BARS, 0, 1.1);
hit("cajon", BARS, 0, 1);
s.lay(loop.bass, { atSec: s.at(BARS), fromSec: 0, lenSec: s.beatSec * 2, gain: lv.bass, fadeOut: s.beatSec * 1.5 });

s.write();
