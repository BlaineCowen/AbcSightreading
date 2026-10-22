/**
 * How well does the Ensemble tab read real singers' tuning? Against the
 * Choral Singing Dataset quartets built by OmniPitch (polyphonic-pitch-
 * detector tools/make_csd.py: one singer a part, each part's audio kept and
 * its score notes aligned). Each written note's pitch measured from its
 * singer alone is the truth; the mix is read as the tab reads it.
 *
 * Two kinds of figure:
 * - per note: the error of each note found, sure and unsure apart;
 * - per part: what a director is told ("the altos lean 12 cents flat"),
 *   the tab's part figure against the truth's.
 *
 * The truth has a floor of its own: on a singer alone, two sound readings
 * of the same note differ by 4-7 cents (median), more on short notes, since
 * the score's note spans include the moves between notes.
 *
 *   bun run scripts/check-ensemble-real.ts [piece dirs...]
 *   (default: ~/Projects/polyphonic-pitch-detector/data/csd/*_quartet)
 *   KIND=instruments for the other model; ORACLE=1 reads the mix at the score's notes (no detection)
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { instantiatePolyPitch, type NoteSpan } from "../src/lib/ensemble-tuning/polypitch";
import { measureWindow, windowJob } from "../src/lib/ensemble-tuning/measure";
import {
  assignParts, combineReadings, planWindows, roughCents, summarise, tuningOf, type MeasuredNote,
} from "../src/lib/ensemble-tuning/tuning";

const KIND = (process.env.KIND ?? "voices") as "voices" | "instruments";
const PARTS = ["soprano", "alto", "tenor", "bass"];
const root = join(homedir(), "Projects/polyphonic-pitch-detector/data/csd");
const dirs = process.argv.slice(2).length
  ? process.argv.slice(2)
  : readdirSync(root).filter((d) => d.endsWith("_quartet")).map((d) => join(root, d));

function readWav(path: string): { samples: Float32Array; sampleRate: number } {
  const b = readFileSync(path);
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let o = 12, sr = 44100, ch = 1, bits = 16, fmt = 1;
  while (o < b.length) {
    const id = b.toString("ascii", o, o + 4), size = v.getUint32(o + 4, true);
    if (id === "fmt ") {
      fmt = v.getUint16(o + 8, true); ch = v.getUint16(o + 10, true); sr = v.getUint32(o + 12, true); bits = v.getUint16(o + 22, true);
    } else if (id === "data") {
      const n = Math.floor(size / (bits / 8) / ch), out = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        let s = 0;
        for (let c = 0; c < ch; c++) {
          const at = o + 8 + (i * ch + c) * (bits / 8);
          s += fmt === 3 ? v.getFloat32(at, true) : bits === 16 ? v.getInt16(at, true) / 32768 : v.getInt32(at, true) / 2147483648;
        }
        out[i] = s / ch;
      }
      return { samples: out, sampleRate: sr };
    }
    o += 8 + size + (size & 1);
  }
  throw new Error("no data in " + path);
}
const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const toMidi = (name: string) => {
  const m = /^([A-G]#?)(-?\d+)$/.exec(name)!;
  return NAMES.indexOf(m[1]) + 12 * (Number(m[2]) + 1);
};
const readTsv = (path: string): NoteSpan[] =>
  readFileSync(path, "utf8").trim().split("\n").slice(1).map((l) => {
    const [s, e, note] = l.split("\t");
    return { start: Number(s), end: Number(e), midi: toMidi(note) };
  });

const pp = await instantiatePolyPitch(await WebAssembly.compile(readFileSync("public/omnipitch/polypitch-1.wasm")));

/** Every note read as the tab reads it (analyse.ts, without workers). */
function measure(samples: Float32Array, sr: number, spans: NoteSpan[], rough?: number[]): MeasuredNote[] {
  const notes: MeasuredNote[] = spans.map((n, j) => ({ ...n, velocity: 0.5, a440Cents: rough?.[j] ?? 0, measured: false, sure: true }));
  for (const w of planWindows(notes)) {
    for (const r of measureWindow(pp, windowJob(samples, sr, notes, w))) {
      const read = combineReadings(r.held, r.harmonic);
      if (read) Object.assign(notes[r.j], { a440Cents: read.cents, sure: read.sure, measured: true });
    }
  }
  return notes;
}
const median = (xs: number[]) => (xs.length ? xs.slice().sort((a, b) => a - b)[xs.length >> 1] : NaN);
const pct = (k: number, n: number) => `${((100 * k) / Math.max(1, n)).toFixed(0)}%`;
const describe = (errs: number[]) => {
  const a = errs.map(Math.abs);
  return `n ${a.length}, median ${median(a).toFixed(1)}¢, within 10¢ ${pct(a.filter((e) => e <= 10).length, a.length)}, over 25¢ ${pct(a.filter((e) => e > 25).length, a.length)}`;
};

