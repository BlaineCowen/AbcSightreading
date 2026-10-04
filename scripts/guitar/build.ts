/**
 * Renders the pitched play-along's guitar (src/lib/play-along/guitar.ts):
 * every chord the progressions use in the Unison page's keys, in each pattern
 * slot of the saved Session Guitarist template, at each tempo, through REAPER
 * from the command line (rpp.ts); then one clip a chord, packed into one MP3
 * per pattern and tempo in public/guitar/, and the manifest the video reads.
 *
 *   bun run scripts/guitar/build.ts           # everything (about 20 minutes)
 *   ONLY=passengerA@70 bun run scripts/guitar/build.ts
 *
 * What the instrument wants (its manual, and probing it):
 * - Pattern key switches C1-G1 (MIDI 36-43), the slots saved in the template.
 * - Endings on G#1-C2 (44-48), pickups on C#2-D#2 (49-51): a chord must stay
 *   above them, from E2 (52) up, or it triggers one.
 * - The lowest note is the bass (it reads slash chords), and a chord's notes
 *   are read in the order they arrive: root first, low to high (rpp.ts sorts).
 * - A held chord plays the pattern locked to the bar; release stops it within
 *   a beat. The first bar after a chord starts can be late, so each chord is
 *   held two bars and the clip is the second.
 */
import { execFileSync } from "child_process";
import { mkdirSync, readFileSync, writeFileSync, rmSync } from "fs";
import { resolve } from "path";
import { render, type MidiNote } from "./rpp";
import {
  GUITAR_KEYS,
  GUITAR_SLOTS,
  GUITAR_TEMPOS,
  guitarChord,
  type GuitarChord,
  type GuitarSlot,
} from "../../src/lib/play-along/guitar";
import { PROGRESSIONS } from "../../src/lib/unison-progressions";

const ROOT = resolve(import.meta.dir, "../..");
const OUT = resolve(ROOT, "public/guitar");
const WORK = resolve(ROOT, "scripts/guitar/.render");
const MANIFEST = resolve(ROOT, "src/lib/play-along/guitar-manifest.json");
const RATE = 44100;
/** How much of the release a clip keeps after its bar (the next bar's clip crossfades over it). */
const TAIL_SEC = 0.35;
/** The ending key used (A#1): a full strum that rings about three beats. */
const ENDING_KEY = 46;
/** How long an ending clip runs past its bar's downbeat, at most. */
const ENDING_SEC = 4.5;
/** Overall loudness the clips are brought to, together (one gain for all, so B/C stay bigger than A). */
const TARGET_RMS_DB = -20;

/** Which feel each slot is, and its project meter. */
const FEEL: Record<GuitarSlot, "straight" | "waltz" | "triplet"> = {
  passengerA: "straight", passengerC: "straight", campfireA: "straight", campfireB: "straight",
  waltzA: "waltz", waltzB: "waltz", irishC: "triplet", irishA: "triplet",
};
/** The slots whose endings are rendered: each style's A pattern (the ending set follows the pattern). */
const ENDING_SLOTS: GuitarSlot[] = ["passengerA", "campfireA", "waltzA", "irishA"];

