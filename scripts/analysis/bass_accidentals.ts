/**
 * Chromatic notes in the bass: is each one approached by step and resolved by
 * step? See notes/bass-chromatic-notes.md.
 *
 * Reproduces a UIL level the way applyUILPreset does - its ranges, its chords
 * with their inversions, its rhythms minus rests, its maxSkip - generates a few
 * hundred exercises, and classifies every bass note whose accidental differs
 * from the key: the previous and next sounding bass notes (repeats of the same
 * note skipped) have to be a step away, up from a raised note and down from a
 * lowered one. The rates are single-digit percentages at worst, so sample
 * sizes under ~500 exercises move them by 2-3 points on their own.
 *
 *   bun run scripts/analysis/bass_accidentals.ts [runs] [keys,comma,separated] [level]
 *   MEASURES=16 NCT=0.1 VERBOSE=1|2 (2 prints the ABC of every offending exercise)
 *
 * Measured 22 September 2026 at UIL 5, 8 bars, over all 18 of its keys: 0 of
 * 869 bass accidentals wrong (8.9% of 931 before the fixes recorded in the
 * notes); at 16 bars, 1 of 857.
 */
import { generateChoralExercise } from "../../src/lib/generateChoral";
import { uilPresets } from "../../src/lib/uil-presets";
import { chords as fullChordSet } from "../../src/resources/chords";
import { rhythms as allRhythms } from "../../src/resources/rhythms";
import { keySignatures } from "../../src/resources/key-signatures";
import { getDiatonicDegree } from "../../src/lib/prep-params";
import { isSelectableRhythm, containsRest } from "../../src/lib/selectable-rhythms";
import { ClefType } from "../../src/lib/types";

const RUNS = Number(process.argv[2] ?? 300);
const KEYS = (process.argv[3] ?? "G").split(",");
const LEVEL = process.argv[4] ?? "UIL 5";
const MEASURES = Number(process.env.MEASURES ?? 8);
const NCT = Number(process.env.NCT ?? 0.1);
const VERBOSE = process.env.VERBOSE === "1";

const majorInversions = ['1-6','1-64','2-6','4-6','4-64','5-6','5-64','6-6'];
const minorInversions = ['m_i6','m_iid6','m_iv6','m_iv64','m_V6','m_V64','m_VI6','m_viid6'];
const chromaticBassInversions: Record<string, string> = { "5/5": "5/5-6", "5/6": "5/6-6", "5/2": "5/2-6" };

function withInversions(names: string[], minor: boolean): string[] {
  const set = new Set(names);
  for (const n of minor ? minorInversions : majorInversions) set.add(n);
  for (const [parent, inv] of Object.entries(chromaticBassInversions)) {
    if (set.has(parent)) set.add(inv); else set.delete(inv);
  }
  return [...set];
}

const preset: any = (uilPresets as any)[LEVEL];
const vr = preset.voiceRanges;
const SATB = {
  numofParts: 4,
  parts: {
    Soprano: { order: 3, smallName: "S", clef: ClefType.Treble, range: [21, 35], currentRange: [...vr.Soprano] },
    Alto:    { order: 2, smallName: "A", clef: ClefType.Treble, range: [14, 32], currentRange: [...vr.Alto] },
    Tenor:   { order: 1, smallName: "T", clef: ClefType.TrebleOctaveUp, range: [11, 27], currentRange: [...vr.Tenor] },
    Bass:    { order: 0, smallName: "B", clef: ClefType.Bass, range: [2, 24], currentRange: [...vr.Bass] },
  },
} as any;
const rhythms = allRhythms.filter(
  (r) => preset.allowedRhythmNames.includes(r.name) && isSelectableRhythm(r) && !(r.pattern === true && containsRest(r)) && !r.rest && r.name !== "fourSixteenths"
);

type Fail = { kind: string; key: string; chord: string; nextChord: string; prevChord: string; detail: string };
const fails: Fail[] = [];
let total = 0, byStepIn = 0, byStepOut = 0, both = 0, failedGen = 0, generated = 0;
let ornamentAcc = 0; let regenerated = 0; let regeneratedExercises = 0; const t0 = Date.now();
const byChord = new Map<string, { n: number; badIn: number; badOut: number }>();

const quiet = { log() {}, warn() {}, error() {}, info() {}, debug() {} };
const real = { log: console.log, warn: console.warn, error: console.error, info: console.info, debug: console.debug };

