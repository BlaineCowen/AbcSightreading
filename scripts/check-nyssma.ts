/**
 * Do the NYSSMA Voice levels write what the chart asks for?
 *
 * Every level x key x meter, treble and bass, RUNS exercises each (40 by
 * default). Each exercise must generate, and:
 *  - sing only the level's skips, named by solfege in the direction listed,
 *    each landing on an allowed note value - measured between SUNG notes, so
 *    a rest cannot hide a skip;
 *  - stay inside the level's range around do, with no accidentals;
 *  - use only the level's rhythms and rests;
 *  - step (never skip) between any two adjacent eighths (in a figure or across figures), Max 8th/16th being 1;
 *  - write its rhythms by the beat: an eighth only as half of a ti-ti filling
 *    one beat, or as the ti of ta-(i) ti (Level V only, the one dotted
 *    figure); no lone eighth, no note or rest off the beat or across one (no
 *    syncopation), no eighth rest, no other dotted note, no tie, and every
 *    note as long as its rhythm says;
 *  - not hold one pitch for the whole exercise (a dead-end line);
 *  - print a dynamic on its first sung note, from the level's set.
 *
 * The expectations below are copied from the spec's table, not read from
 * src/lib/nyssma-presets.ts or skip-policy.ts, so a fault in either shows here.
 * Mutation-tested: make isAllowedMove allow every custom skip, or drop its
 * landing check, and this fails; so does letting a rest held for the line
 * take the length of the note before it (generateUnison.ts).
 *
 *   bun run check:nyssma              (RUNS=40)
 *   LEVEL=V RUNS=10 bun run check:nyssma
 */
import { createNewSr } from "../src/lib/generateUnison";
import { nyssmaGenerationParams, nyssmaVoiceLevels } from "../src/lib/nyssma-presets";
import { rangeForSpan } from "../src/lib/ladder";

const RUNS = Number(process.env.RUNS ?? 40);
const ONLY = process.env.LEVEL;
const SOLFA = ["do", "re", "mi", "fa", "sol", "la", "ti"];
const ANCHOR = { treble: 14, bass: 7 } as const;

const III_RHYTHMS = ["quarter", "half", "quarterRest", "eighthEighth"];
const IV_SKIPS = ["do↑mi", "mi↑sol", "do↑sol"];
const EXPECTED: Record<string, { span: [number, number]; skips: string[]; landOn: number[]; rhythms: string[]; dynamics: string[] }> = {
  "Level I": { span: [0, 4], skips: [], landOn: [], rhythms: ["quarter", "half"], dynamics: ["mf"] },
  "Level II": { span: [0, 5], skips: ["do↑mi", "mi↑sol"], landOn: [8], rhythms: ["quarter", "half", "quarterRest"], dynamics: ["mf"] },
  "Level III": { span: [0, 5], skips: ["do↑mi", "mi↑sol"], landOn: [8], rhythms: III_RHYTHMS, dynamics: ["mf"] },
  "Level IV": { span: [0, 7], skips: IV_SKIPS, landOn: [8], rhythms: III_RHYTHMS, dynamics: ["mf", "p", "f"] },
  "Level V": {
    span: [-3, 5],
    skips: [...IV_SKIPS, "sol↓mi", "mi↓do", "sol↓do", "sol↑ti", "ti↑re", "do↓sol"],
    landOn: [8, 16], rhythms: [...III_RHYTHMS, "dotQuarterEighth"], dynamics: ["mf", "p", "f", "mp"],
  },
};

const log = console.log;
const quiet = { log: () => {}, warn: () => {}, error: () => {} };
function silenced<T>(fn: () => T): T {
  const saved = { log: console.log, warn: console.warn, error: console.error };
  Object.assign(console, quiet);
  try { return fn(); } finally { Object.assign(console, saved); }
}

/**
 * What breaks the beat rule, walking the notes from the downbeat. Simple
 * meters only (I-V), so a beat is a quarter, 8/32.
 */
function beatProblems(notes: any[], taItiAllowed: boolean): string[] {
  const out: string[] = [];
  let at = 0;
  for (let k = 0; k < notes.length; k++) {
    const n = notes[k];
    const next = notes[k + 1];
    const len: number = n.noteLength;
    const rest = !!n.rhythm?.rest;
    if (len !== n.rhythm?.totalValue) out.push(`${n.rhythm?.name} written ${len}/32`);
    const onBeat = at % 8 === 0;
    const eighthFollows = !rest && next && !next.rhythm?.rest && next.noteLength === 4;
    if (onBeat && len === 4 && eighthFollows) { at += 8; k++; continue; } // ti-ti
    if (onBeat && len === 12 && eighthFollows) { // ta-(i) ti
      if (!taItiAllowed) out.push("ta-(i) ti");
      at += 16; k++; continue;
    }
    if (rest && len % 8 !== 0) out.push("an eighth rest");
    else if (!onBeat && at + len > Math.ceil(at / 8) * 8) out.push(`syncopation: ${len}/32 across the beat`);
    else if (!onBeat) out.push(rest ? "a rest off the beat" : len === 4 ? "a lone eighth off the beat" : `${len}/32 off the beat`);
    else if (len === 4) out.push("a lone eighth");
    else if (len % 8 !== 0) out.push(`a dotted note (${len}/32) outside ta-(i) ti`);
    at += len;
  }
  return out;
}

