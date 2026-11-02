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
 * The games' piano level: twice the Tools piano's 0.5 (Blaine, 2 November
 * 2026: too quiet for a class over the room's speakers). One sample at a
 * time at full gain, so it cannot clip.
 */
const PIANO_VOLUME = 1;

/** Do mi so mi do, so below, do: the key, as Grade gives it (`tonicPattern` in Octavo). */
export const KEY_PATTERN = [0, 4, 7, 4, 0, -5, 0];

/**
 * The key, a breath, then the tune, on the piano, a note every `gap` seconds.
 * `steps` are scale steps from do (tune-path.ts), `doMidi` where do sits.
 * Calls `onNote(i)` as each tune note sounds (-1 while the key plays), and
 * resolves when it is over. Stop cancels what is left.
 */
export function playKeyAndTune(o: { steps: number[]; doMidi: number; gap: number; withKey: boolean; onNote?: (i: number) => void }) {
  const tune = o.steps.map((s) => o.doMidi + semiOf(s));
  const key = o.withKey ? KEY_PATTERN.map((d) => o.doMidi + d) : [];
  const timers: ReturnType<typeof setTimeout>[] = [];
  let stopped = false;
  const done = (async () => {
    await preloadPiano([...tune, ...key]);
    if (stopped) return;
    const keyGap = 0.42;
    key.forEach((m, i) => timers.push(setTimeout(() => { o.onNote?.(-1); playPiano([m], keyGap * 0.9, 440, PIANO_VOLUME); }, i * keyGap * 1000)));
    const from = key.length ? key.length * keyGap + 0.9 : 0;
    tune.forEach((m, i) => timers.push(setTimeout(() => { o.onNote?.(i); playPiano([m], o.gap * 0.9, 440, PIANO_VOLUME); }, (from + i * o.gap) * 1000)));
    await new Promise((r) => timers.push(setTimeout(r, (from + tune.length * o.gap + 0.2) * 1000)));
  })();
  return {
    done,
    stop() {
      stopped = true;
      timers.forEach(clearTimeout);
    },
  };
}

/** One note of the tune (a tapped square). */
export function playStep(step: number, doMidi: number) {
  void preloadPiano([doMidi + semiOf(step)]).then(() => playPiano([doMidi + semiOf(step)], 0.7, 440, PIANO_VOLUME));
}
