import type { TunerFrame } from "./types";

export interface HistoryPoint {
  t: number; // performance.now() ms
  midi: number | null; // rounded nearest note, null = no pitch
  cents: number;
  dbfs: number;
}

const KEEP_MS = 45_000;

/**
 * Module-level ring buffer of recent analysis frames so the history graph
 * keeps recording while other tabs are shown.
 */
class PitchHistory {
  private points: HistoryPoint[] = [];

  push(frame: TunerFrame, t = performance.now()) {
    this.points.push({
      t,
      midi: frame.pitch ? midiOf(frame.pitch.name, frame.pitch.octave) : null,
      cents: frame.pitch?.cents ?? 0,
      dbfs: frame.dbfs,
    });
    const cutoff = t - KEEP_MS;
    let drop = 0;
    while (drop < this.points.length && this.points[drop].t < cutoff) drop++;
    if (drop) this.points.splice(0, drop);
  }

  /** Points newer than `sinceMs` ago, oldest first. */
  recent(sinceMs: number): HistoryPoint[] {
    const cutoff = performance.now() - sinceMs;
    let i = this.points.length;
    while (i > 0 && this.points[i - 1].t >= cutoff) i--;
    return this.points.slice(i);
  }
}

const NOTE_INDEX: Record<string, number> = {
  C: 0, "C#": 1, D: 2, "D#": 3, E: 4, F: 5, "F#": 6, G: 7, "G#": 8, A: 9, "A#": 10, B: 11,
};
function midiOf(name: string, octave: number) {
  return (octave + 1) * 12 + NOTE_INDEX[name];
}

export const pitchHistory = new PitchHistory();
