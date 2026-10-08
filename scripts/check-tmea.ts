/**
 * Every TMEA All-State level x part x key x meter (tmea-presets.ts), RUNS
 * each: generates; every note inside the part's range; the first bar all
 * beat notes (quarters; eighths in 6/8); the length the chart gives the
 * meter; no leap past the level's largest interval; fi and si only at IV.
 *   bun run scripts/check-tmea.ts   (RUNS=20)
 */
import { createNewSr } from "../src/lib/generateUnison";
import { tmeaVoiceLevels, tmeaGenerationParams, tmeaMeasures } from "../src/lib/tmea-presets";
import { noteArray } from "../src/resources/noteArray";

const RUNS = Number(process.env.RUNS ?? 20);
const quiet = () => {};
let cells = 0, bad = 0;
const pitchIndex = (tok: string) => noteArray.indexOf(tok.replace(/^[\^_=]+/, ""));
for (const l of tmeaVoiceLevels) {
  for (const key of l.keys) for (const meter of l.meters) {
    cells++;
    const problems: Record<string, number> = {};
    const flag = (k: string) => (problems[k] = (problems[k] ?? 0) + 1);
    for (let i = 0; i < RUNS; i++) {
      const saved = { log: console.log, warn: console.warn };
      Object.assign(console, { log: quiet, warn: quiet });
      let abc = "";
      try { abc = String((createNewSr(tmeaGenerationParams(l, { key, meter }) as any)[0])); } catch (e) { flag("failed"); continue; } finally { Object.assign(console, saved); }
      const body = abc.split("\n").filter((x) => !/^[A-Za-z%]:|^%|^w:/.test(x) && x.trim()).join(" ").replace(/"[^"]*"/g, "");
      const bars = body.split("|").map((b) => b.trim()).filter((b) => b && b !== "]");
      if (bars.length !== tmeaMeasures(l, meter)) flag(`bars ${bars.length}`);
      const first = bars[0].match(/z?[\^_=]*[A-Ga-gz][,']*\d+/g) ?? [];
      const beat = meter === "6/8" ? 4 : 8;
      if (!first.every((t) => !t.startsWith("z") && Number(t.match(/\d+$/)![0]) === beat)) flag("first bar");
      // A treble-8 part is written an octave above where it sounds (generateUnison clefFor).
      const notes = (body.match(/[\^_=]*[A-Ga-g][,']*(?=\d)/g) ?? []).map(pitchIndex).map((p) => (l.clef === "treble-8" ? p - 7 : p));
      if (notes.some((p) => p < l.range.min || p > l.range.max)) flag("range");
      for (let k = 1; k < notes.length; k++) if (Math.abs(notes[k] - notes[k - 1]) > l.maxSkip) { flag("leap"); break; }
      if (l.level < 4 && /[\^_=]/.test(body.replace(/\d+/g, ""))) flag("accidental below IV");
    }
    const keys = Object.keys(problems);
    if (keys.length) { bad++; console.log(`${l.id.padEnd(24)} ${key.padEnd(3)} ${meter}  ${JSON.stringify(problems)}`); }
  }
}
console.log(`=== TMEA: ${cells} cells, ${RUNS} runs each, ${bad} with problems`);