type Row = { label: string; runs: number; failed: number; problems: Map<string, number> };
const rows: Row[] = [];

for (const level of nyssmaVoiceLevels.filter((l) => !ONLY || l.short === `Level ${ONLY}`)) {
  const want = EXPECTED[level.short];
  if (!want) { log(`No expectations for ${level.short}`); process.exit(1); }
  for (const key of level.keys) for (const meter of level.meters) for (const clef of ["treble", "bass"] as const) {
    const range = rangeForSpan(want.span, key, ANCHOR[clef])!;
    const row: Row = { label: `${level.short.padEnd(9)} | ${key.padEnd(2)} | ${meter} | ${clef}`, runs: RUNS, failed: 0, problems: new Map() };
    const note = (p: string) => row.problems.set(p, (row.problems.get(p) ?? 0) + 1);
    for (let run = 0; run < RUNS; run++) {
      let result: any;
      try {
        // PHRASES=1: as the Unison page writes them with its Phrases option on (the default).
        result = silenced(() =>
          createNewSr({ ...nyssmaGenerationParams(level, { key, meter, clef, anchor: ANCHOR[clef] }), phrases: process.env.PHRASES === "1" } as any),
        );
      } catch (e: any) {
        row.failed++;
        note(`failed: ${String(e?.message ?? e).slice(0, 70)}`);
        continue;
      }
      const [abc, , score] = result;
      const notes: any[] = score.partsObject.parts.Unison.chordNoteObject;
      for (const n of notes) if (!want.rhythms.includes(n.rhythm?.name)) note(`rhythm ${n.rhythm?.name}`);
      const sung = notes.filter((n) => !n.rhythm?.rest);
      for (const n of sung) {
        if (n.pitchValue < range.min || n.pitchValue > range.max) note(`outside the range: ${n.name}`);
        if (/[_^=]/.test(n.name)) note(`accidental: ${n.name}`);
      }
      for (let k = 1; k < sung.length; k++) {
        const [a, b] = [sung[k - 1], sung[k]];
        const rise = b.pitchValue - a.pitchValue;
        if (Math.abs(rise) <= 1) continue;
        const name = `${SOLFA[a.degree]}${rise > 0 ? "↑" : "↓"}${SOLFA[b.degree]}`;
        if (Math.abs(rise) >= 7) note(`skip ${name}, an octave or wider`);
        else if (!want.skips.includes(name)) note(`skip ${name}`);
        else if (!want.landOn.includes(b.noteLength)) note(`skip ${name} onto ${b.noteLength}/32`);
      }
      for (let k = 1; k < notes.length; k++) {
        const [a, b] = [notes[k - 1], notes[k]];
        if (a.rhythm?.rest || b.rhythm?.rest) continue;
        if (a.noteLength <= 4 && b.noteLength <= 4 && Math.abs(b.pitchValue - a.pitchValue) > 1) note("an eighth move wider than a step");
      }
      for (const p of beatProblems(notes, level.short === "Level V")) note(p);
      const body = abc.split("\n").filter((l: string) => !/^[A-Za-z]:|^%/.test(l)).join(" ").replace(/"[^"]*"/g, "");
      if (/\d-/.test(body)) note("a tie");
      if (sung.length > 1 && sung.every((n) => n.pitchValue === sung[0].pitchValue)) note(`frozen line on ${sung[0].name}`);
      const dynamics: any[] = score.dynamics ?? [];
      if (dynamics[0]?.at !== notes.findIndex((n) => !n.rhythm?.rest)) note("no dynamic on the first sung note");
      for (const d of dynamics) {
        if (!want.dynamics.includes(d.mark)) note(`dynamic ${d.mark}`);
        if (!abc.includes(`!${d.mark}!`)) note(`dynamic ${d.mark} not printed`);
      }
    }
    rows.push(row);
    const bad = [...row.problems.values()].reduce((a, b) => a + b, 0);
    log(`${row.label}  ${row.failed ? `${row.failed} failed` : "ok"}${bad - row.failed > 0 ? `, ${bad - row.failed} problems` : ""}`);
  }
}

const failing = rows.filter((r) => r.problems.size > 0);
log(`\n=== NYSSMA (${RUNS} runs per cell, ${rows.length} cells) ===`);
if (failing.length === 0) {
  log("every cell clean");
} else {
  for (const r of failing) {
    log(`  ${r.label}`);
    for (const [p, count] of r.problems) log(`      ${String(count).padStart(4)} x ${p}`);
  }
  process.exit(1);
}
