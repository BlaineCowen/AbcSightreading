import { get, writable } from "svelte/store";
import type { EngineStatus, HarmonicAnalysis, NoteName, TunerFrame, DisplayMode } from "./types";
import { A4_DEFAULT, clampA4 } from "./pitch";
import { BPM_MAX, BPM_MIN } from "./metronome";
import type { Sensitivity } from "./pitch-tracker";
import type { Difficulty, Direction } from "./scale-challenge";
import { meterById } from "./meters";

/**
 * abcTuner's state: the settings a singer chooses (kept in this browser) and
 * the live reading from the microphone. The Svelte form of the tuner project's
 * zustand store - same fields, same actions - so the components read like the
 * originals: `$tuner.note` in markup, `tuner.get()` and the actions elsewhere.
 */

const IN_TUNE_CENTS = 5;
export const PLAY_OCTAVE_MIN = 2;
export const PLAY_OCTAVE_MAX = 6;
/** Low Do of the scale exercise; the scale runs an octave above this. */
export const CHALLENGE_OCTAVE_MIN = 2;
export const CHALLENGE_OCTAVE_MAX = 5;

export interface PlayingNote {
  name: NoteName;
  octave: number;
}

export interface TunerState {
  // Persisted settings
  key: NoteName;
  displayMode: DisplayMode;
  a4: number;
  sensitivity: Sensitivity;
  playOctave: number;
  sustain: boolean;
  bpm: number;
  /** The metronome's time signature, from meters.ts. Sets beatsPerBar. */
  meter: string;
  beatsPerBar: number;
  subdivision: number;
  accent: boolean;
  challengeDirection: Direction;
  challengeOctave: number;
  challengeShowTuner: boolean;
  challengeDifficulty: Difficulty;
  challengeGuideTone: boolean;
  // Live analysis, from the last frame
  pitch: number | null;
  note: NoteName | null;
  cents: number;
  octave: number | null;
  isInTune: boolean;
  dbfs: number;
  harmonics: HarmonicAnalysis | null;
  detection: TunerFrame["detection"];
  // Engine / UI
  engineStatus: EngineStatus;
  engineError: string | null;
  /** Frames delivered since the mic started; 0 means no audio is arriving. */
  framesReceived: number;
  engineRunningSince: number | null;
  playing: PlayingNote | null;
  metronomeRunning: boolean;
  /** 0-based beat within the bar, -1 when stopped. */
  metronomeBeat: number;
}

const PERSISTED = [
  "key", "displayMode", "a4", "sensitivity", "playOctave", "sustain", "bpm", "meter",
  "beatsPerBar", "subdivision", "accent", "challengeDirection", "challengeOctave",
  "challengeShowTuner", "challengeDifficulty", "challengeGuideTone",
] as const;
const STORAGE_KEY = "abc-tuner-settings";

const initial: TunerState = {
  key: "C",
  displayMode: "notes",
  a4: A4_DEFAULT,
  sensitivity: "medium",
  playOctave: 4,
  sustain: false,
  bpm: 90,
  meter: "4/4",
  beatsPerBar: 4,
  subdivision: 1,
  accent: true,
  challengeDirection: "up",
  challengeOctave: 3,
  challengeShowTuner: true,
  challengeDifficulty: "normal",
  challengeGuideTone: true,
  pitch: null,
  note: null,
  cents: 0,
  octave: null,
  isInTune: false,
  dbfs: -Infinity,
  harmonics: null,
  detection: { reason: null, clarity: 0, noiseFloorDb: -Infinity },
  engineStatus: "idle",
  engineError: null,
  framesReceived: 0,
  engineRunningSince: null,
  playing: null,
  metronomeRunning: false,
  metronomeBeat: -1,
};

function restored(): Partial<TunerState> {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    const out: Record<string, unknown> = {};
    for (const k of PERSISTED) if (k in saved) out[k] = saved[k];
    return out as Partial<TunerState>;
  } catch {
    return {};
  }
}

