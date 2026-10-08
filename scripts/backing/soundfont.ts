/**
 * Single notes of a General MIDI instrument, for parts a track plays note by
 * note instead of from a loop (the blues has no pack of its own): the same
 * FluidR3 samples abcjs plays the exercises with (api/soundfont), fetched once
 * into ~/.cache/abc-backing and decoded by the engine like any sample.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const UPSTREAM = "https://paulrosen.github.io/midi-js-soundfonts/FluidR3_GM/";
const NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

/** The local path of `instrument`'s note `midi` (60 is middle C), downloaded the first time. */
export function soundfontNote(instrument: string, midi: number): string {
  const note = `${NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
  const dir = join(homedir(), ".cache/abc-backing/FluidR3_GM", `${instrument}-mp3`);
  const path = join(dir, `${note}.mp3`);
  if (!existsSync(path)) {
    mkdirSync(dir, { recursive: true });
    execFileSync("curl", ["-sSfL", "-o", path, `${UPSTREAM}${instrument}-mp3/${note}.mp3`]);
  }
  return path;
}
