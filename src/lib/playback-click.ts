/**
 * The click under an exercise as it plays, set by the Tools metronome: its
 * subdivision, accent and sound, so turning on eighths there puts eighths
 * under the music too. Tests: tests/unit/playback-click.test.ts.
 *
 * - Choral renders its click into the audio as abcjs's drum track, so it gets
 *   a drum pattern (drumPatternFor): abcjs stretches the pattern evenly across
 *   the bar, so a hit per click is all it needs.
 * - Unison sounds its own click on each beat the music reaches, so it
 *   schedules that beat's clicks at exact times (scheduleClick) with the Tools
 *   metronome's own samples.
 */
import { SAMPLE_BOOST, TICK_GAIN, TICK_HZ, drumNoteFor, voiceFor, type ClickLevel, type ClickSound, type SampleBank } from "./tuner/click-sounds";
import { beatLevelsFor, maskFor, type BeatLevel, LEVEL_GAIN } from "./tuner/click-pattern";

/** One bar's clicks in order: each beat, then its subdivisions. */
export function barClicks(beats: number, subdivision: number, accent: boolean): ClickLevel[] {
  const out: ClickLevel[] = [];
  for (let b = 0; b < beats; b++) {
    out.push(accent && b === 0 ? "downbeat" : "beat");
    for (let s = 1; s < subdivision; s++) out.push("sub");
  }
  return out;
}

/**
 * An abcjs drum pattern for one bar, from the click's bar model
 * (click-pattern.ts): a slot per subdivision of every beat, "d" where it
 * sounds and "z" where it is silent, then each "d"'s drum note (drumNoteFor,
 * which the soundfont proxy serves from public/clicks), then its velocity. A
 * bar with nothing to sound is "" - no drum track.
 */
export function drumPatternFor(o: {
  beats: number;
  subdivision: number;
  accent: boolean;
  sound: ClickSound;
  beatLevels?: BeatLevel[] | null;
  subMask?: string | null;
}): string {
  const levels = beatLevelsFor(o);
  const mask = maskFor(o.subdivision, o.subMask);
  const slots: string[] = [];
  const hits: { level: ClickLevel; gain: number }[] = [];
  for (const level of levels) {
    mask.forEach((on, slot) => {
      const gain = LEVEL_GAIN[level];
      if (!on || gain === 0) return void slots.push("z");
      slots.push("d");
      hits.push({ level: slot > 0 ? "sub" : level === "accent" ? "downbeat" : "beat", gain });
    });
  }
  if (!hits.length) return "";
  const voices = hits.map((h) => ({ voice: voiceFor(o.sound, h.level)!, gain: h.gain }));
  const pitches = voices.map((v) => drumNoteFor(v.voice.sample));
  const velocities = voices.map((v) => Math.max(1, Math.min(127, Math.round(v.voice.gain * v.gain * 55))));
  return [slots.join(""), ...pitches, ...velocities].join(" ");
}

/**
 * One click at an exact time, as the Tools metronome plays it: its sample if
 * loaded, else the synthesized tick.
 */
export function scheduleClick(
  ctx: BaseAudioContext,
  bank: SampleBank,
  destination: AudioNode,
  time: number,
  sound: ClickSound,
  level: ClickLevel,
  /** A soft beat's share of the level (click-pattern.ts LEVEL_GAIN). */
  scale = 1
) {
  const voice = voiceFor(sound, level);
  const buffer = voice ? bank.get(voice.sample) : undefined;
  if (voice && buffer) {
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = voice.rate;
    const gain = ctx.createGain();
    gain.gain.value = voice.gain * SAMPLE_BOOST * scale;
    src.connect(gain).connect(destination);
    src.start(time);
    src.stop(time + 0.6);
    src.onended = () => { src.disconnect(); gain.disconnect(); };
    return;
  }
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(TICK_HZ[level], time);
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(TICK_GAIN[level] * 0.6 * scale, time + 0.001);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.03);
  osc.connect(gain).connect(destination);
  osc.start(time);
  osc.stop(time + 0.04);
  osc.onended = () => { osc.disconnect(); gain.disconnect(); };
}
