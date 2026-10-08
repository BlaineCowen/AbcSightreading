/**
 * Does the click cost the singer? Grade listens with echo cancellation on,
 * which turns the microphone down while the speakers sound - so with the click
 * on, the voice may dip on every beat, which is where notes start and where
 * rhythm and pitch are judged.
 *
 * A dip at a note's start proves nothing (the voice starts there anyway), so
 * this looks only inside held notes: a half note's second beat is a click in
 * the middle of a steady sound. For each such beat it compares the pitch
 * frames grading heard just after the click with those just before: loudness
 * (dBFS) and how many still carry a pitch. A run with the click off is the
 * control. Frames are moved by the run's own latencies to where the sound was.
 *
 *   bun run scripts/check-click-dips.ts grade-runs/<dir> [more dirs...]
 */
import { readFileSync } from "fs";

type Frame = { t: number; midi: number | null; cents: number; dbfs: number };
type Run = {
  tempo: number; beatUnits: number; t0: number; detectLatencyMs?: number; outputLatencyMs?: number;
  settings?: { mode?: string; click?: string };
  notes: { startUnits: number; lengthUnits: number }[];
  frames: Frame[];
};

/** Just after the click (where a dip would be), and the steady stretch before it. */
const AFTER: [number, number] = [0, 180];
const BEFORE: [number, number] = [-260, -60];

export function clickDips(run: Run) {
  const beatMs = 60_000 / run.tempo;
  const unitMs = beatMs / run.beatUnits;
  // Frames are stamped when detected; the sound was DETECT earlier. A click is
  // heard OUTPUT after it is scheduled.
  const lag = (run.detectLatencyMs ?? 110) + (run.outputLatencyMs ?? 0);
  const at = (from: number, to: number) => run.frames.filter((f) => f.t >= from + lag && f.t < to + lag);
  const rows: { after: Frame[]; before: Frame[] }[] = [];
  for (const n of run.notes) {
    const start = run.t0 + n.startUnits * unitMs;
    const end = start + n.lengthUnits * unitMs;
    // Each beat inside the note, not its first: a click on a held sound.
    for (let b = start + beatMs; b + AFTER[1] <= end - 60; b += beatMs) {
      rows.push({ after: at(b + AFTER[0], b + AFTER[1]), before: at(b + BEFORE[0], b + BEFORE[1]) });
    }
  }
  const voiced = (fs: Frame[]) => (fs.length ? fs.filter((f) => f.midi !== null).length / fs.length : NaN);
  const level = (fs: Frame[]) => {
    const v = fs.filter((f) => f.midi !== null && Number.isFinite(f.dbfs));
    return v.length ? v.reduce((s, f) => s + f.dbfs, 0) / v.length : NaN;
  };
  const after = rows.flatMap((r) => r.after);
  const before = rows.flatMap((r) => r.before);
  return {
    beats: rows.length,
    click: run.settings?.click ?? "?",
    voicedBefore: voiced(before),
    voicedAfter: voiced(after),
    dbBefore: level(before),
    dbAfter: level(after),
  };
}

if (import.meta.main) {
  const dirs = process.argv.slice(2);
  if (!dirs.length) {
    console.log("usage: bun run scripts/check-click-dips.ts grade-runs/<dir> [...]");
    process.exit(1);
  }
  const pct = (x: number) => (Number.isFinite(x) ? `${Math.round(100 * x)}%` : "-");
  const db = (x: number) => (Number.isFinite(x) ? `${x.toFixed(1)} dB` : "-");
  for (const dir of dirs) {
    const run = JSON.parse(readFileSync(`${dir.replace(/\/$/, "")}/run.json`, "utf8")) as Run;
    if (!run.frames?.length) {
      console.log(`${dir}: no pitch frames (a clap run, or Note by note)`);
      continue;
    }
    const r = clickDips(run);
    console.log(
      `${dir}\n  click ${r.click}, ${r.beats} held beats` +
        `\n  pitch heard: ${pct(r.voicedBefore)} before the beat, ${pct(r.voicedAfter)} just after` +
        `\n  loudness:    ${db(r.dbBefore)} before, ${db(r.dbAfter)} just after (${db(r.dbAfter - r.dbBefore)})`,
    );
  }
}
