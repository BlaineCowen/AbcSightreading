import abcjs from "abcjs";
import { withPlaybackTranspose } from "./transpose";

/**
 * The files the Print / Export menu hands over, built from the ABC on screen.
 * Pure - no DOM - so the tests can open what they produce; `download.ts` does
 * the saving.
 */

export const EXPORT_TYPES = {
  musicxml: { ext: "musicxml", mime: "application/vnd.recordare.musicxml+xml" },
  midi: { ext: "mid", mime: "audio/midi" },
  abc: { ext: "abc", mime: "text/vnd.abc;charset=utf-8" },
} as const;

export type ExportType = keyof typeof EXPORT_TYPES;

/**
 * A standard MIDI file of the ABC, at the tempo and transposition the page is
 * playing at. `qpm` is not optional: unison ABC carries no Q: line, and abcjs
 * falls back to 180 BPM without one. The transposition is written into the
 * voices, as for playback - `midiTranspose` never reached the tenor.
 */
export function midiFileFor(abc: string, opts: { bpm: number; transpose?: number }): Uint8Array {
  const [tune] = abcjs.parseOnly(withPlaybackTranspose(abc, opts.transpose ?? 0));
  const file = (abcjs.synth as any).getMidiFile(tune, {
    midiOutputType: "binary",
    qpm: opts.bpm,
  });
  if (!(file instanceof Uint8Array) || file.length === 0) {
    throw new Error("The MIDI file could not be written.");
  }
  return file;
}

/** The ABC with its tempo set, replacing a Q: line or adding one. */
export function withTempo(abc: string, bpm: number): string {
  const q = `Q:1/4=${Math.round(bpm)}`;
  if (/^Q:.*$/m.test(abc)) return abc.replace(/^Q:.*$/m, q);
  // A header field goes in the header: after L:, else M:, else X:.
  for (const field of ["L", "M", "X"]) {
    const line = new RegExp(`^${field}:.*$`, "m");
    if (line.test(abc)) return abc.replace(line, (found) => `${found}\n${q}`);
  }
  return `${q}\n${abc}`;
}

/**
 * e.g. `choral-E-flat-major-3-4-2026-09-21.musicxml`: what it is, in a key and
 * meter a reader can see in a folder listing, and the day it was saved -
 * everything is generated, so there is no title worth using.
 */
export function exportFileName(
  what: { page: "choral" | "unison" | "rhythm"; key?: string; meter: string; date?: Date },
  type: ExportType
): string {
  const date = what.date ?? new Date();
  const day = [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((n) => String(n).padStart(2, "0"))
    .join("-");
  const parts = [what.page, what.key ? keyWords(what.key) : null, what.meter.replace("/", "-"), day];
  return `${parts.filter(Boolean).join("-")}.${EXPORT_TYPES[type].ext}`;
}

/**
 * The key and meter an exercise is written in, read from its ABC - the
 * settings panel can already have moved on to the next exercise's.
 */
export function keyAndMeterOf(abc: string): { key?: string; meter: string } {
  const meter = abc.match(/^M:\s*(\d+\/\d+)/m)?.[1] ?? "4/4";
  const key = abc.match(/^K:\s*([A-G][#b]?m?)\b/m)?.[1];
  return key ? { key, meter } : { meter };
}

/** "F#m" -> "F-sharp-minor", "Eb" -> "E-flat-major". */
function keyWords(key: string): string {
  const match = key.match(/^([A-G])([#b]?)(m?)$/);
  if (!match) return key.replace(/[^A-Za-z0-9]+/g, "-");
  const [, letter, accidental, minor] = match;
  const sign = accidental === "#" ? "-sharp" : accidental === "b" ? "-flat" : "";
  return `${letter}${sign}-${minor ? "minor" : "major"}`;
}
