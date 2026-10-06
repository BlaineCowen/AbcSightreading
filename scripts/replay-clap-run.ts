/**
 * Replays sent clap runs (scripts/grade-runs.ts pull) through the grading as
 * it is now, to see what a change does to real rooms:
 *
 *   bun run scripts/replay-clap-run.ts              # every run in grade-runs/
 *   bun run scripts/replay-clap-run.ts <dir> ...    # these
 *
 * Grades each run as it was set (who) and as the other mode, with the
 * recording standing in for the microphone's own 16 kHz copy (voicing).
 */
import { readdirSync, readFileSync } from "fs";
import { detectBursts, detectClaps, markVoiced, withoutClickEcho, type ClapAudio } from "../src/lib/clap-detect";
import { gradeClaps, type ClapWho } from "../src/lib/grade-rhythm";

const dirs = process.argv.slice(2).length ? process.argv.slice(2) : readdirSync("grade-runs").sort().map((d) => `grade-runs/${d}`);
for (const d of dirs) {
  const r = JSON.parse(readFileSync(`${d}/run.json`, "utf8"));
  if (!r.clapBlocks) continue;
  const pcm = Bun.spawnSync(["ffmpeg", "-v", "error", "-i", `${d}/recording.webm`, "-ac", "1", "-ar", "16000", "-f", "f32le", "-"]).stdout;
  const audio: ClapAudio | null = r.audio ? { t0: r.audio.startedAt, rate: 16000, samples: new Float32Array(pcm.buffer, pcm.byteOffset, pcm.byteLength / 4) } : null;
  const beat = 60000 / r.tempo;
  const lat = r.clapSettings.micLatencyMs ?? 45;
  const grade = (who: ClapWho) => {
    const heard = markVoiced(who === "class" ? detectBursts(r.clapBlocks) : detectClaps(r.clapBlocks), audio).map((c) => ({ ...c, t: c.t - lat }));
    const clicks = Array.from({ length: 8 }, (_, k) => r.t0 - (k + 1) * beat);
    if (r.clapSettings.click !== "off") for (let at = 0; at < 64 * beat; at += beat) clicks.push(r.t0 + at);
    return gradeClaps({ notes: r.notes, rests: r.rests }, withoutClickEcho(heard, clicks, r.t0 - 50), {
      t0: r.t0, bpm: r.tempo, beatUnits: r.beatUnits, strictness: r.settings.strictness, who, forgiveLag: r.clapSettings.micLatencyMs === null,
    });
  };
  const line = (who: ClapWho) => {
    const g = grade(who);
    return `${who.padEnd(5)} ${String(g.rhythm).padStart(3)} ${g.letter}  missed ${g.notes.filter((n) => n.missed).length}, strays ${g.strays.length} (${g.strays.reduce((a, s) => a + s.weight, 0).toFixed(1)}), ignored ${g.ignored.voiced} chant / ${g.ignored.merged} merged / ${g.ignored.quiet} quiet${g.soundedLikeClass ? ", HINT: sounded like a class" : ""}`;
  };
  const was = r.clapSettings.who as ClapWho;
  console.log(`${d.split("/").pop()!.slice(0, 19)}  ${r.tempo} bpm ${r.settings.strictness}${r.note ? `  "${r.note}"` : ""}`);
  console.log(`  sent as ${was}: ${r.claps.rhythm} ${r.claps.letter}`);
  console.log(`  now   ${line(was)}`);
  console.log(`  as    ${line(was === "solo" ? "class" : "solo")}`);
}