const resolveDir = (n: any): 1 | -1 | 0 => {
  if (n.accidental === "sharp" || n.accidental === "double-sharp") return 1;
  if (n.accidental === "flat" || n.accidental === "double-flat") return -1;
  if (n.accidental === "natural") return n.wasRaised === true ? 1 : n.wasRaised === false ? -1 : 0;
  return 0;
};

for (let i = 0; i < RUNS; i++) {
  const key = KEYS[i % KEYS.length];
  const minor = key.endsWith("m");
  const names = withInversions(preset.allowedChordNames, minor);
  let out: any;
  Object.assign(console, quiet);
  try {
    out = generateChoralExercise({
      key,
      timeSig: { name: "4/4", tsPerMeasure: 32, beamGroupSize: 8 },
      partsObject: SATB,
      measures: MEASURES,
      maxSkip: preset.maxSkip,
      bpm: 72,
      selectedRhythms: rhythms,
      chords: fullChordSet,
      accidentalsByStep: true,
      nctProbability: NCT,
      chromaticFrequency: 1,
      allowedChordNames: names,
      voiceTexture: "full",
      stepwiseEighths: true,
    } as any);
  } catch (e: any) {
    failedGen++;
    Object.assign(console, real);
    if (VERBOSE) console.log(`gen failed (${key}): ${e?.message}`);
    continue;
  } finally {
    Object.assign(console, real);
  }
  generated++;
  if (out.regenerated) { regenerated += out.regenerated; regeneratedExercises++; }
  const bass: any[] = out.voiceNotes.find((v: any[]) => v.some((n) => n.order === 0));
  if (!bass) continue;
  const keyInfo = keySignatures[key];

  // Chord at each onset, from the undecorated rhythm.
  const chordAt: [number, number][] = [];
  let t = 0, ci = 0;
  for (const r of out.rhythmSteps as any[]) {
    chordAt.push([t, ci]);
    t += r.totalValue;
    if (r.rest) continue;
    if (r.isPatternNote) { if (r.isPatternEnd) ci++; } else ci++;
  }
  const chordFor = (onset: number) => {
    let c = 0;
    for (const [on, idx] of chordAt) { if (on <= onset) c = idx; else break; }
    return out.chordProgression[c];
  };
  const onsets: number[] = [];
  let acc = 0;
  for (const n of bass) { onsets.push(acc); acc += n.length; }

  const sounding = bass.map((n, k) => ({ n, k })).filter(({ n }) => !n.rest);
  for (let s = 0; s < sounding.length; s++) {
    const { n: note, k } = sounding[s];
    if (!note.accidental) continue;
    const dir = resolveDir(note);
    // Previous note that is not an exact repeat.
    let prev: any = null;
    for (let j = s - 1; j >= 0; j--) {
      const p = sounding[j].n;
      if (p.pitchValue === note.pitchValue && p.accidental === note.accidental) continue;
      prev = p; break;
    }
    let next: any = null, nextK = -1;
    for (let j = s + 1; j < sounding.length; j++) {
      const p = sounding[j].n;
      if (p.pitchValue === note.pitchValue && p.accidental === note.accidental) continue;
      next = p; nextK = sounding[j].k; break;
    }
    if (!prev || !next) continue;
    total++;
    if (note.ornament) ornamentAcc++;
    const chord = chordFor(onsets[k]);
    const nextChord = chordFor(onsets[nextK]);
    const prevChord = chordFor(onsets[k] - 1);
    const approached = Math.abs(note.pitchValue - prev.pitchValue) <= 1;
    const resolved = dir !== 0 && next.pitchValue === note.pitchValue + dir;
    if (approached) byStepIn++;
    if (resolved) byStepOut++;
    if (approached && resolved) both++;
    const bc = byChord.get(chord?.name) ?? { n: 0, badIn: 0, badOut: 0 };
    bc.n++;
    if (!approached) bc.badIn++;
    if (!resolved) bc.badOut++;
    byChord.set(chord?.name, bc);

    if (!approached || !resolved) {
      const chromDeg = chord?.sharpScaleDegree ?? chord?.flatScaleDegree;
      const planned = chord && chord.root === chromDeg;
      const resPitch = note.pitchValue + dir;
      const resDeg = getDiatonicDegree(resPitch, keyInfo);
      const nextHasRes = nextChord?.triadNotes?.includes(resDeg);
      const inRange = resPitch >= vr.Bass[0] && resPitch <= vr.Bass[1];
      const detail = [
        `pv ${prev.pitchValue}${prev.accidental ? "(" + prev.accidental + ")" : ""}->${note.pitchValue}(${note.accidental}${note.wasRaised !== undefined ? ",raised=" + note.wasRaised : ""})->${next.pitchValue}${next.accidental ? "(" + next.accidental + ")" : ""}`,
        `planned=${planned ? "Y" : "n"}`,
        `nextHasRes=${nextHasRes ? "Y" : "n"}`,
        `resInRange=${inRange ? "Y" : "n"}`,
        `orn=${note.ornament ? "Y" : "n"}/${prev.ornament ? "Y" : "n"}/${next.ornament ? "Y" : "n"}`,
        `len=${note.length}`,
        `sameChordNext=${chord === nextChord ? "Y" : "n"}`,
      ].join(" ");
      fails.push({
        kind: !approached && !resolved ? "both" : !approached ? "approach" : "resolve",
        key, chord: chord?.name, nextChord: nextChord?.name, prevChord: prevChord?.name, detail,
      });
      if (process.env.VERBOSE === "2") {
        console.log(`\n### ${key} ${detail}\n` + out.abcString.split("\n").filter((l: string) => l.startsWith("[V:") || l.startsWith("%%score") || l.startsWith("K:")).join("\n"));
        console.log("bass pvs: " + bass.map((n: any) => n.rest ? "z" : `${n.pitchValue}${n.accidental ? "#" : ""}${n.ornament ? "o" : ""}${n.varied ? "v" : ""}`).join(" "));
      }
    }
  }
}

