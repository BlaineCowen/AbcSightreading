/**
 * How much of each note the pitch detector hears, replaying a sent run's
 * recording through it (the tracker as it stands) with the expected note set
 * as Grade sets it. A note the singer held in tune but the detector heard
 * little of is graded missed or cut short: Blaine's run of 8 October lost two
 * notes that way under the beat click (pitch-tracker EXPECTED_CLARITY).
 *
 *   bun run scripts/replay-grade-detect.ts grade-runs/<dir> [more dirs...]
 *   EXPECT=0  without the expected note, as before
 *
 * The recording is the raw microphone (no echo cancellation, so the click is
 * louder in it than in what Grade heard): a harder test, not the same one.
 * Each run is then graded from the replayed frames (gradePerformance, at the
 * run's own strictness) beside the score it got live.
 * Needs ffmpeg. Coverage: the share of each note's middle (20%-90%) carrying
 * its pitch, any octave, within 50 cents.
 */
import { execFileSync } from "child_process";
import { readFileSync } from "fs";
import { detectCandidates } from "../src/lib/tuner/autocorrelation";
import { PitchTracker } from "../src/lib/tuner/pitch-tracker";
import { DETECT_LATENCY_MS, gradePerformance } from "../src/lib/grade";

const SR = 48000, N = 2048;
/** MediaRecorder stamps its start late (grade-playback TAKE_ALIGN_MS). */
const TAKE_ALIGN_MS = 74;
const useExpect = process.env.EXPECT !== "0";
const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);

for (const dir of process.argv.slice(2)) {
  const run = JSON.parse(readFileSync(`${dir}/run.json`, "utf8"));
  if (run.settings?.mode !== "performance") {
    console.log(`${dir}: not a Pitch & rhythm run`);
    continue;
  }
  const pcm = execFileSync("ffmpeg", ["-loglevel", "error", "-i", `${dir}/recording.webm`, "-ac", "1", "-ar", String(SR), "-f", "f32le", "-"], { maxBuffer: 1 << 30 });
  const x = new Float32Array(pcm.buffer, pcm.byteOffset, pcm.byteLength / 4);
  const beat0 = (run.t0 - run.audio.startedAt + TAKE_ALIGN_MS) / 1000;
  const unit = 60 / run.tempo / run.beatUnits;
  const tracker = new PitchTracker("medium");
  const heard: { t: number; midi: number | null; db: number }[] = [];
  for (let s = 0; s + N < x.length; s += N) {
    const frame = x.subarray(s, s + N);
    let e = 0;
    for (const v of frame) e += v * v;
    const db = 10 * Math.log10(e / N + 1e-12);
    const end = (s + N) / SR - beat0;
    if (useExpect) {
      // As grade-runner sets it, from the time the frame is reported.
      // The recording has no detection delay: a frame holds the sound of its own time.
      const at = end * 1000;
      const early = 0.25 * run.beatUnits * unit * 1000;
      tracker.setExpected(run.notes
        .filter((n: any) => at >= n.startUnits * unit * 1000 - early && at < (n.startUnits + n.lengthUnits) * unit * 1000 + 100)
        .map((n: any) => hz(n.midi)));
    }
    const f = tracker.update(db > tracker.silenceDb ? detectCandidates(frame, SR) : [], db, (s + N) / SR * 1000);
    heard.push({ t: end - N / SR / 2, midi: f ? 69 + 12 * Math.log2(f / 440) : null, db });
  }
  const cover = run.notes.map((n: any) => {
    const a = (n.startUnits + 0.2 * n.lengthUnits) * unit, z = (n.startUnits + 0.9 * n.lengthUnits) * unit;
    const fs = heard.filter((h) => h.t >= a && h.t < z);
    const on = fs.filter((h) => h.midi !== null && Math.abs((((h.midi - n.midi) % 12) + 18) % 12 - 6) < 0.5);
    return fs.length ? on.length / fs.length : 0;
  });
  const mean = cover.reduce((a: number, b: number) => a + b, 0) / cover.length;
  console.log(`${dir.split("/").pop()}  click ${run.settings.click}  ${run.tempo} BPM  heard ${(100 * mean).toFixed(0)}%, ${cover.filter((c: number) => c < 0.4).length} of ${cover.length} notes under 40%`);
  console.log(`  ${cover.map((c: number) => Math.round(100 * c)).join(" ")}`);
  // As pitch-history keeps them: stamped when detected, DETECT_LATENCY_MS after the sound.
  const frames = heard.map((h) => {
    const midi = h.midi === null ? null : Math.round(h.midi);
    return { t: run.t0 + h.t * 1000 + DETECT_LATENCY_MS, midi, cents: h.midi === null ? 0 : Math.round(100 * (h.midi - midi!)), dbfs: h.db };
  });
  const g = gradePerformance({ notes: run.notes, rests: run.rests ?? [] }, frames, { t0: run.t0, bpm: run.tempo, beatUnits: run.beatUnits, strictness: run.settings.strictness ?? "standard" });
  console.log(`  graded from the replay: pitch ${g.pitch}, rhythm ${g.rhythm}, overall ${g.overall} (live: ${run.perf?.pitch}, ${run.perf?.rhythm}, ${run.perf?.overall})`);
}
