/**
 * Rhythm generation checks.  Run with `bun run check:rhythm`.
 *
 * There is no unit test framework here, and the generator is the part of this
 * codebase where a wrong answer is quiet: a malformed measure still renders, a
 * misaligned lyric still prints, a note tied across a barline still plays. Each
 * of these was a real bug found by eye. So the properties are asserted directly
 * against the generator, with no dev server involved.
 *
 *   1. Well-formedness  - every emitted measure sums to exactly one measure,
 *                         and in compound meter no figure crosses a beat.
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
import { canFillExercise } from "../src/lib/rhythm-feasibility";
import { selectableRhythms, selectableRhythmsFor } from "../src/lib/selectable-rhythms";
import { syllableSystems } from "../src/resources/rhythm-syllables";
import type { Rhythm } from "../src/resources/rhythms";
import { meterKindOf, timeSignaturesFor, type ExerciseTimeSignature } from "../src/lib/meter";

const TIME_SIGS = timeSignaturesFor(["4/4", "3/4", "2/4"]);
const COMPOUND_TIME_SIGS = timeSignaturesFor(["6/8", "9/8", "12/8"]);
const EVERY_TIME_SIG = [...Object.values(TIME_SIGS), ...Object.values(COMPOUND_TIME_SIGS)];

type TimeSig = ExerciseTimeSignature;

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

/**
 * Compound only: a figure that starts inside a beat ends inside it, and a note
 * that starts on a beat lasts whole beats. Every compound figure fills whole
 * beats, so a failure here is a figure placed off the beat.
 */
function crossesABeat(measure: string, beatUnits: number): boolean {
  let at = 0;
  for (const d of durationsIn(measure)) {
    const into = at % beatUnits;
    if (into !== 0 && into + d > beatUnits) return true;
    if (into === 0 && d > beatUnits && d % beatUnits !== 0) return true;
    at += d;
  }
  return false;
}

// ── The reference solver ─────────────────────────────────────────────────────
// Now lives in src/lib so the UI can warn before Generate is ever pressed. It is
// still a separate implementation from the *generator*, which is what this check
// exists to compare against.

/**
 * Can this selection fill the exercise at all, under the generator's own rules?
 * Deliberately a separate, exhaustive implementation: the generator searches
 * randomly and gives up, this one enumerates. Where they disagree, one of them
 * is wrong, and that is the whole point of the check.
 */
// ── Every one- and two-rhythm selection ──────────────────────────────────────

