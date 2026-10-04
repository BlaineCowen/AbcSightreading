/**
 * Tabled 3 Oct 2026 (the samples were too plain; not in the app). "Indie rock (4/4, 89)": "Indie Rock Sample Pack by Dutch Revz", its "Angel"
 * kit - bass, muted power chords and three guitar lead lines (low, main,
 * high), all 89 BPM in C major over one 16-bar progression - and the pack's
 * indie rock verse and chorus drum loops, recorded at 88 and stretched 1%.
 * Chill and happy: a major key, an easy tempo, the guitars added a line at a
 * time. The pack has no one-shots or effects, so the transitions are made
 * from the music itself: the drums high-passed to their cymbals, a cymbal
 * swell cut from the chorus loop's crash, stops, and a filter opening.
 *
 *   count-in   the verse drums' cymbals only (a hi-hat count)
 *   1-4        intro: the muted chords opening up from a low-pass, cymbals for a pulse
 *   5-12       verse drums, bass, muted chords
 *   13-16      + the low lead
 *   17-24      chorus drums (the new groove), the main lead takes over
 *   25-28      breakdown: cymbals only, bass, the high lead floating on top
 *   29-32      everything: chorus drums, bass, chords, main and high leads
 *   end        the chords and bass ringing on the home chord, the crash
 *
 * Every guitar part reads bar n of its progression as bar n mod 16, so the
 * chords run straight through. The drum loops start from their own bar 1 at
 * each section, so each groove begins where it was written to.
 *
 *   bun run scripts/backing/indie-4-4-89.ts
 */
import { song } from "./engine";

const BARS = 32;
const TAIL = 3.5;
const s = song({ pack: "Indie Rock Sample Pack by Dutch Revz", bpm: 89, beats: 4, bars: BARS, tailSec: TAIL, out: "public/backing/indie-4-4-89" });
const angel = (part: string) => `TRKTRN_IRSPBDR_89_Kit_Loop_Angel_Electric_Guitar_${part}_Cmaj.wav`;

const part = {
  bass: s.load(angel("Bass")),
  chords: s.load(angel("Muted_Pwr_Chords_Solo")),
  leadLow: s.load(angel("Lead_Low")),
  leadMain: s.load(angel("Lead_Main")),
  leadHigh: s.load(angel("Lead_High")),
  verse: s.load("TRKTRN_IRSPBDR_88_Drum_Loop_Full_Indie_Rock_Verse.wav", { fromBpm: 88 }),
  chorus: s.load("TRKTRN_IRSPBDR_88_Drum_Loop_Full_Indie_Rock_Chorus.wav", { fromBpm: 88 }),
};
// The chorus loop opens on a crash: its first beat, reversed and high-passed
// to the cymbal, is a soft swell into a section; forwards, the ending's crash.
const crash = s.slice(part.chorus, 0, 1.5 * s.beatSec);
const swell = s.reversed(crash);

/** RMS targets in dB: drums and bass carry it, the chords under them, one lead at a time on top. */
const lv = {
  bass: s.toLevel(part.bass, -18), chords: s.toLevel(part.chords, -22),
  leadLow: s.toLevel(part.leadLow, -23), leadMain: s.toLevel(part.leadMain, -22), leadHigh: s.toLevel(part.leadHigh, -25),
  verse: s.toLevel(part.verse, -17), chorus: s.toLevel(part.chorus, -17), swell: s.toLevel(swell, -27),
};
const play = (k: keyof typeof part, from: number, to: number, gain = 1, cut: Record<number, number> = {}) =>
  s.loop(part[k], from, to, lv[k] * gain, cut);
const drums = (k: "verse" | "chorus", from: number, to: number, cut: Record<number, number> = {}, gain = 1) =>
  s.loop(part[k], from, to, lv[k] * gain, cut, { startBar: from });
/** The drums' cymbals alone: a hi-hat pulse with no kick or snare. */
const cymbals = (from: number, to: number, gain: number) =>
  s.loop(part.verse, from, to, lv.verse * gain, {}, { startBar: from, highpass: 2500 });
const swellInto = (bar: number) =>
  s.lay(swell, { atSec: s.at(bar) - swell[0].length / 44100, gain: lv.swell, highpass: 3000, fadeIn: 0.3 });

// Count-in: the verse groove's cymbals only.
cymbals(-1, 0, 7);

// 1-4 intro: the muted chords opening up in one pass, cymbals keeping time.
s.lay(part.chords, { atSec: s.at(0), fromSec: 0, lenSec: 4 * s.barSec, gain: lv.chords * 1.3, lowpass: [600, 16000] });
cymbals(0, 4, 4.5);

// 5-12: the band - verse drums, bass, chords.
drums("verse", 4, 12);
play("bass", 4, 12);
play("chords", 4, 12);

// 13-16: the low lead joins. The band stops on the last half bar, and a
// swell leads into the chorus groove.
drums("verse", 12, 16, { 15: 2 });
play("bass", 12, 16, 1, { 15: 2 });
play("chords", 12, 16, 1, { 15: 2 });
play("leadLow", 12, 16, 1, { 15: 3 });
swellInto(16);

// 17-24: the chorus groove; the main lead takes over from the low one.
drums("chorus", 16, 24);
play("bass", 16, 24);
play("chords", 16, 24);
play("leadMain", 16, 24);

// 25-28 breakdown: cymbals only, bass, the high lead floating over them.
cymbals(24, 28, 3.5);
play("bass", 24, 28, 0.9);
play("leadHigh", 24, 28, 1.2);
play("chords", 24, 28, 0.6);
swellInto(28);

// 29-32: everything.
drums("chorus", 28, 32);
play("bass", 28, 32);
play("chords", 28, 32);
play("leadMain", 28, 32, 0.9);
play("leadHigh", 28, 32, 0.9);

// Ending: the crash, and bar 1 of the progression (the home chord) ringing out.
s.lay(crash, { atSec: s.at(BARS), gain: lv.chorus, fadeOut: 0.5 });
s.lay(part.chorus, { atSec: s.at(BARS) + crash[0].length / 44100, fromSec: crash[0].length / 44100, lenSec: TAIL, gain: lv.chorus * 0.5, highpass: 3000, fadeOut: TAIL * 0.9 });
for (const k of ["bass", "chords"] as const) {
  s.lay(part[k], { atSec: s.at(BARS), fromSec: 0, lenSec: TAIL, gain: lv[k], fadeOut: TAIL * 0.85 });
}

s.write();
