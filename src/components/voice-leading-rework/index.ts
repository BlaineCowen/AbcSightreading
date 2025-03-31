/**
 * @file index.ts
 * @description Main exports for voice leading system
 */

export * from "./types";
export * from "./voice-leading";
export * from "./chord-progression";
export * from "./abc-notation";
export * from "./sight-reading";

// Re-export commonly used functions
export { checkForIllegalVoiceLeading } from "./voice-leading";

export { generateChordProgression } from "./chord-progression";

export { toAbcNotation, formatAbcScore } from "./abc-notation";

export { createNewSr } from "./sight-reading";
