/**
 * The check before a graded attempt (AudioCheck.svelte): is the microphone
 * hearing a voice, and is it hearing the speakers? SmartMusic's way: play a
 * few beeps and listen. If the microphone hears them, it will hear the
 * accompaniment too and grade it as the student, so they are asked for
 * headphones or a lower volume.
 *
 * Pure, on what the tuner reported over time (tests audio-check.test.ts).
 */

export type Heard = { t: number; pitchHz: number | null; dbfs: number };

/** The beeps: A5, three of them, each BEEP_MS with GAP_MS of quiet after. */
export const BEEP_MIDI = 81;
export const BEEP_COUNT = 3;
export const BEEP_MS = 600;
export const GAP_MS = 700;

/** A voice is there when the level is over this (dBFS) for VOICE_MS. */
export const VOICE_DBFS = -50;
export const VOICE_MS = 500;
/** Louder than the quiet around it by this much (dB) is a beep heard. */
const RISE_DB = 10;
/** Within this of the beep's pitch class (cents) is the beep heard by pitch. */
const PITCH_CENTS = 60;

const centsFromClass = (hz: number, midi: number, a4 = 440) => {
  const m = 69 + 12 * Math.log2(hz / a4);
  const d = (((m - midi) % 12) + 12) % 12;
  return Math.min(d, 12 - d) * 100;
};

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : -Infinity);

/** The beeps' windows, from the moment the first one starts (ms). */
export function beepWindows(start: number): { from: number; to: number }[] {
  return Array.from({ length: BEEP_COUNT }, (_, k) => ({ from: start + k * (BEEP_MS + GAP_MS), to: start + k * (BEEP_MS + GAP_MS) + BEEP_MS }));
}

/**
 * How many of the beeps the microphone heard: by pitch (the tuner found the
 * beep's note in a third of its frames) or by level (clearly louder than the
 * quiet after it). The first 80 ms of each are skipped, the sound's way to
 * the speaker and back.
 */
export function beepsHeard(frames: Heard[], windows: { from: number; to: number }[], a4 = 440): number {
  let heard = 0;
  for (const w of windows) {
    const during = frames.filter((f) => f.t >= w.from + 80 && f.t <= w.to);
    const after = frames.filter((f) => f.t > w.to + 150 && f.t <= w.to + GAP_MS - 50);
    if (!during.length) continue;
    const byPitch = during.filter((f) => f.pitchHz !== null && centsFromClass(f.pitchHz, BEEP_MIDI, a4) <= PITCH_CENTS).length / during.length >= 1 / 3;
    const finite = (xs: Heard[]) => xs.map((f) => f.dbfs).filter(Number.isFinite);
    const rise = mean(finite(during)) - mean(finite(after));
    const byLevel = Number.isFinite(rise) && rise >= RISE_DB && mean(finite(during)) > -60;
    if (byPitch || byLevel) heard++;
  }
  return heard;
}

/** Two of the three beeps heard: the microphone hears the speakers. */
export const bleeds = (heard: number) => heard >= 2;

/** Was a voice heard for long enough (the last frames, newest last)? */
export function voiceHeard(frames: Heard[]): boolean {
  let run = 0;
  for (let i = 1; i < frames.length; i++) {
    const loud = frames[i].dbfs >= VOICE_DBFS;
    run = loud ? run + (frames[i].t - frames[i - 1].t) : 0;
    if (run >= VOICE_MS) return true;
  }
  return false;
}

/** The meter's fill, 0 to 1, from dBFS (-70 silent, -10 loud). */
export const meterLevel = (dbfs: number) => (Number.isFinite(dbfs) ? Math.max(0, Math.min(1, (dbfs + 70) / 60)) : 0);
