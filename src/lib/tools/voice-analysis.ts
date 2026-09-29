import { get, writable } from "svelte/store";
import { tuner } from "../tuner/store";
import { readSamples, readSpectrum } from "../tuner/controller";
import {
  LPC_BELOW_HZ,
  MAX_HZ,
  classifyVowel,
  estimateFormants,
  guessVoice,
  harmonicLevels,
  lpcFormants,
  noiseFloor,
  spectralEnvelope,
  toneMeasures,
  type HarmonicLevel,
  type VoiceType,
  type VowelGuess,
  type VowelId,
} from "../tuner/voice-spectrum";

/**
 * The Analysis tool's live reading of the voice, from the tuner's microphone:
 * the spectrum, the note's harmonics, the outline, F1 and F2, the vowel and
 * the tone measures. Runs only while a view is watching (watchVoice), about
 * twelve times a second. F1 and F2 are smoothed and the vowel is the most
 * common guess over the last half second, so the display settles rather than
 * flickering from frame to frame.
 */
export type VoiceReading = {
  /** The spectrum up to 5 kHz, dB per bin, and its bin width. */
  spectrum: Float32Array | null;
  binHz: number;
  f0: number | null;
  harmonics: HarmonicLevel[];
  envelope: Float32Array | null;
  formants: { f1: number; f2: number | null; fit: number } | null;
  vowel: VowelGuess | null;
  tone: ReturnType<typeof toneMeasures> | null;
};

const EMPTY: VoiceReading = { spectrum: null, binHz: 0, f0: null, harmonics: [], envelope: null, formants: null, vowel: null, tone: null };
export const voiceReading = writable<VoiceReading>(EMPTY);
/** Hold the display where it is, to study one moment. */
export const voiceFrozen = writable(false);

/**
 * Low voice (bass, baritone, tenor) or high (alto, soprano): where the vowels
 * sit depends on it, and the pitch cannot tell. The singer's choice is kept
 * on the device; until they make one, the first note sung sets a guess.
 */
const VOICE_KEY = "sr-voice-type";
let chosen: VoiceType | null = null;
try {
  const v = localStorage.getItem(VOICE_KEY);
  if (v === "low" || v === "high") chosen = v;
} catch {}
export const voiceType = writable<VoiceType | null>(chosen);
export function chooseVoice(v: VoiceType) {
  voiceType.set(v);
  try { localStorage.setItem(VOICE_KEY, v); } catch {}
}

const PERIOD_MS = 80;
const VOTES = 6;
let watchers = 0;
let raf = 0;
let lastRun = 0;
let lastVoiced = 0;
let smooth: { f1: number; f2: number | null } | null = null;
let votes: VowelId[] = [];

function step(now: number) {
  raf = requestAnimationFrame(step);
  if (now - lastRun < PERIOD_MS || get(voiceFrozen)) return;
  lastRun = now;

  const s = readSpectrum();
  if (!s) {
    voiceReading.set(EMPTY);
    return;
  }
  const binHz = s.sampleRate / s.fftSize;
  const spectrum = Float32Array.from(s.db.subarray(0, Math.floor(MAX_HZ / binHz)));
  const f0 = get(tuner).pitch;
  if (!f0) {
    // A breath between notes keeps the last reading of the vowel for a moment.
    if (now - lastVoiced > 600) { smooth = null; votes = []; }
    voiceReading.update((r) => ({ ...r, spectrum, binHz, f0: null, harmonics: [], envelope: null }));
    return;
  }
  lastVoiced = now;
  const harmonics = harmonicLevels(s, f0);
  const envelope = spectralEnvelope(s, f0);
  // Low and middle voices: LPC on the waveform; high voices, or when LPC
  // finds nothing, analysis by synthesis on the harmonics (voice-spectrum.ts).
  const raw = f0 < LPC_BELOW_HZ ? readSamples() : null;
  const lpc = raw ? lpcFormants(raw.samples, raw.sampleRate) : null;
  const est = lpc ? { ...lpc, fit: 0 } : estimateFormants(harmonics, f0, noiseFloor(s, f0));
  if (get(voiceType) === null) voiceType.set(guessVoice(f0));
  const voice = get(voiceType) ?? undefined;
  let formants: VoiceReading["formants"] = null;
  let vowel: VowelGuess | null = null;
  if (est) {
    smooth = smooth
      ? { f1: smooth.f1 * 0.6 + est.f1 * 0.4, f2: est.f2 === null ? smooth.f2 : smooth.f2 === null ? est.f2 : smooth.f2 * 0.6 + est.f2 * 0.4 }
      : { f1: est.f1, f2: est.f2 };
    formants = { ...smooth, fit: est.fit };
    const guess = classifyVowel(smooth, f0, voice);
    votes = [...votes, guess.vowel].slice(-VOTES);
    const counts = new Map<VowelId, number>();
    for (const v of votes) counts.set(v, (counts.get(v) ?? 0) + 1);
    const [top, n] = [...counts].sort((a, b) => b[1] - a[1])[0];
    vowel = { vowel: top, confidence: (n / votes.length) * (0.5 + 0.5 * guess.confidence), reliable: guess.reliable };
  }
  voiceReading.set({ spectrum, binHz, f0, harmonics, envelope, formants, vowel, tone: toneMeasures(harmonics, f0) });
}

/** Start the reading for a view; the returned function stops it again. */
export function watchVoice(): () => void {
  if (watchers++ === 0 && typeof window !== "undefined") raf = requestAnimationFrame(step);
  return () => {
    if (--watchers === 0) {
      cancelAnimationFrame(raf);
      voiceFrozen.set(false);
    }
  };
}
