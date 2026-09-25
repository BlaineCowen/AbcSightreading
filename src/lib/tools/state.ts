import { derived, get, writable } from "svelte/store";
import { exercise } from "./context";
import { toolSettings } from "./settings";
import { tuner } from "../tuner/store";
import { NOTES } from "../tuner/pitch";
import { setDroneVolume, startDrone, stopDrone } from "./tone";

/**
 * Whether the drone is sounding. It outlives its card - a drone under the
 * singing is the point - so it is kept, and kept in tune with the exercise,
 * here rather than in the card: a new exercise in another key retunes it even
 * with the card closed.
 */
export const droneOn = writable(false);

/** The notes the drone should sound now, as one string, or "" for silence. */
const droneTarget = derived([droneOn, exercise, toolSettings, tuner], ([on, ex, s, t]) => {
  if (!on) return "";
  const root = (s.droneOctave + 1) * 12 + NOTES.indexOf(ex?.doNote ?? t.key);
  const notes = s.droneMode === "do" ? [root] : s.droneMode === "doso" ? [root, root + 7] : [root, root + 4, root + 7];
  return `${notes.join(",")}|${t.a4}`;
});

let wired = false;
export function initDrone() {
  if (wired || typeof window === "undefined") return;
  wired = true;
  let last = "";
  // The tuner store changes every frame with the mic on; only a change of
  // notes (or A4) restarts the drone.
  droneTarget.subscribe((target) => {
    if (target === last) return;
    last = target;
    if (!target) return stopDrone();
    const [notes, a4] = target.split("|");
    startDrone(notes.split(",").map(Number), get(toolSettings).droneVolume, Number(a4));
  });
  let volume = get(toolSettings).droneVolume;
  toolSettings.subscribe((s) => {
    if (s.droneVolume !== volume) setDroneVolume((volume = s.droneVolume));
  });
}
