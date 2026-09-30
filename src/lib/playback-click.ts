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
 * An abcjs drum pattern for one bar: "d" per click, then each click's drum
 * note (drumNoteFor, which the soundfont proxy serves from public/clicks),
 * then each one's velocity.
 */
export function drumPatternFor(o: { beats: number; subdivision: number; accent: boolean; sound: ClickSound }): string {
  const levels = barClicks(o.beats, Math.max(1, Math.round(o.subdivision)), o.accent);
  const voices = levels.map((l) => voiceFor(o.sound, l)!);
  const pitches = voices.map((v) => drumNoteFor(v.sample));
  const velocities = voices.map((v) => Math.max(1, Math.min(127, Math.round(v.gain * 55))));
  return ["d".repeat(levels.length), ...pitches, ...velocities].join(" ");
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
  level: ClickLevel
) {
  const voice = voiceFor(sound, level);
  const buffer = voice ? bank.get(voice.sample) : undefined;
  if (voice && buffer) {
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = voice.rate;
    const gain = ctx.createGain();
    gain.gain.value = voice.gain * SAMPLE_BOOST;
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
  gain.gain.exponentialRampToValueAtTime(TICK_GAIN[level] * 0.6, time + 0.001);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.03);
  osc.connect(gain).connect(destination);
  osc.start(time);
  osc.stop(time + 0.04);
  osc.onended = () => { osc.disconnect(); gain.disconnect(); };
}
