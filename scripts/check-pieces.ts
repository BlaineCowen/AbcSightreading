/**
 * Imports real MusicXML exports and checks what we make of them.
 *
 *   bun run scripts/check-pieces.ts <file or folder>...
 *
 * For each file: the import summary (parts, bars, what was left out), then
 * the whole piece written as ABC (abcjs's warnings, and whether every drawn
 * note pairs with a model note), then every 4-bar excerpt played by abcjs
 * against the model: the same pitches at the same times. Real files go in
 * pieces-samples/ (gitignored); they are other people's music.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import abcjs from "abcjs";
import { readMusicXml } from "../src/lib/pieces/read-musicxml";
import { abcForPiece, drawnElements } from "../src/lib/pieces/write-abc";
import { TICKS, describeScore } from "../src/lib/pieces/model";

type Tune = Parameters<typeof drawnElements>[0] & {
  warnings?: string[];
  setUpAudio: (o: object) => { tracks: { cmd: string; pitch: number; start: number }[][] };
};

const files = process.argv.slice(2).flatMap((p) =>
  statSync(p).isDirectory()
    ? readdirSync(p).filter((f) => /\.(mxl|musicxml|xml)$/i.test(f)).map((f) => join(p, f))
    : [p],
);
if (files.length === 0) {
  console.log("usage: bun run scripts/check-pieces.ts <file or folder>...");
  process.exit(1);
}

let bad = 0;
for (const file of files) {
  const started = performance.now();
  let score;
  try {
    score = readMusicXml(new Uint8Array(readFileSync(file)), file.split("/").pop());
  } catch (e) {
    console.log(`✗ ${file}: ${(e as Error).message}`);
    bad++;
    continue;
  }
  const ms = Math.round(performance.now() - started);
  console.log(`\n${file}\n  "${score.title}"${score.composer ? ` by ${score.composer}` : ""}: ${describeScore(score)} (${ms} ms)`);
  console.log(`  parts: ${score.parts.map((p) => `${p.name} [${p.program}${p.transpose ? ` ${p.transpose}` : ""}, ${p.staves} staff]`).join(", ")}`);
  for (const w of score.warnings) console.log(`  left out: ${w}`);

  const whole = abcForPiece(score, { title: true });
  const [tune] = abcjs.parseOnly(whole.abc) as unknown as Tune[];
  const warnings = tune.warnings ?? [];
  if (warnings.length) {
    bad++;
    console.log(`  ✗ abcjs: ${warnings.length} warnings, first: ${warnings[0].replace(/<[^>]+>/g, "")}`);
  }
  const drawn = drawnElements(tune, whole.staves);
  const misaligned = whole.voices.filter((v) => drawn.get(v.id)?.length !== v.elements.length);
  if (misaligned.length) {
    bad++;
    console.log(`  ✗ element map: ${misaligned.map((v) => `${v.id} ${drawn.get(v.id)?.length} drawn vs ${v.elements.length}`).join(", ")}`);
  }

  let windows = 0;
  let wrong = 0;
  for (let from = 0; from < score.measures.length; from += 4) {
    const to = Math.min(score.measures.length - 1, from + 3);
    const { abc, startTick } = abcForPiece(score, { from, to, tempoChanges: false });
    const [t] = abcjs.parseOnly(abc) as unknown as Tune[];
    const got = t
      .setUpAudio({})
      .tracks.flat()
      .filter((e) => e.cmd === "note")
      .map((e) => `${e.pitch}@${e.start.toFixed(3)}`)
      .sort();
    const want = score.parts
      .flatMap((p) => p.notes)
      .filter((n) => !n.rest && n.measure >= from && n.measure <= to && (!n.tieStop || n.start === startTick))
      .map((n) => `${n.midi}@${((n.start - startTick) / (TICKS * 4)).toFixed(3)}`)
      .sort();
    windows++;
    if (got.join() !== want.join()) {
      wrong++;
      if (wrong <= 2) {
        const missing = want.filter((w) => !got.includes(w)).slice(0, 4);
        const extra = got.filter((g) => !want.includes(g)).slice(0, 4);
        console.log(`  ✗ bars ${score.measures[from].label}-${score.measures[to].label}: missing ${missing.join(" ")} extra ${extra.join(" ")}`);
      }
    }
  }
  if (wrong) bad++;
  console.log(`  ${wrong ? "✗" : "✓"} ${windows - wrong} of ${windows} four-bar excerpts play exactly as written`);
}
console.log(bad ? `\n${bad} problem(s)` : "\nall clean");
process.exit(bad ? 1 : 0);
