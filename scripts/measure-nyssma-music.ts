/**
 * How musical are the NYSSMA Voice levels? Measures, per level, over every
 * key x meter, treble:
 *  - skips: how often an exercise sings a listed skip at all, and how many;
 *  - see-saw: the share of moves that go back to the pitch two notes before
 *    (A-B-A), and of those that make it A-B-A-B;
 *  - range: span and pitches used, the top two pitches' share of the notes,
 *    and the share of 4-bar phrases that never span more than a 3rd;
 *  - rests: per 8 bars, and where they end - at a breath (the end of an even
 *    bar that is not the last: bars 2, 4, 6 of 8) or inside a phrase;
 *  - failures: exercises that would not generate.
 *
 *   bun run scripts/measure-nyssma-music.ts            (RUNS=60)
 *   SAMPLES=3 bun run scripts/measure-nyssma-music.ts  (also print 3 lines a level in solfege)
 */
import { createNewSr } from "../src/lib/generateUnison";
import { nyssmaGenerationParams, nyssmaVoiceLevels } from "../src/lib/nyssma-presets";
import { rangeForSpan } from "../src/lib/ladder";

const RUNS = Number(process.env.RUNS ?? 60);
const SAMPLES = Number(process.env.SAMPLES ?? 0);
const SPANS: Record<string, [number, number]> = { "Level I": [0, 4], "Level II": [0, 5], "Level III": [0, 5], "Level IV": [0, 7], "Level V": [-3, 5] };
const SOLFA = ["do", "re", "mi", "fa", "sol", "la", "ti"];
const quiet = () => {};
const pct = (a: number, b: number) => `${b ? ((100 * a) / b).toFixed(0) : "-"}%`;

/** A line in solfege, bars split by |, a rest as z, a held (tied) repeat as -. */
function solfege(notes: any[], bar: number): string {
  let at = 0;
  const out: string[] = [];
  for (const n of notes) {
    out.push(n.rhythm?.rest ? "z" : SOLFA[((n.degree % 7) + 7) % 7] + (n.noteLength >= 16 ? "-" : ""));
    at += n.noteLength;
    if (at % bar === 0) out.push("|");
  }
  return out.join(" ");
}

const rows: string[] = [];
const sampleBlocks: string[] = [];
for (const level of nyssmaVoiceLevels) {
  let ex = 0, failed = 0, withSkip = 0, skips = 0, sungMoves = 0, spanUsed = 0, spanAvail = 0, distinct = 0, avail = 0, top2 = 0, sungTotal = 0;
  let aba = 0, abab = 0, repeats = 0, phrases = 0, narrowPhrases = 0, bars = 0;
  let rests = 0, restsMid = 0, restsBreath = 0, exWithMidRest = 0;
  const samples: string[] = [];
  for (const key of level.keys) for (const meter of level.meters) {
    const range = rangeForSpan(SPANS[level.short], key, 14)!;
    for (let run = 0; run < RUNS; run++) {
      const saved = { ...console }; Object.assign(console, { log: quiet, warn: quiet, error: quiet });
      let r: any; try { r = createNewSr(nyssmaGenerationParams(level, { key, meter, clef: "treble", anchor: 14 }) as any); } catch { r = null; } finally { Object.assign(console, saved); }
      if (!r) { failed++; continue; }
      ex++;
      const notes: any[] = r[2].partsObject.parts.Unison.chordNoteObject;
      const bar = r[2].timeSignature?.tsPerMeasure ?? (meter === "2/4" ? 16 : meter === "3/4" ? 24 : 32);
      const measures = Math.round(notes.reduce((a, n) => a + n.noteLength, 0) / bar);
      bars += measures;
      if (samples.length < SAMPLES && run === 0) samples.push(`  ${key} ${meter}: ${solfege(notes, bar)}`);
      const sung = notes.filter((n) => !n.rhythm?.rest);
      const p = sung.map((n) => n.pitchValue);
      let s = 0;
      for (let k = 1; k < p.length; k++) {
        sungMoves++;
        if (Math.abs(p[k] - p[k - 1]) > 1) s++;
        if (p[k] === p[k - 1]) repeats++;
        if (k >= 2 && p[k] === p[k - 2] && p[k] !== p[k - 1]) {
          aba++;
          if (k >= 3 && p[k - 1] === p[k - 3]) abab++;
        }
      }
      skips += s; if (s > 0) withSkip++;
      spanUsed += Math.max(...p) - Math.min(...p); spanAvail += range.max - range.min;
      const counts = new Map<number, number>(); for (const v of p) counts.set(v, (counts.get(v) ?? 0) + 1);
      distinct += counts.size;
      avail += range.max - range.min + 1;
      top2 += [...counts.values()].sort((a, b) => b - a).slice(0, 2).reduce((a, b) => a + b, 0); sungTotal += p.length;
      // 4-bar phrases: which span no more than a 3rd (2 diatonic steps)?
      let at = 0;
      const byPhrase = new Map<number, number[]>();
      let mid = false;
      for (const n of notes) {
        const phrase = Math.floor(at / (4 * bar));
        if (!n.rhythm?.rest) byPhrase.set(phrase, [...(byPhrase.get(phrase) ?? []), n.pitchValue]);
        else {
          rests++;
          // A rest at a breath ends at the end of an even bar that is not the last.
          const end = at + n.noteLength;
          const endBar = end / bar;
          if (end % bar === 0 && endBar % 2 === 0 && endBar < measures) restsBreath++;
          else { restsMid++; mid = true; }
        }
        at += n.noteLength;
      }
      for (const ps of byPhrase.values()) { phrases++; if (Math.max(...ps) - Math.min(...ps) <= 2) narrowPhrases++; }
      if (mid) exWithMidRest++;
    }
  }
  rows.push(
    `| ${level.short.padEnd(9)} | ${ex} | ${failed} | ${pct(withSkip, ex)} | ${(skips / ex).toFixed(2)} | ${pct(aba, sungMoves)} | ${pct(abab, sungMoves)} | ${pct(repeats, sungMoves)} | ${pct(top2, sungTotal)} | ${pct(narrowPhrases, phrases)} | ${pct(spanUsed, spanAvail)} | ${pct(distinct, avail)} | ${((8 * rests) / bars).toFixed(2)} | ${pct(restsMid, rests)} | ${pct(exWithMidRest, ex)} |`
  );
  if (samples.length) sampleBlocks.push(`${level.short}:\n${samples.join("\n")}`);
}
console.log(`RUNS=${RUNS} per key x meter, treble`);
console.log("| Level | ex | failed | ≥1 skip | skips/ex | A-B-A of moves | A-B-A-B of moves | repeats of moves | top-2 pitches of notes | 4-bar phrases ≤ a 3rd | span used | pitches used | rests/8 bars | rests inside a phrase | ex with a rest inside a phrase |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const r of rows) console.log(r);
for (const b of sampleBlocks) console.log(b);