const pooled = { sure: [] as number[], unsure: [] as number[], partErr: [] as number[], truth: 0, found: 0, rightPart: 0 };
for (const dir of dirs) {
  if (!existsSync(join(dir, "mix.wav"))) continue;
  const mix = readWav(join(dir, "mix.wav"));
  // Truth: each singer alone, at their score's notes (the solo has nothing to separate from, so both readings are clean).
  const truth: { part: number; n: MeasuredNote }[] = [];
  PARTS.forEach((p, part) => {
    const solo = readWav(join(dir, "parts", `${p}.wav`));
    for (const n of measure(solo.samples, solo.sampleRate, readTsv(join(dir, "parts", `${p}.tsv`)))) {
      if (n.measured && n.end - n.start >= 0.2) truth.push({ part, n });
    }
  });
  let mixNotes: MeasuredNote[];
  if (process.env.ORACLE) {
    mixNotes = measure(mix.samples, mix.sampleRate, truth.map(({ n: { start, end, midi } }) => ({ start, end, midi })));
  } else {
    const found = pp.basicPitchNotes(mix.samples, mix.sampleRate, KIND === "voices");
    mixNotes = measure(mix.samples, mix.sampleRate, found, found.map((n) => roughCents(n.cents, n.amp)));
  }
  const parts = assignParts(mixNotes, 4);
  const sure: number[] = [], unsure: number[] = [];
  let found = 0, rightPart = 0;
  for (const { part, n } of truth) {
    const want = tuningOf(n);
    let best = -1, overlap = 0;
    mixNotes.forEach((m, j) => {
      if (tuningOf(m).midi !== want.midi) return;
      const o = Math.min(m.end, n.end) - Math.max(m.start, n.start);
      if (o > overlap) (overlap = o), (best = j);
    });
    if (best < 0 || overlap < 0.5 * (n.end - n.start)) continue;
    found++;
    if (parts[best] === part) rightPart++;
    (mixNotes[best].sure ? sure : unsure).push(tuningOf(mixNotes[best]).cents - want.cents);
  }
  // Per part: the director's figure. Truth from every note of the part; the tab's from its own parts.
  const truthSummary = summarise(truth.map((t) => t.n), truth.map((t) => t.part), PARTS);
  const tabSummary = summarise(mixNotes, parts, PARTS);
  const partLine = PARTS.map((p, i) => {
    const t = truthSummary.parts[i], g = tabSummary.parts[i];
    pooled.partErr.push(g.meanCents - t.meanCents);
    return `${p} ${t.meanCents.toFixed(1)}/${g.meanCents.toFixed(1)}`;
  }).join(", ");
  console.log(`${dir.split("/").pop()}: ${truth.length} notes, ${found} found (${pct(found, truth.length)}), part right ${pct(rightPart, found)}`);
  console.log(`  sure   ${describe(sure)} (${pct(sure.length, sure.length + unsure.length)} of notes)`);
  console.log(`  unsure ${describe(unsure)}`);
  console.log(`  part leans, truth/tab: ${partLine}; everyone ${truthSummary.all.meanCents.toFixed(1)}/${tabSummary.all.meanCents.toFixed(1)}`);
  pooled.sure.push(...sure);
  pooled.unsure.push(...unsure);
  pooled.truth += truth.length;
  pooled.found += found;
  pooled.rightPart += rightPart;
}
console.log(`pooled: ${pooled.found}/${pooled.truth} found, part right ${pct(pooled.rightPart, pooled.found)}`);
console.log(`  sure   ${describe(pooled.sure)} (${pct(pooled.sure.length, pooled.sure.length + pooled.unsure.length)} of notes)`);
console.log(`  unsure ${describe(pooled.unsure)}`);
console.log(`  part lean error: median ${median(pooled.partErr.map(Math.abs)).toFixed(1)}¢, worst ${Math.max(...pooled.partErr.map(Math.abs)).toFixed(1)}¢`);
