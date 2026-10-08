import { get, writable } from "svelte/store";
import type { EngineStatus, HarmonicAnalysis, NoteName, TunerFrame, DisplayMode } from "./types";
import { A4_DEFAULT, clampA4 } from "./pitch";
import { BPM_MAX, BPM_MIN } from "./metronome";
import type { Sensitivity } from "./pitch-tracker";
import type { Difficulty, Direction } from "./scale-challenge";
import { carrySubdivision, meterById } from "./meters";
import { DEFAULT_CLICK_SOUND, toClickSound, type ClickSound } from "./click-sounds";
import { BEAT_LEVELS, beatLevelsFor, beatLevelsFrom, subMaskFrom, type BeatLevel } from "./click-pattern";
import { DEFAULT_ASSISTANT, assistantFrom, type AssistantSettings } from "./practice-assistant";

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
  /** The metronome's sound, from click-sounds.ts. */
  clickSound: ClickSound;
  beatsPerBar: number;
  subdivision: number;
  accent: boolean;
  /** Each beat's level (click-pattern.ts); null: beat 1 by `accent`, the rest normal. */
  beatLevels: BeatLevel[] | null;
  /** Which slots of each beat sound, "01" the off-beat; null: every slot. */
  subMask: string | null;
  /** The practice assistant: ramp, silent bars, dropped beats, time limit, count-in (practice-assistant.ts). */
  assistant: AssistantSettings;
  challengeDirection: Direction;
  challengeOctave: number;
  challengeShowTuner: boolean;
  challengeDifficulty: Difficulty;
  challengeGuideTone: boolean;
  /** Grade's reference before the count-in: the first note, or the tonic chord. */
  gradeReference: "note" | "triad";
  /** Grade: Pitch only (the cursor waits on each note) or Pitch & rhythm (in time). */
  gradeMode: "pitch" | "performance";
  /** Grade's leniency (grade.ts STRICTNESS). */
  gradeStrictness: "easy" | "standard" | "strict";
  /** Pitch & rhythm: the cursor while singing (the page's own modes). */
  gradeCursor: "off" | "smooth" | "beat" | "note";
  /** Pitch & rhythm: the click while singing - none, beats, or beats with their subdivision. */
  gradeClick: "off" | "beat" | "sub";
  /** Grade has the microphone: closing a Tools card must not stop it. */
  micHeld: boolean;
  /** Grading a rhythm (grade-rhythm.ts): clapped into the microphone, or tapped on the spacebar and pad. */
  gradeClapInput: "mic" | "keys";
  /** One person, or a class graded as one room. */
  gradeWho: "solo" | "class";
  /** The click while a rhythm is clapped; the count-in always clicks. Off by default, so the speaker is not heard as claps. */
  gradeClapClick: "off" | "beat" | "sub";
  /** Which edge the tap pad sits on. */
  tapPadSide: "right" | "left";
  /** The microphone's delay for claps, in ms, from Check timing (null: the default). */
  clapLatencyMs: number | null;
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
  /** Ticking on its own. Never while an exercise plays: Play stops it. */
  metronomeRunning: boolean;
  /** The click plays with an exercise's playback (the practice pages). */
  clickWithMusic: boolean;
  /** One level, 0-1, for the metronome and the click under an exercise. */
  metronomeVolume: number;
  /** A practice page's exercise is playing (not saved). */
  exercisePlaying: boolean;
  /** That playback is clicking - see metronome-link.ts (not saved). */
  musicClick: boolean;
  /** 0-based beat within the bar, -1 when stopped. */
  metronomeBeat: number;
  /** While the metronome runs (not saved): its bar (negative in the count-in), tempo now, whether the bar is silent, seconds run. */
  metronomeLive: { bar: number; bpm: number; silent: boolean; seconds: number } | null;
}

