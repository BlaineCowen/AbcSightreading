export type NoteName =
  | "C"
  | "C#"
  | "D"
  | "D#"
  | "E"
  | "F"
  | "F#"
  | "G"
  | "G#"
  | "A"
  | "A#"
  | "B";
export type SolfegeName =
  | "Do"
  | "Di"
  | "Re"
  | "Ri"
  | "Mi"
  | "Fa"
  | "Fi"
  | "Sol"
  | "Si"
  | "La"
  | "Li"
  | "Ti";

export interface Note {
  frequency: number;
  name: NoteName;
  octave: number;
  cents: number;
}

export type DisplayMode = "notes" | "solfege";

export const NOTE_TO_SOLFEGE: Record<NoteName, SolfegeName> = {
  C: "Do",
  "C#": "Di",
  D: "Re",
  "D#": "Ri",
  E: "Mi",
  F: "Fa",
  "F#": "Fi",
  G: "Sol",
  "G#": "Si",
  A: "La",
  "A#": "Li",
  B: "Ti",
};

/** One detected overtone partial, k = 1 is the fundamental. */
export interface Harmonic {
  k: number;
  freqHz: number;
  db: number;
  /** Linear amplitude normalised so the strongest partial is 1. */
  amplitude: number;
}

export interface HarmonicAnalysis {
  harmonics: Harmonic[];
  /** Harmonic-to-total energy ratio in the analysed band, 0..1. */
  hnr: number;
  centroidHz: number;
  /** Spectral centroid relative to f0, normalised to 0..1. */
  brightness: number;
}

export interface DetectedPitch extends Note {
  clarity: number;
}

/** One analysis frame emitted by the TunerEngine per audio buffer. */
export interface TunerFrame {
  pitch: DetectedPitch | null;
  rms: number;
  dbfs: number;
  harmonics: HarmonicAnalysis | null;
  /** Why no pitch this frame, plus the levels behind that call. */
  detection: {
    reason: "silent" | "quiet" | "unclear" | "confirming" | "self-playing" | null;
    clarity: number;
    noiseFloorDb: number;
  };
}

export type EngineStatus = "idle" | "starting" | "running" | "error";