const start: TunerState = { ...initial, ...(typeof window !== "undefined" ? restored() : {}) };
// Settings saved before meters existed carry a beat count and no meter: the
// meter decides, so the two cannot disagree.
start.beatsPerBar = meterById(start.meter).beats;
const state = writable<TunerState>(start);

// Save the settings whenever one changes (never the live reading).
let lastSaved = "";
state.subscribe((s) => {
  if (typeof window === "undefined") return;
  const settings = JSON.stringify(Object.fromEntries(PERSISTED.map((k) => [k, s[k]])));
  if (settings === lastSaved) return;
  lastSaved = settings;
  try {
    localStorage.setItem(STORAGE_KEY, settings);
  } catch {}
});

const set = (patch: Partial<TunerState>) => state.update((s) => ({ ...s, ...patch }));
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export const tuner = {
  subscribe: state.subscribe,
  get: () => get(state),

  setKey: (key: NoteName) => set({ key }),
  setDisplayMode: (displayMode: DisplayMode) => set({ displayMode }),
  setA4: (hz: number) => set({ a4: clampA4(hz) }),
  setSensitivity: (sensitivity: Sensitivity) => set({ sensitivity }),
  setPlayOctave: (octave: number) => set({ playOctave: clamp(octave, PLAY_OCTAVE_MIN, PLAY_OCTAVE_MAX) }),
  toggleSustain: () => state.update((s) => ({ ...s, sustain: !s.sustain, playing: null })),
  setPlaying: (playing: PlayingNote | null) => set({ playing }),
  setFrame: ({ pitch, dbfs, harmonics, detection }: TunerFrame) =>
    state.update((s) => ({
      ...s,
      pitch: pitch?.frequency ?? null,
      note: pitch?.name ?? null,
      cents: pitch?.cents ?? 0,
      octave: pitch?.octave ?? null,
      isInTune: pitch ? Math.abs(pitch.cents) < IN_TUNE_CENTS : false,
      dbfs,
      harmonics,
      detection,
      framesReceived: s.framesReceived + 1,
    })),
  setEngineStatus: (engineStatus: EngineStatus, error: string | null = null) =>
    state.update((s) => ({
      ...s,
      engineStatus,
      engineError: error,
      ...(engineStatus === "starting" ? { framesReceived: 0 } : {}),
      engineRunningSince: engineStatus === "running" ? Date.now() : null,
    })),
  setBpm: (bpm: number) => set({ bpm: clamp(Math.round(bpm), BPM_MIN, BPM_MAX) }),
  setBeatsPerBar: (beatsPerBar: number) => set({ beatsPerBar }),
  /**
   * A time signature: its beat count, and a subdivision that makes sense in it
   * - the one already chosen if the meter has it, else the meter's own (6/8
   * starts on its three eighths).
   */
  setMeter: (id: string) =>
    state.update((s) => {
      const m = meterById(id);
      return {
        ...s,
        meter: m.id,
        beatsPerBar: m.beats,
        subdivision: m.subdivisions.includes(s.subdivision) ? s.subdivision : m.defaultSubdivision,
      };
    }),
  setSubdivision: (subdivision: number) => set({ subdivision }),
  toggleAccent: () => state.update((s) => ({ ...s, accent: !s.accent })),
  setMetronomeRunning: (metronomeRunning: boolean) => set({ metronomeRunning, metronomeBeat: -1 }),
  setMetronomeBeat: (metronomeBeat: number) => set({ metronomeBeat }),
  setChallengeDirection: (challengeDirection: Direction) => set({ challengeDirection }),
  setChallengeOctave: (octave: number) =>
    set({ challengeOctave: clamp(octave, CHALLENGE_OCTAVE_MIN, CHALLENGE_OCTAVE_MAX) }),
  toggleChallengeShowTuner: () => state.update((s) => ({ ...s, challengeShowTuner: !s.challengeShowTuner })),
  setChallengeDifficulty: (challengeDifficulty: Difficulty) => set({ challengeDifficulty }),
  toggleChallengeGuideTone: () => state.update((s) => ({ ...s, challengeGuideTone: !s.challengeGuideTone })),
};