const PERSISTED = [
  "key", "displayMode", "a4", "sensitivity", "playOctave", "sustain", "bpm", "meter", "clickSound",
  "beatsPerBar", "subdivision", "accent", "beatLevels", "subMask", "assistant", "challengeDirection", "challengeOctave",
  "challengeShowTuner", "challengeDifficulty", "challengeGuideTone", "clickWithMusic", "metronomeVolume", "gradeReference",
  "gradeMode", "gradeStrictness", "gradeCursor", "gradeClick", "gradeClapInput", "gradeWho", "gradeClapClick", "tapPadSide", "clapLatencyMs",
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
  clickSound: DEFAULT_CLICK_SOUND,
  beatsPerBar: 4,
  subdivision: 1,
  accent: true,
  beatLevels: null,
  subMask: null,
  assistant: DEFAULT_ASSISTANT,
  challengeDirection: "up",
  challengeOctave: 3,
  challengeShowTuner: true,
  challengeDifficulty: "normal",
  challengeGuideTone: true,
  // Grade's defaults: in time, gently judged, the cursor stepping a beat at a
  // time, the key given before the count-in.
  gradeReference: "triad",
  gradeMode: "performance",
  gradeStrictness: "easy",
  gradeCursor: "beat",
  gradeClick: "beat",
  micHeld: false,
  gradeClapInput: "mic",
  gradeWho: "solo",
  gradeClapClick: "off",
  tapPadSide: "right",
  clapLatencyMs: null,
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
  clickWithMusic: true,
  metronomeVolume: 0.5,
  exercisePlaying: false,
  musicClick: false,
  metronomeBeat: -1,
  metronomeLive: null,
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
// Kept only while they fit the bar and the grid.
start.beatLevels = beatLevelsFrom(start.beatLevels, start.beatsPerBar);
start.subMask = subMaskFrom(start.subMask, start.subdivision);
start.assistant = assistantFrom(start.assistant);
// Sounds saved before the samples changed map to the nearest new one.
start.clickSound = toClickSound(start.clickSound) ?? DEFAULT_CLICK_SOUND;
// Once: the release that brought the new sounds sent the old woodblock default
// to Block and saved it, so nearly everyone on Block never chose it. Quartz is
// the default; a Block chosen after this stays.
if (typeof window !== "undefined") {
  try {
    if (!localStorage.getItem("abc-click-sounds-v2")) {
      if (start.clickSound === "block") start.clickSound = DEFAULT_CLICK_SOUND;
      localStorage.setItem("abc-click-sounds-v2", "1");
    }
  } catch {}
}
if (typeof start.clickWithMusic !== "boolean") start.clickWithMusic = true;
// Grade's cursor defaulted to smooth before beat by beat; nobody chose it, so once it moves.
if (typeof window !== "undefined") {
  try {
    if (!localStorage.getItem("abc-grade-cursor-v2")) {
      if (start.gradeCursor === "smooth") start.gradeCursor = "beat";
      localStorage.setItem("abc-grade-cursor-v2", "1");
    }
  } catch {}
}
if (!(start.metronomeVolume >= 0 && start.metronomeVolume <= 1)) start.metronomeVolume = 0.5;
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
  setClickSound: (clickSound: ClickSound) => set({ clickSound }),
  /**
   * A time signature: its beat count, and a subdivision that makes sense in it
   * - the one already chosen if the meter has it (carried by meaning across
   * simple and compound: eighths stay eighths), else the meter's own (6/8
   * starts on its three eighths).
   */
  setMeter: (id: string) =>
    state.update((s) => {
      const m = meterById(id);
      const kept = carrySubdivision(meterById(s.meter), m, s.subdivision);
      const subdivision = m.subdivisions.includes(kept) ? kept : m.defaultSubdivision;
      return {
        ...s,
        meter: m.id,
        beatsPerBar: m.beats,
        subdivision,
        // Levels belong to a bar's beats, a mask to its grid: kept while they fit.
        beatLevels: beatLevelsFrom(s.beatLevels, m.beats),
        subMask: subMaskFrom(s.subMask, subdivision),
      };
    }),
  setSubdivision: (subdivision: number) => state.update((s) => ({ ...s, subdivision, subMask: subMaskFrom(s.subMask, subdivision) })),
  /** A rhythm for each beat: a grid and the slots that sound (click-pattern.ts SUB_PATTERNS). */
  setSubPattern: (subdivision: number, mask: string | null) => set({ subdivision, subMask: subMaskFrom(mask, subdivision) }),
  /** Beat `i`'s level; a bar back at beat 1 accented and the rest normal goes back to null. */
  setBeatLevel: (i: number, level: BeatLevel) =>
    state.update((s) => {
      const levels = beatLevelsFor({ beats: s.beatsPerBar, accent: s.accent, beatLevels: s.beatLevels });
      if (i < 0 || i >= levels.length) return s;
      levels[i] = level;
      const plain = levels.every((l, j) => l === (j === 0 ? "accent" : "normal"));
      return { ...s, beatLevels: plain ? null : levels, accent: plain ? true : s.accent };
    }),
  /** Every beat's level at once (a preset's), kept only when it fits the bar. */
  setBeatLevels: (levels: BeatLevel[] | null) => state.update((s) => ({ ...s, beatLevels: beatLevelsFrom(levels, s.beatsPerBar) })),
  /** Change part of the practice assistant: setAssistant("ramp", { on: true }). */
  setAssistant: <K extends keyof AssistantSettings>(part: K, patch: Partial<AssistantSettings[K]>) =>
    state.update((s) => ({ ...s, assistant: assistantFrom({ ...s.assistant, [part]: { ...s.assistant[part], ...patch } }) })),
  /** Tap a beat: accent, normal, soft, off, and round. */
  cycleBeatLevel: (i: number) =>
    state.update((s) => {
      const levels = beatLevelsFor({ beats: s.beatsPerBar, accent: s.accent, beatLevels: s.beatLevels });
      if (i < 0 || i >= levels.length) return s;
      levels[i] = BEAT_LEVELS[(BEAT_LEVELS.indexOf(levels[i]) + 1) % BEAT_LEVELS.length];
      return { ...s, beatLevels: levels };
    }),
  // The accent switch speaks for beat 1: with levels set, it sets beat 1's.
  toggleAccent: () =>
    state.update((s) => {
      const accent = !s.accent;
      if (!s.beatLevels) return { ...s, accent };
      const levels = [...s.beatLevels];
      levels[0] = accent ? "accent" : "normal";
      return { ...s, accent, beatLevels: levels };
    }),
  setClickWithMusic: (clickWithMusic: boolean) => set({ clickWithMusic }),
  setPlayback: (exercisePlaying: boolean, musicClick: boolean) => set({ exercisePlaying, musicClick }),
  setMetronomeVolume: (v: number) => set({ metronomeVolume: clamp(Number.isFinite(v) ? v : 0.5, 0, 1) }),
  setMetronomeRunning: (metronomeRunning: boolean) => set({ metronomeRunning, metronomeBeat: -1, metronomeLive: null }),
  setMetronomeLive: (metronomeLive: TunerState["metronomeLive"]) => set({ metronomeLive }),
  setMetronomeBeat: (metronomeBeat: number) => set({ metronomeBeat }),
  setChallengeDirection: (challengeDirection: Direction) => set({ challengeDirection }),
  setChallengeOctave: (octave: number) =>
    set({ challengeOctave: clamp(octave, CHALLENGE_OCTAVE_MIN, CHALLENGE_OCTAVE_MAX) }),
  toggleChallengeShowTuner: () => state.update((s) => ({ ...s, challengeShowTuner: !s.challengeShowTuner })),
  setChallengeDifficulty: (challengeDifficulty: Difficulty) => set({ challengeDifficulty }),
  toggleChallengeGuideTone: () => state.update((s) => ({ ...s, challengeGuideTone: !s.challengeGuideTone })),
  setGradeReference: (gradeReference: "note" | "triad") => set({ gradeReference }),
  setGrade: (
    patch: Partial<Pick<TunerState, "gradeMode" | "gradeStrictness" | "gradeCursor" | "gradeClick" | "gradeClapInput" | "gradeWho" | "gradeClapClick" | "tapPadSide" | "clapLatencyMs">>,
  ) => set(patch),
  setMicHeld: (micHeld: boolean) => set({ micHeld }),
};
