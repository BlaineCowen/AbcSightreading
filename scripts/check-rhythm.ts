/**
 * Rhythm generation checks.  Run with `bun run check:rhythm`.
 *
 * There is no unit test framework here, and the generator is the part of this
 * codebase where a wrong answer is quiet: a malformed measure still renders, a
 * misaligned lyric still prints, a note tied across a barline still plays. Each
 * of these was a real bug found by eye. So the properties are asserted directly
 * against the generator, with no dev server involved.
 *
 *   1. Well-formedness  - every emitted measure sums to exactly one measure.
 *   2. Completeness     - the generator succeeds on exactly the selections that
 *                         are solvable under its own rules. This is the one that
 *                         catches a dead end: a greedy walk that fails on a
 *                         selection a different route would have filled.
 *   3. Tie shape        - a note split across a barline never yields a dotted
 *                         half of a tie, which reads as an addition rather than
 *                         a continuation.
 *   4. Lyric alignment  - the w: line gets one slot per ABC note element, so a
 *                         tie needs a hold or every later syllable shifts.
 *   5. Syllable mapping - each system spells the standard figures correctly.
 */
import { createNewSr } from "../src/lib/generateUnison";
import { selectableRhythms } from "../src/lib/selectable-rhythms";
import { syllableSystems } from "../src/resources/rhythm-syllables";
import type { Rhythm } from "../src/resources/rhythms";

const TIME_SIGS = {
  "4/4": { name: "4/4", tsPerMeasure: 32, beamGroupSize: 8 },
  "3/4": { name: "3/4", tsPerMeasure: 24, beamGroupSize: 8 },
  "2/4": { name: "2/4", tsPerMeasure: 16, beamGroupSize: 8 },
} as const;

type TimeSig = (typeof TIME_SIGS)[keyof typeof TIME_SIGS];

const failures: string[] = [];
const fail = (msg: string) => failures.push(msg);

// ── Driving the generator ────────────────────────────────────────────────────

type Options = {
  rhythms: Rhythm[];
  timeSig: TimeSig;
  measures?: number;
  ties?: boolean;
  syllables?: string | null;
  solfege?: boolean;
};

/** Returns the tune body, or null if the generator refused. */
function generate(o: Options): string | null {
  const params = {
    rhythmOnly: !o.solfege,
    showSolfege: o.solfege === true,
    showRhythmSyllables: !!o.syllables,
    syllableSystemId: o.syllables ?? undefined,
    allowTiesAcrossBarline: o.ties === true,
    measures: o.measures ?? 4,
    bpm: 100,
    tempo: 100,
    clef: "treble",
    key: "F",
    maxSkip: 4,
    timeSig: o.timeSig,
    selectedTimeSignature: o.timeSig.name,
    range: { min: 17, max: 21 },
    scaleDegrees: [1, 3, 5],
    selectedSharpDegrees: [],
    selectedFlatDegrees: [],
    moveOnEighthNotes: false,
    accidentalsFollowStep: false,
    rhythms: o.rhythms,
    selectedRhythms: o.rhythms,
    partsObject: {
      numofParts: 1,
      parts: { Unison: { order: 0, smallName: "U" } },
    },
  };
  let out: any;
  try {
    out = createNewSr(params);
  } catch {
    return null; // a refusal is a legitimate answer; the caller judges it
  }
  const abc = out?.[0];
  if (typeof abc !== "string") return null;
  const body = abc.split("start of tune body: \n")[1]?.trim() ?? "";
  return body.length > 0 ? body : null;
}

const measuresOf = (body: string) =>
  body
    .split("|")
    .map((m) => m.trim())
    .filter(Boolean);

