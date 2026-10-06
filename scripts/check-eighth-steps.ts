/**
 * The Unison page's default Skips between (6 October 2026): quarter, dotted
 * quarter and half, so an eighth or sixteenth only steps unless chosen. Does
 * every exercise still generate at it, and is no short note ever skipped to
 * or from? Generates as the page does (its skip policy), across note sets
 * from do-mi-so up, rhythms with eighths and sixteenths, meters, keys and
 * lengths, with and without chord progressions.
 *
 *   bun run scripts/check-eighth-steps.ts       (RUNS=6 per cell by default)
 */
import { createNewSr } from "../src/lib/generateUnison";
import { timeSignatureFor } from "../src/lib/meter";
import { rhythms } from "../src/resources/rhythms";
import { PAGE_DEFAULT_LAND_ON, policyFor, skipSettingsFrom } from "../src/lib/skip-settings";

const RUNS = Number(process.env.RUNS ?? 6);
const policy = policyFor(4, skipSettingsFrom({}, PAGE_DEFAULT_LAND_ON));
const DEGREES = [[1, 3, 5], [1, 2, 3], [1, 2, 3, 4, 5], [1, 2, 3, 4, 5, 6], [1, 2, 3, 4, 5, 6, 7]];
const RHYTHMS = [
  ["quarter", "eighthEighth", "half"],
  ["quarter", "eighthEighth", "half", "quarterRest"],
  ["quarter", "eighthEighth", "fourSixteenths", "eighthSixteenthSixteenth"],
  ["quarter", "dotQuarterEighth", "eighthEighth", "half"],
];
const METERS = ["4/4", "3/4", "2/4"];
const KEYS = ["C", "G", "F", "D", "Bb"];
const quiet = <T>(fn: () => T) => {
  const { log, warn, error } = console;
  Object.assign(console, { log() {}, warn() {}, error() {} });
  try { return fn(); } finally { Object.assign(console, { log, warn, error }); }
};

let cells = 0, runs = 0, fails = 0, shortSkips = 0, shortMoves = 0;
const bad: string[] = [];
for (const degrees of DEGREES) for (const names of RHYTHMS) for (const meter of METERS) for (const measures of [4, 8, 16]) for (const progressions of [true, false]) {
  cells++;
  let cellFails = 0;
  for (let k = 0; k < RUNS; k++) {
    runs++;
    const key = KEYS[(runs * 7) % KEYS.length];
    try {
      const [, , data] = quiet(() => createNewSr({
        bpm: 60, tempo: 60, clef: "treble", selectedClef: "treble", key,
        timeSig: timeSignatureFor(meter), selectedTimeSignature: meter, measures, maxSkip: policy,
        range: { min: 14, max: 24 }, scaleDegrees: degrees, selectedSharpDegrees: [], selectedFlatDegrees: [],
        rhythms: rhythms.filter((r) => names.includes(r.name)), selectedRhythms: names, progressions,
        showSolfege: true, lyricSystem: "movable", showRhythmSyllables: false, accidentalsFollowStep: false, allowTiesAcrossBarline: false,
        partsObject: { numofParts: 1, parts: { Unison: { order: 0, smallName: "U" } } },
      } as any)) as [string, unknown, any];
      const notes = (data?.partsObject?.parts?.Unison?.chordNoteObject ?? []) as any[];
      if (!notes.length) throw new Error("empty");
      for (let i = 1; i < notes.length; i++) {
        const a = notes[i - 1], b = notes[i];
        if (a.rhythm?.rest || b.rhythm?.rest) continue;
        if (a.noteLength <= 4 || b.noteLength <= 4) {
          shortMoves++;
          if (Math.abs(b.pitchValue - a.pitchValue) >= 2) shortSkips++;
        }
      }
    } catch {
      fails++;
      cellFails++;
    }
  }
  if (cellFails) bad.push(`${cellFails}/${RUNS}  degrees ${degrees.join("")} | ${names.join(",")} | ${meter} | ${measures}m | progressions ${progressions}`);
}
console.log(`${cells} cells, ${runs} exercises: ${fails} failed (${((100 * fails) / runs).toFixed(2)}%)`);
console.log(`moves beside an eighth or shorter: ${shortMoves}, skips among them: ${shortSkips}`);
for (const b of bad.slice(0, 25)) console.log("  " + b);
process.exit(fails || shortSkips ? 1 : 0);
