/**
 * Sustained and one-shot tones for the practice tools: the drone under the
 * singing, the pitch pipe's starting notes, and the timer's chime. A soft
 * triangle through a low-pass, so a held drone is something to sing against
 * rather than something to endure. Owns its AudioContext, created on the
 * first sound (which is always a click).
 */

const RAMP_S = 0.04;
let ctx: AudioContext | null = null;
const audio = () => {
  ctx ??= new AudioContext();
  if (ctx.state !== "running") void ctx.resume();
  return ctx;
};

export const midiToFreq = (midi: number, a4 = 440) => a4 * 2 ** ((midi - 69) / 12);

function voice(c: AudioContext, freq: number, gainValue: number, dest: AudioNode) {
  const osc = c.createOscillator();
  osc.type = "triangle";
  osc.frequency.value = freq;
  const gain = c.createGain();
  gain.gain.value = gainValue;
  osc.connect(gain).connect(dest);
  return { osc, gain };
}

/** Sound these notes together for `seconds`, then fade. */
export function playNotes(midis: number[], seconds = 1.6, a4 = 440, volume = 0.5) {
  const c = audio();
  const now = c.currentTime;
  const out = c.createGain();
  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 2400;
  out.connect(filter).connect(c.destination);
  out.gain.setValueAtTime(0, now);
  out.gain.linearRampToValueAtTime(volume / Math.max(1, Math.sqrt(midis.length)), now + RAMP_S);
  out.gain.setValueAtTime(volume / Math.max(1, Math.sqrt(midis.length)), now + seconds - 0.3);
  out.gain.linearRampToValueAtTime(0, now + seconds);
  for (const m of midis) {
    const { osc } = voice(c, midiToFreq(m, a4), 0.3, out);
    osc.start(now);
    osc.stop(now + seconds + 0.05);
  }
  setTimeout(() => out.disconnect(), (seconds + 0.2) * 1000);
}

/**
 * A piano for Grade's reference (the key and the first note): the same
 * grand piano samples abcjs plays the exercise on, through the page's own
 * proxy (/api/soundfont). Loaded ahead (`preloadPiano`) so the reference can
 * start on time; a note not loaded yet falls back to the soft tone.
 */
const PIANO_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const pianoReady = new Map<number, AudioBuffer>();
const pianoLoading = new Map<number, Promise<AudioBuffer | null>>();
function loadPiano(midi: number): Promise<AudioBuffer | null> {
  const known = pianoLoading.get(midi);
  if (known) return known;
  const name = `${PIANO_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
  const p = fetch(`/api/soundfont/acoustic_grand_piano-mp3/${name}.mp3`)
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
    .then((bytes) => audio().decodeAudioData(bytes))
    .then((buf) => (pianoReady.set(midi, buf), buf))
    .catch(() => null);
  pianoLoading.set(midi, p);
  return p;
}

/** Fetch these piano notes now; true once every one of them is ready. */
export async function preloadPiano(midis: number[]): Promise<boolean> {
  const bufs = await Promise.all([...new Set(midis)].map(loadPiano));
  return bufs.every(Boolean);
}

/** Sound these notes on the piano together for `seconds`, then let them go. */
export function playPiano(midis: number[], seconds = 1.2, a4 = 440, volume = 0.5) {
  if (!midis.every((m) => pianoReady.has(m))) {
    midis.forEach((m) => void loadPiano(m));
    return playNotes(midis, seconds, a4, volume);
  }
  const c = audio();
  const now = c.currentTime;
  const out = c.createGain();
  const level = volume / Math.max(1, Math.sqrt(midis.length));
  out.gain.setValueAtTime(level, now);
  out.gain.setValueAtTime(level, now + seconds);
  out.gain.linearRampToValueAtTime(0, now + seconds + 0.18);
  out.connect(c.destination);
  for (const m of midis) {
    const src = c.createBufferSource();
    src.buffer = pianoReady.get(m)!;
    // The samples are tuned to A440; the singer's A follows the tuner's setting.
    src.playbackRate.value = a4 / 440;
    src.connect(out);
    src.start(now);
    src.stop(now + seconds + 0.25);
  }
  setTimeout(() => out.disconnect(), (seconds + 0.5) * 1000);
}

/** Notes one after another - the timer's chime. */
export function playArpeggio(midis: number[], step = 0.18, a4 = 440) {
  midis.forEach((m, i) => setTimeout(() => playNotes([m], 0.6, a4, 0.4), i * step * 1000));
}

let drone: { out: GainNode; voices: { osc: OscillatorNode }[] } | null = null;

/** Start (or retune) the drone on these notes. */
export function startDrone(midis: number[], volume: number, a4 = 440) {
  const c = audio();
  stopDrone();
  const out = c.createGain();
  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 1600;
  out.connect(filter).connect(c.destination);
  out.gain.setValueAtTime(0, c.currentTime);
  out.gain.linearRampToValueAtTime(volume * 0.35, c.currentTime + 0.3);
  const voices = midis.map((m) => {
    const v = voice(c, midiToFreq(m, a4), 0.3, out);
    v.osc.start();
    return v;
  });
  drone = { out, voices };
}

export function setDroneVolume(volume: number) {
  if (!drone || !ctx) return;
  drone.out.gain.setTargetAtTime(volume * 0.35, ctx.currentTime, 0.05);
}

export function stopDrone() {
  if (!drone || !ctx) return;
  const { out, voices } = drone;
  const now = ctx.currentTime;
  out.gain.cancelScheduledValues(now);
  out.gain.setValueAtTime(out.gain.value, now);
  out.gain.linearRampToValueAtTime(0, now + 0.25);
  for (const v of voices) v.osc.stop(now + 0.3);
  setTimeout(() => out.disconnect(), 400);
  drone = null;
}
