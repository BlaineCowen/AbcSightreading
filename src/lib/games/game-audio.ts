import { SampleBank } from "../tuner/click-sounds";
import { scheduleClick } from "../playback-click";
import { audio, playPiano, preloadPiano } from "../tools/tone";
import { semiOf } from "./tune-path";

/**
 * The games' sound: the metronome's clicks booked on the audio clock (the
 * Tools metronome's samples, as every click on the site), and the piano for
 * Catch the tune. One audio context, the Tools' (`audio()`).
 */

const bank = new SampleBank();
export const gameAudio = () => {
  const ctx = audio() as AudioContext;
  void bank.load(ctx);
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
};

/** The click samples, loaded (a click booked before they are falls back to a synthesized tick). */
export const loadClicks = () => bank.load(gameAudio());

/**
 * Clicks a beat apart from `start` (audio-clock seconds), beat 1 of each bar
 * accented. Returns them, so Stop can take back the ones to come.
 */
export function bookClicks(o: { start: number; beats: number; beatSec: number; beatsPerBar: number; volume?: number }) {
  const ctx = gameAudio();
  const out = ctx.createGain();
  out.gain.value = (o.volume ?? 0.6) * 2;
  out.connect(ctx.destination);
  const sources = Array.from({ length: o.beats }, (_, k) =>
    scheduleClick(ctx, bank, out, o.start + k * o.beatSec, "quartz", k % o.beatsPerBar === 0 ? "downbeat" : "beat")
  );
  return {
    stop() {
      for (const s of sources) try { s.stop(); } catch {}
      setTimeout(() => out.disconnect(), 300);
    },
  };
}

/**
 * The games' piano: louder than the Tools piano (Blaine, 2 and 4 November
 * 2026: still too quiet for a class over the room's speakers). A single
 * sample at full gain was the most it could give without clipping, so it now
 * goes in three times as loud and through a limiter, which holds the peaks
 * under full scale and leaves the rest about 9 dB louder.
 */
const PIANO_VOLUME = 1;
const PIANO_BOOST = 3;
let pianoOut: AudioNode | null = null;
function gamePiano(): AudioNode {
  const ctx = gameAudio();
  if (pianoOut && (pianoOut.context as AudioContext) === ctx) return pianoOut;
  const boost = ctx.createGain();
  boost.gain.value = PIANO_BOOST;
  const limit = ctx.createDynamicsCompressor();
  limit.threshold.value = -4;
  limit.knee.value = 0;
  limit.ratio.value = 20;
  limit.attack.value = 0.002;
  limit.release.value = 0.12;
  boost.connect(limit).connect(ctx.destination);
  pianoOut = boost;
  return boost;
}
const piano = (midis: number[], seconds: number) => playPiano(midis, seconds, 440, PIANO_VOLUME, gamePiano());

/** Do mi so mi do, so below, do: the key, as Grade gives it (`tonicPattern` in Octavo). */
export const KEY_PATTERN = [0, 4, 7, 4, 0, -5, 0];
/** The key's syllables, for the strip that lights each one as it sounds. */
export const KEY_SYLLABLES = ["do", "mi", "so", "mi", "do", "so", "do"];

/**
 * The key, a breath, then the tune, on the piano, a note every `gap` seconds.
 * The key opens with do mi so held together, then walks do mi so mi do so do
 * (Blaine, 4 November 2026: it was not clear the key came first; the chord,
 * and the strip on screen that `onKey` lights, say so).
 * `steps` are scale steps from do (tune-path.ts), `doMidi` where do sits.
 * Calls `onKey(k)` as the key sounds (-1 for the chord, then each note of
 * KEY_PATTERN), `onNote(i)` as each tune note sounds, and resolves when it is
 * over. Stop cancels what is left.
 */
