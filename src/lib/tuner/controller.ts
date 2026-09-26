import { TunerEngine } from "./tuner-engine";
import { NotePlayer } from "./note-player";
import { metronome } from "./metronome";
import { pitchHistory } from "./pitch-history";
import { tuner, type TunerState } from "./store";
import { meterById } from "./meters";
import { noteToFreq } from "./pitch";

/**
 * The page's audio singletons - the mic TunerEngine, the wedge NotePlayer and
 * the metronome - kept in step with the store. The Svelte form of the tuner
 * project's useTunerEngine hook: one per page, shared by the abcTuner tabs and
 * the practice pages' tuner widget, so there is only ever one microphone open.
 *
 * `startTuner` must run from a user gesture, so the AudioContext may start.
 */

let engine: TunerEngine | null = null;
let player: NotePlayer | null = null;
let wired = false;

/** Subscribes the audio objects to the settings. Safe to call more than once. */
export function initTuner() {
  if (wired || typeof window === "undefined") return;
  wired = true;
  let last = tuner.get();
  metronome.onBeat = (beat) => tuner.setMetronomeBeat(beat);
  tuner.subscribe((s) => {
    if (s.a4 !== last.a4) engine?.setA4(s.a4);
    if (s.sensitivity !== last.sensitivity) engine?.setSensitivity(s.sensitivity);

    // Detection pauses while the app itself sounds a note, and the wedge
    // note follows `playing`.
    if (s.playing !== last.playing || s.a4 !== last.a4) {
      engine?.setSelfPlaying(s.playing !== null);
      player ??= new NotePlayer();
      if (s.playing) player.play(noteToFreq(s.playing.name, s.playing.octave, s.a4));
      else player.stop();
    }

    if (
      s.bpm !== last.bpm ||
      s.meter !== last.meter ||
      s.beatsPerBar !== last.beatsPerBar ||
      s.subdivision !== last.subdivision ||
      s.accent !== last.accent ||
      s.clickSound !== last.clickSound
    ) {
      metronome.configure(metronomeSettings(s));
    }
    if (s.metronomeRunning !== last.metronomeRunning) {
      if (s.metronomeRunning) metronome.start();
      else metronome.stop();
    }
    last = s;
  });
  metronome.configure(metronomeSettings(tuner.get()));
}

const metronomeSettings = (s: TunerState) => ({
  bpm: s.bpm,
  beatsPerBar: s.beatsPerBar,
  subdivision: s.subdivision,
  accent: s.accent,
  groupStarts: meterById(s.meter).groupStarts,
  sound: s.clickSound,
});

export async function startTuner() {
  initTuner();
  const s = tuner.get();
  if (!engine) {
    engine = new TunerEngine();
    engine.onFrame((frame) => {
      tuner.setFrame(frame);
      pitchHistory.push(frame);
    });
  }
  engine.setA4(s.a4);
  engine.setSensitivity(s.sensitivity);
  engine.setSelfPlaying(s.playing !== null);
  tuner.setEngineStatus("starting");
  try {
    await engine.start();
    tuner.setEngineStatus("running");
  } catch (error) {
    console.error("Failed to start tuner:", error);
    tuner.setEngineStatus(
      "error",
      error instanceof Error ? `${error.name}: ${error.message}` : String(error)
    );
  }
}

/** Closes the microphone. Settings and the metronome are left as they are. */
export function stopTuner() {
  engine?.stop();
  tuner.setPlaying(null);
  tuner.setEngineStatus("idle");
}
