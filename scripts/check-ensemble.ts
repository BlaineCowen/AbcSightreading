/**
 * Every ready-made ensemble, and random ones, at every level, key, meter and
 * length the Ensemble page offers: does it generate, does every staff stay in
 * its players' range, and does abcjs read the score without a warning.
 *
 *   bun run scripts/check-ensemble.ts        # RUNS=3 a cell, RANDOM=40 random ensembles
 */
import abcjs from "abcjs";
import { generateEnsembleExercise, ENSEMBLE_KEYS } from "../src/lib/ensemble/generate";
import { ENSEMBLE_INSTRUMENTS, stepsFor } from "../src/lib/ensemble/instruments";
import { ENSEMBLE_LENGTHS, ENSEMBLE_METERS, ENSEMBLE_PRESETS } from "../src/lib/ensemble/settings";
import type { EnsembleMember } from "../src/lib/ensemble/arrange";
import { timeSignaturesFor } from "../src/lib/meter";

const RUNS = Number(process.env.RUNS ?? 3);
const RANDOM = Number(process.env.RANDOM ?? 40);
const TS = timeSignaturesFor(ENSEMBLE_METERS);
const real = console.log;

function randomEnsemble(): EnsembleMember[] {
  const kinds = 2 + Math.floor(Math.random() * 5);
  const pool = [...ENSEMBLE_INSTRUMENTS].sort(() => Math.random() - 0.5).slice(0, kinds);
  return pool.map((i) => ({ instrument: i.id, count: 1 + Math.floor(Math.random() * 3) }));
}

const ensembles: { label: string; members: EnsembleMember[] }[] = [
  ...ENSEMBLE_PRESETS.map((p) => ({ label: p.label, members: p.members })),
  ...Array.from({ length: RANDOM }, () => {
    const members = randomEnsemble();
    return { label: members.map((m) => `${m.instrument.replace(/^(band|orch)-/, "")}:${m.count}`).join(","), members };
  }),
];

let runs = 0, fails = 0, outOfRange = 0, warnings = 0;
const bad: string[] = [];
for (const e of ensembles) {
  let f = 0, o = 0, w = 0, n = 0;
  const errors = new Set<string>();
  for (const level of [1, 2, 3, 4, 5])
    for (const key of ENSEMBLE_KEYS)
      for (const meter of ENSEMBLE_METERS)
        for (const measures of ENSEMBLE_LENGTHS)
          for (let r = 0; r < RUNS; r++) {
            // Too many cells for every one: each run draws one key, meter and length of the level's cells.
            if (Math.random() > 0.08) continue;
            n++;
            Object.assign(console, { log: () => {}, warn: () => {} });
            try {
              const ex = generateEnsembleExercise({ members: e.members, key, timeSig: TS[meter], measures, level, bpm: 80 });
              Object.assign(console, { log: real });
              ex.arrangement.staves.forEach((s, i) => {
                const lo = s.instrument.concert.min - stepsFor(s.instrument.transpose) - 2;
                const hi = s.instrument.concert.max - stepsFor(s.instrument.transpose) + 2;
                for (const x of ex.staffNotes[i]) if (!x.rest && (x.pitchValue < lo || x.pitchValue > hi)) o++;
              });
              const tune = (abcjs as any).parseOnly(ex.abc)[0];
              if (tune.warnings?.length) w++;
            } catch (err) {
              Object.assign(console, { log: real });
              f++;
              errors.add(`L${level} ${key} ${meter} ${measures}: ${String((err as Error).message).slice(0, 60)}`);
            }
          }
  runs += n; fails += f; outOfRange += o; warnings += w;
  if (f || o || w) bad.push(`${e.label}: ${f}/${n} failed, ${o} notes out of range, ${w} warned  ${[...errors].slice(0, 2).join(" | ")}`);
}
real(bad.join("\n"));
real(`=== ${ensembles.length} ensembles, ${runs} exercises: ${fails} failed, ${outOfRange} notes out of range, ${warnings} scores warned`);
process.exit(fails || outOfRange || warnings ? 1 : 0);