export function playKeyAndTune(o: { steps: number[]; doMidi: number; gap: number; withKey: boolean; onNote?: (i: number) => void; onKey?: (k: number | null) => void }) {
  const tune = o.steps.map((s) => o.doMidi + semiOf(s));
  const chord = [0, 4, 7].map((d) => o.doMidi + d);
  const key = o.withKey ? KEY_PATTERN.map((d) => o.doMidi + d) : [];
  const timers: ReturnType<typeof setTimeout>[] = [];
  let stopped = false;
  const done = (async () => {
    await preloadPiano([...tune, ...key, ...(o.withKey ? chord : [])]);
    if (stopped) return;
    const keyGap = 0.5;
    const chordFor = o.withKey ? 1.3 : 0;
    if (o.withKey) timers.push(setTimeout(() => { o.onKey?.(-1); piano(chord, 1.1); }, 0));
    key.forEach((m, i) => timers.push(setTimeout(() => { o.onKey?.(i); piano([m], keyGap * 0.9); }, (chordFor + i * keyGap) * 1000)));
    const from = key.length ? chordFor + key.length * keyGap + 1.1 : 0;
    if (key.length) timers.push(setTimeout(() => o.onKey?.(null), (from - 0.6) * 1000));
    tune.forEach((m, i) => timers.push(setTimeout(() => { o.onNote?.(i); piano([m], o.gap * 0.9); }, (from + i * o.gap) * 1000)));
    await new Promise((r) => timers.push(setTimeout(r, (from + tune.length * o.gap + 0.2) * 1000)));
  })();
  return {
    done,
    stop() {
      stopped = true;
      timers.forEach(clearTimeout);
      o.onKey?.(null);
    },
  };
}

/** Note Rain: load these notes' piano samples ahead, so the first one named sounds at once. */
export const preloadNotes = (midis: number[]) => { gameAudio(); return preloadPiano(midis); };
/** Note Rain: one note, by MIDI number (a card named right). */
export const playNote = (midi: number) => piano([midi], 0.7);

/** One note of the tune (a tapped square). */
export function playStep(step: number, doMidi: number) {
  void preloadPiano([doMidi + semiOf(step)]).then(() => piano([doMidi + semiOf(step)], 0.7));
}

/**
 * The ear-training quizzes' sound (ear-quiz.ts): the key (its chord held,
 * then `pattern`), a breath, then `notes`, all as semitones from `tonic`
 * (a MIDI note), so minor and chromatic notes play as written. `pattern`
 * null plays no key. Calls `onKey` as the key sounds (-1 for the chord, null
 * when it is over) and `onNote(i)` as each note sounds. Stop cancels the rest.
 */
export function playEar(o: {
  tonic: number; pattern: number[] | null; chord: number[]; notes: number[]; gap: number;
  /** All the notes at once (an interval heard together). */
  together?: boolean;
  onKey?: (k: number | null) => void; onNote?: (i: number) => void;
}) {
  const key = o.pattern ? o.pattern.map((d) => o.tonic + d) : [];
  const chord = o.pattern ? o.chord.map((d) => o.tonic + d) : [];
  const notes = o.notes.map((d) => o.tonic + d);
  const timers: ReturnType<typeof setTimeout>[] = [];
  let stopped = false;
  const done = (async () => {
    await preloadPiano([...key, ...chord, ...notes]);
    if (stopped) return;
    const keyGap = 0.5;
    const chordFor = chord.length ? 1.3 : 0;
    if (chord.length) timers.push(setTimeout(() => { o.onKey?.(-1); piano(chord, 1.1); }, 0));
    key.forEach((m, i) => timers.push(setTimeout(() => { o.onKey?.(i); piano([m], keyGap * 0.9); }, (chordFor + i * keyGap) * 1000)));
    const from = key.length ? chordFor + key.length * keyGap + 0.9 : 0;
    if (key.length) timers.push(setTimeout(() => o.onKey?.(null), (from - 0.4) * 1000));
    if (o.together) timers.push(setTimeout(() => { o.onNote?.(notes.length - 1); piano(notes, Math.max(1.2, o.gap * 1.5)); }, from * 1000));
    else notes.forEach((m, i) => timers.push(setTimeout(() => { o.onNote?.(i); piano([m], Math.max(0.6, o.gap * 0.9)); }, (from + i * o.gap) * 1000)));
    await new Promise((r) => timers.push(setTimeout(r, (from + (o.together ? 1.5 : notes.length) * o.gap + 0.3) * 1000)));
  })();
  return {
    done,
    stop() {
      stopped = true;
      timers.forEach(clearTimeout);
      o.onKey?.(null);
    },
  };
}