/** Every chord the progressions use, major and chromatic, in every key the page offers. */
function allChords(): GuitarChord[] {
  const names = new Set<string>(PROGRESSIONS.filter((p) => p.mode === "major").flatMap((p) => p.bars.flat()));
  for (const n of ["5/5", "5/6", "5/2", "1-7", "u_b7", "m4", "u_borrowed_i"]) names.add(n);
  const byId = new Map<string, GuitarChord>();
  for (const key of GUITAR_KEYS) for (const n of names) {
    const c = guitarChord(key, n);
    if (c) byId.set(c.id, c);
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/** A chord's keys: the root between E2 and D#3 (above the ending and pickup keys), the rest above it. */
const voicing = (c: GuitarChord) => {
  const root = 52 + ((c.root - 52) % 12 + 12) % 12;
  return c.intervals.map((i) => root + i);
};

function decode(wav: string): Float32Array[] {
  const raw = execFileSync("ffmpeg", ["-v", "error", "-i", wav, "-f", "f32le", "-ac", "2", "-ar", String(RATE), "-"], { maxBuffer: 1 << 30 });
  const all = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
  const n = all.length / 2;
  const l = new Float32Array(n), r = new Float32Array(n);
  for (let i = 0; i < n; i++) { l[i] = all[2 * i]; r[i] = all[2 * i + 1]; }
  return [l, r];
}

/** A clip cut from a render: `len` seconds from `start`, faded in 3 ms and out over its last 30 ms. */
function cut(src: Float32Array[], start: number, len: number): Float32Array[] {
  const a = Math.round(start * RATE), n = Math.round(len * RATE);
  const fadeIn = Math.round(0.003 * RATE), fadeOut = Math.round(0.03 * RATE);
  return src.map((ch) => {
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const v = ch[a + i] ?? 0;
      const g = Math.min(1, i / fadeIn, (n - i) / fadeOut);
      out[i] = v * g;
    }
    return out;
  });
}

interface Sprite { file: string; clipSec: number; barSec: number; chords: string[]; data: Float32Array[] }

function patternSprite(slot: GuitarSlot, bpm: number, chords: GuitarChord[]): Sprite {
  const feel = FEEL[slot];
  const qnBar = feel === "waltz" ? 3 : 4;
  const barSec = (qnBar * 60) / bpm;
  const notes: MidiNote[] = [{ at: 0, len: 0.25, key: GUITAR_SLOTS[slot] }];
  // A lead bar for the key switch; then each chord held two bars, a bar of silence after.
  chords.forEach((c, i) => {
    const t = (1 + 3 * i) * qnBar;
    for (const k of voicing(c)) notes.push({ at: t, len: 2 * qnBar, key: k });
    notes.push({ at: t + 2 * qnBar + qnBar / 2, len: 0.25, key: GUITAR_SLOTS[slot] });
  });
  const wav = render({ bpm, beats: qnBar, unit: 4, notes, lengthQn: (1 + 3 * chords.length) * qnBar + qnBar, out: `${WORK}/${slot}@${bpm}.wav` });
  const src = decode(wav);
  const clipSec = barSec + TAIL_SEC;
  const clips = chords.map((_, i) => cut(src, (2 + 3 * i) * barSec, clipSec));
  return { file: `${slot}@${bpm}.mp3`, clipSec, barSec, chords: chords.map((c) => c.id), data: join(clips) };
}

function endingSprite(slot: GuitarSlot, bpm: number, chords: GuitarChord[]): Sprite {
  const feel = FEEL[slot];
  const qnBar = feel === "waltz" ? 3 : 4;
  const barSec = (qnBar * 60) / bpm;
  const notes: MidiNote[] = [];
  // Each chord: its pattern for a bar, then the ending on the next downbeat and three bars to ring.
  chords.forEach((c, i) => {
    const t = 4 * i * qnBar;
    notes.push({ at: t, len: 0.25, key: GUITAR_SLOTS[slot] });
    for (const k of voicing(c)) notes.push({ at: t + qnBar, len: qnBar, key: k });
    notes.push({ at: t + 2 * qnBar, len: 0.5, key: ENDING_KEY, vel: 100 });
  });
  const wav = render({ bpm, beats: qnBar, unit: 4, notes, lengthQn: 4 * chords.length * qnBar, out: `${WORK}/end-${slot}@${bpm}.wav` });
  const src = decode(wav);
  const clipSec = Math.min(ENDING_SEC, 2 * barSec);
  const clips = chords.map((_, i) => cut(src, (4 * i + 2) * barSec, clipSec));
  return { file: `end-${slot}@${bpm}.mp3`, clipSec, barSec, chords: chords.map((c) => c.id), data: join(clips) };
}

const join = (clips: Float32Array[][]) =>
  [0, 1].map((ch) => {
    const out = new Float32Array(clips.reduce((n, c) => n + c[ch].length, 0));
    let at = 0;
    for (const c of clips) { out.set(c[ch], at); at += c[ch].length; }
    return out;
  });

const rms = (s: Sprite) => {
  let sum = 0, n = 0;
  for (const ch of s.data) for (const v of ch) { sum += v * v; n++; }
  return Math.sqrt(sum / n);
};

function encode(s: Sprite, gain: number) {
  const n = s.data[0].length;
  const inter = new Float32Array(2 * n);
  for (let i = 0; i < n; i++) { inter[2 * i] = s.data[0][i] * gain; inter[2 * i + 1] = s.data[1][i] * gain; }
  const raw = `${WORK}/${s.file}.f32`;
  writeFileSync(raw, Buffer.from(inter.buffer));
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "f32le", "-ar", String(RATE), "-ac", "2", "-i", raw, "-codec:a", "libmp3lame", "-b:a", "96k", `${OUT}/${s.file}`]);
  rmSync(raw);
}

if (import.meta.main) {
  mkdirSync(OUT, { recursive: true });
  mkdirSync(WORK, { recursive: true });
  const chords = allChords();
  const tonics = GUITAR_KEYS.map((k) => guitarChord(k, "1")!);
  const patterns: Sprite[] = [];
  const endings: Sprite[] = [];
  for (const slot of Object.keys(GUITAR_SLOTS) as GuitarSlot[]) {
    for (const bpm of GUITAR_TEMPOS[FEEL[slot]]) {
      const id = `${slot}@${bpm}`;
      if (process.env.ONLY && process.env.ONLY !== id) continue;
      const t0 = Date.now();
      patterns.push(patternSprite(slot, bpm, chords));
      if (ENDING_SLOTS.includes(slot)) endings.push(endingSprite(slot, bpm, tonics));
      console.log(`${id}: ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    }
  }
  // One gain for everything, from the patterns' loudness: the variations keep their own levels.
  const level = Math.sqrt(patterns.reduce((s, p) => s + rms(p) ** 2, 0) / patterns.length);
  let gain = 10 ** (TARGET_RMS_DB / 20) / level;
  const peak = Math.max(...[...patterns, ...endings].flatMap((s) => s.data.map((ch) => ch.reduce((m, v) => Math.max(m, Math.abs(v)), 0))));
  gain = Math.min(gain, 0.89 / peak);
  for (const s of [...patterns, ...endings]) encode(s, gain);
  const entry = (s: Sprite) => [s.file.replace(/\.mp3$/, ""), { file: `/guitar/${s.file}`, clipSec: s.clipSec, barSec: s.barSec, chords: s.chords }];
  const old = process.env.ONLY ? JSON.parse(readFileSync(MANIFEST, "utf8")) : { patterns: {}, endings: {} };
  const manifest = {
    patterns: { ...old.patterns, ...Object.fromEntries(patterns.map(entry)) },
    endings: { ...old.endings, ...Object.fromEntries(endings.map((s) => [s.file.replace(/^end-/, "").replace(/\.mp3$/, ""), entry(s)[1]])) },
  };
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`gain ${(20 * Math.log10(gain)).toFixed(1)} dB; ${patterns.length} patterns, ${endings.length} endings`);
}
