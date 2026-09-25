import { get, writable } from "svelte/store";

/**
 * The practice tools' own settings, kept in this browser: which tool was last
 * open, how the drone sounds, whether the metronome follows the exercise, and
 * the timer's length.
 */

export type ToolId = "tuner" | "metronome" | "drone" | "pitches" | "analysis" | "timer";
export type DroneMode = "do" | "doso" | "chord";

export interface ToolSettings {
  lastTool: ToolId;
  followExercise: boolean;
  droneMode: DroneMode;
  /** 3 sits under most voices; 4 under trebles. */
  droneOctave: 3 | 4;
  droneVolume: number;
  timerMinutes: number;
}

const KEY = "abc-tools-settings";
const defaults: ToolSettings = {
  lastTool: "tuner",
  followExercise: true,
  droneMode: "do",
  droneOctave: 3,
  droneVolume: 0.5,
  timerMinutes: 10,
};

function restored(): ToolSettings {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return defaults;
  }
}

export const toolSettings = writable<ToolSettings>(typeof window === "undefined" ? defaults : restored());
toolSettings.subscribe((s) => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {}
});
export const setTool = (patch: Partial<ToolSettings>) => toolSettings.set({ ...get(toolSettings), ...patch });
