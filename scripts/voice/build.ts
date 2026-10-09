/**
 * The metronome's counting voice (src/lib/tuner/voice-count.ts): every word
 * it says, made with espeak-ng's plain robot voice (Blaine's pick, 8 October
 * 2026; generated, so no licence attaches and any word can be added), into
 * public/voice/robot/<word>.mp3, with manifest.json holding each word's
 * lead-in: the seconds from the file's start until its loudness first reaches
 * half its peak (10 ms windows) - the vowel, where the word is heard to land.
 * The metronome starts each word that much early. Without it "four" landed
 * about 120 ms after "eight".
 *
 *   brew install espeak-ng ffmpeg
 *   bun run scripts/voice/build.ts
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { VOICE_WORDS } from "../../src/lib/tuner/voice-count";

const OUT = "public/voice/robot";
const ESPEAK = ["-v", "en-us", "-s", "150"];

function run(cmd: string, args: string[], input?: Buffer) {
  const r = spawnSync(cmd, args, { input, maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`${cmd} failed: ${r.stderr?.toString().slice(0, 300)}`);
  return r.stdout;
}

/** Seconds until the loudness (10 ms RMS) first reaches half its peak. */
function leadIn(pcm: Float32Array, rate: number): number {
  const w = Math.round(rate * 0.01);
  const env: number[] = [];
  for (let i = 0; i + w <= pcm.length; i += w) {
    let e = 0;
    for (let j = i; j < i + w; j++) e += pcm[j] * pcm[j];
    env.push(Math.sqrt(e / w));
  }
  const peak = Math.max(...env);
  return Math.max(0, env.findIndex((v) => v >= peak * 0.5)) * 0.01;
}

mkdirSync(OUT, { recursive: true });
const tmp = join(tmpdir(), "abc-voice");
mkdirSync(tmp, { recursive: true });
const manifest: Record<string, { file: string; leadIn: number; seconds: number }> = {};
for (const [key, spoken] of Object.entries(VOICE_WORDS)) {
  const wav = join(tmp, `${key}.wav`);
  run("espeak-ng", [...ESPEAK, "-w", wav, spoken]);
  const file = `${key}.mp3`;
  // Trim the silence espeak leaves before the word, even out the level, 44.1 kHz mono.
  const af = "silenceremove=start_periods=1:start_threshold=-45dB,loudnorm=I=-16:TP=-1.5";
  run("ffmpeg", ["-loglevel", "error", "-y", "-i", wav, "-af", af, "-ar", "44100", "-ac", "1", "-b:a", "96k", join(OUT, file)]);
  // Measure the encoded file as the browser will decode it (mp3 adds its own delay).
  const raw = run("ffmpeg", ["-loglevel", "error", "-i", join(OUT, file), "-f", "f32le", "-ac", "1", "-ar", "44100", "-"]);
  const pcm = new Float32Array(raw.buffer, raw.byteOffset, Math.floor(raw.byteLength / 4));
  manifest[key] = { file, leadIn: +leadIn(pcm, 44100).toFixed(3), seconds: +(pcm.length / 44100).toFixed(3) };
}
writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 1) + "\n");
writeFileSync(join(OUT, "CREDITS.txt"), "Made with espeak-ng (https://github.com/espeak-ng/espeak-ng), voice en-us, rate 150, by scripts/voice/build.ts.\nGenerated speech: no licence attaches to it.\n");
rmSync(tmp, { recursive: true, force: true });
console.log(`${Object.keys(manifest).length} words into ${OUT}`);