function selections(timeSig: TimeSig): Rhythm[][] {
  const usable = selectableRhythmsFor(meterKindOf(timeSig)).filter(
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
  for (const timeSig of EVERY_TIME_SIG) {
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

        const canSolve = canFillExercise(set, timeSig.tsPerMeasure, total, ties, timeSig.beatUnits);
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
          if (meterKindOf(timeSig) === "compound" && crossesABeat(measure, timeSig.beatUnits)) {
            fail(`beats: ${label} a figure crosses a dotted-quarter beat  (${measure})`);
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

/** Compound meter: a tie - over a barline or inside a 9/8 bar - joins whole beats. */
function checkCompoundTieShapes() {
  let ties = 0;
  for (const timeSig of Object.values(COMPOUND_TIME_SIGS)) {
    const set = selectableRhythmsFor("compound").filter((r) => !r.rest);
    for (let i = 0; i < 40; i++) {
      const body = generate({ rhythms: set, timeSig, ties: true, measures: 8 });
      if (!body) continue;
      for (const m of body.matchAll(/[A-Ga-g][,']*(\d+)-\s*\|?\s*[A-Ga-g][,']*(\d+)/g)) {
        ties++;
        const [a, b] = [Number(m[1]), Number(m[2])];
        if (a % timeSig.beatUnits !== 0 || b % timeSig.beatUnits !== 0) {
          fail(`tie shape: ${timeSig.name} produced ${a} tied to ${b} (not whole beats)`);
        }
      }
    }
  }
  return ties;
}

function checkLyricAlignment() {
  const cases = [
    { timeSig: TIME_SIGS["4/4"], set: selectableRhythms.filter((r) => !r.rest && !r.pattern) },
    // 9/8's last bar is a dotted half tied to a dotted quarter inside the bar.
    { timeSig: COMPOUND_TIME_SIGS["9/8"], set: selectableRhythmsFor("compound").filter((r) => !r.rest && !r.pattern) },
  ];
  let checked = 0;
  for (const { timeSig, set } of cases) {
    for (let i = 0; i < 40; i++) {
      const body = generate({ rhythms: set, timeSig, ties: true, measures: 4, solfege: true });
      if (!body) continue;
      checked++;
      const lines = body.split("\n");
      const music = lines.filter((l) => !l.startsWith("w:")).join(" ");
      const lyric = lines.find((l) => l.startsWith("w:")) ?? "";
      const noteEls = (music.match(/[A-Ga-g][,']*\d+/g) || []).length;
      const slots = lyric.replace(/^w:\s*/, "").trim().split(/\s+/).filter(Boolean).length;
      if (noteEls !== slots) {
        fail(`lyric alignment: ${timeSig.name} ${noteEls} note elements but ${slots} lyric slots`);
        break;
      }
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
    // Named in rhythm-syllables.ts rather than derived: the sustain rule spells
    // a held note by the beats it crosses, so deriving this gave "tu-u",
    // identical to a half note. The "a" is beat two, inside the long note.
    eighthDotQuarter: ["ti", "ti-a"],
    wholeRest: ["(sh)"],
  },
  counting: {
    quarter: ["1"],
    half: ["1_2"],
    whole: ["1_2_3_4"],
    eighthEighth: ["1", "&"],
    fourSixteenths: ["1", "e", "&", "a"],
    eighthSixteenthSixteenth: ["1", "&", "a"],
    sixteenthSixteenthEighth: ["1", "e", "&"],
    sixteenthEighthSixteenth: ["1", "e", "a"],
    dotEighthSixteenth: ["1", "a"],
    dotQuarterEighth: ["1_2", "&"],
    dotHalfQuarter: ["1_2_3", "4"],
    eighthQuarterEighth: ["1", "&_2", "&"],
    eighthDotQuarter: ["1", "&_2"],
    wholeRest: ["(1)_(2)_(3)_(4)"],
  },
};

/** Compound figures, read from a 6/8 downbeat. */
const COMPOUND_SYLLABLE_TABLE: Record<string, Record<string, string[]>> = {
  kodaly: {
    dotQuarter: ["ta"],
    dotHalfCompound: ["tu-u"],
    threeEighths: ["ti", "ti", "ti"],
    quarterEighth: ["ti", "ti"],
    sixSixteenths: ["ti", "ri", "ti", "ri", "ti", "ri"],
    twoSixteenthsTwoEighths: ["ti", "ri", "ti", "ti"],
  },
  counting: {
    dotQuarter: ["1"],
    dotHalfCompound: ["1_2"],
    threeEighths: ["1", "la", "li"],
    quarterEighth: ["1", "li"],
    eighthQuarter: ["1", "la"],
    sixSixteenths: ["1", "ta", "la", "ta", "li", "ta"],
    eighthTwoSixteenthsEighth: ["1", "la", "ta", "li"],
    quarterTwoSixteenths: ["1", "li", "ta"],
  },
};

function checkSyllables() {
  const cases = [
    { tables: SYLLABLE_TABLE, timeSig: TIME_SIGS["4/4"], pool: selectableRhythms },
    { tables: COMPOUND_SYLLABLE_TABLE, timeSig: COMPOUND_TIME_SIGS["6/8"], pool: selectableRhythmsFor("compound") },
  ];
  let checked = 0;
  for (const { tables, timeSig, pool } of cases) {
    for (const systemId of Object.keys(syllableSystems)) {
      const table = tables[systemId];
      if (!table) {
        fail(`syllables: no expected ${timeSig.name} mapping recorded for system "${systemId}"`);
        continue;
      }
      for (const [rhythmName, expected] of Object.entries(table)) {
        const rhythm = pool.find((r) => r.name === rhythmName);
        if (!rhythm) {
          fail(`syllables: "${rhythmName}" is not a selectable ${timeSig.name} rhythm`);
          continue;
        }
        // Every figure in the tables fills its meter's bar on its own, so it
        // always starts on beat 1 and the expected reading is exact.
        let seenExpected = false;
        for (let i = 0; i < 12 && !seenExpected; i++) {
          const body = generate({ rhythms: [rhythm], timeSig, measures: 2, syllables: systemId });
          if (!body) continue;
          const syllables = [...body.matchAll(/"_([^"]*)"/g)].map((m) => m[1]);
          if (syllables.slice(0, expected.length).join(" ") === expected.join(" ")) seenExpected = true;
        }
        checked++;
        if (!seenExpected) {
          fail(`syllables: ${systemId}/${rhythmName} never produced "${expected.join(" ")}" on beat 1 of ${timeSig.name}`);
        }
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
const compoundTieCount = checkCompoundTieShapes();
const lyricCount = checkLyricAlignment();
const syllableCount = checkSyllables();
const elapsed = ((Date.now() - started) / 1000).toFixed(1);

report(`rhythm checks (${elapsed}s)`);
report(`  ${selectionCount} selections: well-formed measures, and generation`);
report(`     succeeds on exactly the solvable ones`);
report(`  ${tieCount} barline ties, none landing on a dotted note`);
report(`  ${compoundTieCount} compound ties, each joining whole dotted-quarter beats`);
report(`  ${lyricCount} exercises with solfege aligned across ties`);
report(`  ${syllableCount} syllable mappings across ${Object.keys(syllableSystems).length} systems`);

if (failures.length > 0) {
  report(`\n${failures.length} FAILURE(S):`);
  for (const f of failures.slice(0, 40)) report("  " + f);
  if (failures.length > 40) report(`  ...and ${failures.length - 40} more`);
  process.exit(1);
}
report("\nall checks passed");