const pct = (a: number, b: number) => (b ? ((100 * a) / b).toFixed(1) + "%" : "-");
console.log(`\n${LEVEL} keys=${KEYS.join(",")} measures=${MEASURES} nct=${NCT}`);
console.log(`generated ${generated}, failed ${failedGen} (${pct(failedGen, RUNS)}); regenerated ${regeneratedExercises} exercises (${regenerated} extra draws); ${((Date.now() - t0) / RUNS).toFixed(0)} ms per exercise`);
console.log(`bass accidentals: ${total} (ornament-written: ${ornamentAcc})`);
console.log(`  approached by step: ${byStepIn} (${pct(byStepIn, total)})  -> by leap ${pct(total - byStepIn, total)}`);
console.log(`  resolved by step:   ${byStepOut} (${pct(byStepOut, total)})  -> unresolved ${pct(total - byStepOut, total)}`);
console.log(`  both:               ${both} (${pct(both, total)})  -> problem notes ${pct(total - both, total)}`);

console.log(`\nby chord (n / bad approach / bad resolve):`);
for (const [name, v] of [...byChord.entries()].sort((a, b) => b[1].n - a[1].n)) {
  console.log(`  ${name.padEnd(8)} ${String(v.n).padStart(4)}  ${String(v.badIn).padStart(3)}  ${String(v.badOut).padStart(3)}`);
}

const tally = (f: (x: Fail) => string) => {
  const m = new Map<string, number>();
  for (const x of fails) m.set(f(x), (m.get(f(x)) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};
console.log(`\nfailures by kind:`, tally((x) => x.kind));
console.log(`\napproach failures: prevChord -> chord`);
for (const [k, v] of tally((x) => x.kind !== "resolve" ? `${x.prevChord} -> ${x.chord}` : "").filter(([k]) => k)) console.log(`  ${v.toString().padStart(3)}  ${k}`);
console.log(`\nresolve failures: chord -> nextChord`);
for (const [k, v] of tally((x) => x.kind !== "approach" ? `${x.chord} -> ${x.nextChord}` : "").filter(([k]) => k)) console.log(`  ${v.toString().padStart(3)}  ${k}`);
console.log(`\nresolve failures by flags:`);
for (const [k, v] of tally((x) => x.kind !== "approach" ? x.detail.replace(/^pv \S+ /, "").replace(/ len=\d+/, "") : "").filter(([k]) => k)) console.log(`  ${v.toString().padStart(3)}  ${k}`);
console.log(`\napproach failures by flags:`);
for (const [k, v] of tally((x) => x.kind !== "resolve" ? x.detail.replace(/^pv \S+ /, "").replace(/ len=\d+/, "") : "").filter(([k]) => k)) console.log(`  ${v.toString().padStart(3)}  ${k}`);
if (VERBOSE) {
  console.log(`\nall failures:`);
  for (const f of fails) console.log(`  [${f.kind}] ${f.key} ${f.prevChord} -> ${f.chord} -> ${f.nextChord}  ${f.detail}`);
}