const durationsIn = (measure: string) =>
  [...measure.matchAll(/[A-Ga-g][,']*(\d+)|z(\d+)/g)].map((m) =>
    Number(m[1] ?? m[2])
  );

// ── The reference solver ─────────────────────────────────────────────────────

/**
 * Can this selection fill the exercise at all, under the generator's own rules?
 * Deliberately a separate, exhaustive implementation: the generator searches
 * randomly and gives up, this one enumerates. Where they disagree, one of them
 * is wrong, and that is the whole point of the check.
 */
function solvable(
  rhythms: Rhythm[],
  tsPerMeasure: number,
  totalUnits: number,
  allowTies: boolean
): boolean {
  const DOTTED = new Set([6, 12, 24]);
  const seen = new Set<number>();

  const legal = (r: Rhythm, pos: number, lastShort: boolean) => {
    const room = tsPerMeasure - (pos % tsPerMeasure);
    const canCross = allowTies && !r.pattern && !r.rest;
    if (r.totalValue > room && !canCross) return false;
    // A crossing must split into two plainly written halves.
    if (
      r.totalValue > room &&
      (DOTTED.has(room) || DOTTED.has(r.totalValue - room))
    ) {
      return false;
    }
    const p = (pos % tsPerMeasure) % 8;
    if (tsPerMeasure >= 8) {
      if ((p === 2 || p === 6) && r.totalValue >= 8) return false;
      if (p === 4 && r.totalValue >= 16) return false;
    }
    if (lastShort && r.totalValue >= 16) return false;
    return true;
  };

  const walk = (pos: number, lastShort: boolean): boolean => {
    if (pos === totalUnits) return true;
    if (pos > totalUnits) return false;
    const key = pos * 2 + (lastShort ? 1 : 0);
    if (seen.has(key)) return false;
    seen.add(key);
    for (const r of rhythms) {
      if (!legal(r, pos, lastShort)) continue;
      if (walk(pos + r.totalValue, r.totalValue <= 4)) return true;
    }
    return false;
  };
  return walk(0, false);
}

// ── Every one- and two-rhythm selection ──────────────────────────────────────

function selections(timeSig: TimeSig): Rhythm[][] {
  const usable = selectableRhythms.filter(
    (r) => r.totalValue <= timeSig.tsPerMeasure
  );
  const out: Rhythm[][] = [];
  for (let i = 0; i < usable.length; i++) {
    out.push([usable[i]]);
    for (let j = i + 1; j < usable.length; j++) out.push([usable[i], usable[j]]);
  }
  // A selection of nothing but rests is not an exercise.
  return out.filter((set) => !set.every((r) => r.rest));
}

function checkMeasuresAndCompleteness() {
  let checked = 0;
  for (const timeSig of Object.values(TIME_SIGS)) {
    for (const ties of [false, true]) {
      for (const set of selections(timeSig)) {
        const label = `${timeSig.name} [${set.map((r) => r.name).join(" + ")}] ties=${ties}`;
        const total = 4 * timeSig.tsPerMeasure;

        // The generator picks randomly, so give it a few tries before believing
        // a refusal.
        let body: string | null = null;
        for (let i = 0; i < 4 && !body; i++) {
          body = generate({ rhythms: set, timeSig, ties, measures: 4 });
        }
        checked++;

        const canSolve = solvable(set, timeSig.tsPerMeasure, total, ties);
        if (!!body !== canSolve) {
          fail(
            `completeness: ${label} generator=${body ? "ok" : "refused"} solver=${canSolve ? "solvable" : "impossible"}`
          );
          continue;
        }
        if (!body) continue;

        for (const measure of measuresOf(body)) {
          const sum = durationsIn(measure).reduce((a, b) => a + b, 0);
          if (sum !== timeSig.tsPerMeasure) {
            fail(
              `well-formed: ${label} measure sums to ${sum}, want ${timeSig.tsPerMeasure}  (${measure})`
            );
            break;
          }
        }
      }
    }
  }
  return checked;
}

function checkTieShapes() {
  const DOTTED = new Set([6, 12, 24]);
  let ties = 0;
  for (const timeSig of Object.values(TIME_SIGS)) {
    const set = selectableRhythms.filter(
      (r) => r.totalValue <= timeSig.tsPerMeasure && !r.rest
    );
    for (let i = 0; i < 40; i++) {
      const body = generate({ rhythms: set, timeSig, ties: true, measures: 8 });
      if (!body) continue;
      for (const m of body.matchAll(/[A-Ga-g][,']*(\d+)-\s*\|\s*[A-Ga-g][,']*(\d+)/g)) {
        ties++;
        const a = Number(m[1]);
        const b = Number(m[2]);
        if (DOTTED.has(a) || DOTTED.has(b)) {
          fail(`tie shape: ${timeSig.name} produced ${a} tied to ${b} (dotted half of a tie)`);
        }
      }
    }
  }
  return ties;
}

function checkLyricAlignment() {
  const timeSig = TIME_SIGS["4/4"];
  const set = selectableRhythms.filter((r) => !r.rest && !r.pattern);
  let checked = 0;
  for (let i = 0; i < 40; i++) {
    const body = generate({
      rhythms: set,
      timeSig,
      ties: true,
      measures: 4,
      solfege: true,
    });
    if (!body) continue;
    checked++;
    const lines = body.split("\n");
    const music = lines.filter((l) => !l.startsWith("w:")).join(" ");
    const lyric = lines.find((l) => l.startsWith("w:")) ?? "";
    const noteEls = (music.match(/[A-Ga-g][,']*\d+/g) || []).length;
    const slots = lyric
      .replace(/^w:\s*/, "")
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;
    if (noteEls !== slots) {
      fail(`lyric alignment: ${noteEls} note elements but ${slots} lyric slots`);
      break;
    }
  }
  return checked;
}

/** The syllables each system should produce for a figure, starting on beat 1. */
const SYLLABLE_TABLE: Record<string, Record<string, string[]>> = {
  kodaly: {
    quarter: ["ta"],
    half: ["tu-u"],
    whole: ["tu-u-u-u"],
    eighthEighth: ["ti", "ti"],
    fourSixteenths: ["ti", "ki", "ti", "ki"],
    eighthSixteenthSixteenth: ["ti", "ti", "ki"],
    sixteenthSixteenthEighth: ["ti", "ki", "ti"],
    sixteenthEighthSixteenth: ["ti", "ki", "ki"],
    dotEighthSixteenth: ["tim", "ri"],
    dotQuarterEighth: ["ta-(i)", "ti"],
    dotHalfQuarter: ["tu-u-u", "ta"],
    eighthQuarterEighth: ["syn", "co", "pa"],
    wholeRest: ["(sh)"],
  },
  counting: {
    quarter: ["1"],
    half: ["1_(2)"],
    whole: ["1_(2)_(3)_(4)"],
    eighthEighth: ["1", "&"],
    fourSixteenths: ["1", "e", "&", "a"],
    eighthSixteenthSixteenth: ["1", "&", "a"],
    sixteenthSixteenthEighth: ["1", "e", "&"],
    sixteenthEighthSixteenth: ["1", "e", "a"],
    dotEighthSixteenth: ["1", "a"],
    dotQuarterEighth: ["1_(2)", "&"],
    dotHalfQuarter: ["1_(2)_(3)", "4"],
    eighthQuarterEighth: ["1", "&_(2)", "&"],
    wholeRest: ["(1)_(2)_(3)_(4)"],
  },
};

function checkSyllables() {
  const timeSig = TIME_SIGS["4/4"];
  let checked = 0;
  for (const systemId of Object.keys(syllableSystems)) {
    const table = SYLLABLE_TABLE[systemId];
    if (!table) {
      fail(`syllables: no expected mapping recorded for system "${systemId}"`);
      continue;
    }
    for (const [rhythmName, expected] of Object.entries(table)) {
      const rhythm = selectableRhythms.find((r) => r.name === rhythmName);
      if (!rhythm) {
        fail(`syllables: "${rhythmName}" is not a selectable rhythm`);
        continue;
      }
      // Every figure in the table tiles a 4/4 measure on its own, so it always
      // starts on beat 1 and the expected reading is exact rather than likely.
      const set = [rhythm];

      let seenExpected = false;
      for (let i = 0; i < 12 && !seenExpected; i++) {
        const body = generate({
          rhythms: set,
          timeSig,
          measures: 2,
          syllables: systemId,
        });
        if (!body) continue;
        const syllables = [...body.matchAll(/"_([^"]*)"/g)].map((m) => m[1]);
        // The figure starting on beat 1 must read exactly as the table says.
        if (syllables.slice(0, expected.length).join(" ") === expected.join(" ")) {
          seenExpected = true;
        }
      }
      checked++;
      if (!seenExpected) {
        fail(
          `syllables: ${systemId}/${rhythmName} never produced "${expected.join(" ")}" on beat 1`
        );
      }
    }
  }
  return checked;
}

// ── Run ──────────────────────────────────────────────────────────────────────

// The generator is chatty; quiet it so the report is readable.
const noop = () => {};
console.log = noop;
console.warn = noop;
console.error = noop;
const report = (...args: unknown[]) => process.stdout.write(args.join(" ") + "\n");

const started = Date.now();
const selectionCount = checkMeasuresAndCompleteness();
const tieCount = checkTieShapes();
const lyricCount = checkLyricAlignment();
const syllableCount = checkSyllables();
const elapsed = ((Date.now() - started) / 1000).toFixed(1);

report(`rhythm checks (${elapsed}s)`);
report(`  ${selectionCount} selections: well-formed measures, and generation`);
report(`     succeeds on exactly the solvable ones`);
report(`  ${tieCount} barline ties, none landing on a dotted note`);
report(`  ${lyricCount} exercises with solfege aligned across ties`);
report(`  ${syllableCount} syllable mappings across ${Object.keys(syllableSystems).length} systems`);

if (failures.length > 0) {
  report(`\n${failures.length} FAILURE(S):`);
  for (const f of failures.slice(0, 40)) report("  " + f);
  if (failures.length > 40) report(`  ...and ${failures.length - 40} more`);
  process.exit(1);
}
report("\nall checks passed");
