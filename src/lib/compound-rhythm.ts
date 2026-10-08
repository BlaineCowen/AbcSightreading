import { rhythms as catalogue, type Rhythm } from "../resources/rhythms";
import type { ExerciseMeter } from "./meter";
import type { Cadence, RhythmWithPattern } from "./types";

/**
 * Rhythm for 6/8, 9/8 and 12/8, felt in dotted-quarter beats.
 *
 * Every compound figure fills one beat or two, so a bar fills beat by beat and
 * nothing can land off the beat - beat alignment holds by construction. That
 * also makes the search small enough to be exact: it backtracks over beat
 * positions and remembers the ones that dead-end, so it fails exactly where
 * rhythm-feasibility's solver finds no tiling. check-rhythm holds the two to
 * that.
 *
 * The phrase shape is simple meter's (rhythm-generation.ts): a cadence closes
 * every four bars - a held note and a one-beat breath - and the last bar is one
 * note. Those held notes come from the meter, not the picker: a 9/8 bar is a
 * dotted half tied to a dotted quarter, which nobody selects.
 *
 * Kept apart from generateRandomRhythm's simple-meter fill on purpose: that
 * fill's every random draw is frozen by tests/unit/meter-regression.test.ts.
 */

const PHRASE_BARS = 4;
/** A figure that fills the bar, mid-phrase, stands the music still - as in simple meter. */
const MID_PHRASE_FULL_BAR_PENALTY = 0.1;
/** The breath rests a little more often than it picks up, as in simple meter. */
const BREATH_REST_ODDS = 0.6;

/** A held cadence note, `units` long: made from the meter rather than chosen. */
export function compoundHeldNote(units: number): Rhythm {
  return {
    name: "compoundHeld",
    abcValue: [String(units)],
    meterValue: [units / 32],
    totalValue: units,
    rest: false,
    oddsWeight: 0,
    maxRng: 0,
    pattern: false,
    symbol: "",
    weight: 0,
    meterKind: "compound",
  };
}

const unitsOf = (v: string) => parseInt(String(v).replace(/^[a-z]+/i, ""), 10);
const isRestValue = (v: string) => String(v).startsWith("z");

/** A figure as the notes the writer reads: a pattern split note by note, as rhythm-generation does. */
export function expand(r: Rhythm): RhythmWithPattern[] {
  if (!r.pattern) {
    return [{ ...r, isPatternNote: false, isPatternStart: false, isPatternEnd: false, patternIndex: null }];
  }
  // The pattern's chord starts on its first sung note, not on a leading rest.
  const firstSung = Math.max(0, r.abcValue.findIndex((v) => !isRestValue(v)));
  return r.abcValue.map((v, i) => ({
    ...r,
    abcValue: [v],
    totalValue: unitsOf(v),
    meterValue: [r.meterValue[i]],
    rest: isRestValue(v),
    isPatternNote: true,
    isPatternStart: i === firstSung,
    isPatternEnd: i === r.abcValue.length - 1,
    patternIndex: i,
  }));
}

/**
 * May this figure start at `pos` and still end by `end`? It must fit in the
 * bar, unless it is a plain note and ties are on - split at a beat it is two
 * dotted values, plainly written in compound meter.
 *
 * spanFits and fillSpan share this, so they cannot drift apart.
 * rhythm-feasibility keeps its own copy on purpose: it is the reference the
 * generator is checked against, and must not borrow the generator's rules.
 */
function fitsAt(r: Rhythm, pos: number, end: number, meter: ExerciseMeter, allowTies: boolean): boolean {
  if (r.totalValue > end - pos) return false;
  const room = meter.tsPerMeasure - (pos % meter.tsPerMeasure);
  return r.totalValue <= room || (allowTies && !r.pattern && !r.rest);
}

/** The list in a weighted random order, sampled without replacement. */
function weightedOrder(list: Rhythm[], weightOf: (r: Rhythm) => number): Rhythm[] {
  const pool = list.map((r) => ({ r, w: Math.max(0.001, weightOf(r)) }));
  const out: Rhythm[] = [];
  while (pool.length > 0) {
    const total = pool.reduce((s, p) => s + p.w, 0);
    let x = Math.random() * total;
    let i = 0;
    for (; i < pool.length - 1; i++) {
      x -= pool[i].w;
      if (x <= 0) break;
    }
    out.push(pool.splice(i, 1)[0].r);
  }
  return out;
}

/**
 * Whether [start, end) can be filled at all: fillSpan's rules, with no weights
 * and no randomness. A position shown to dead-end is never tried again, which
 * is what makes both exact - whether a position can be finished depends only
 * on the position.
 */
function spanFits(start: number, end: number, figures: Rhythm[], meter: ExerciseMeter, allowTies: boolean): boolean {
  const dead = new Set<number>();
  const walk = (pos: number): boolean => {
    if (pos === end) return true;
    if (dead.has(pos)) return false;
    for (const r of figures) {
      if (fitsAt(r, pos, end, meter, allowTies) && walk(pos + r.totalValue)) return true;
    }
    dead.add(pos);
    return false;
  };
  return walk(start);
}

/** Fills [start, end) with figures, weighted and random, or returns null when nothing can. */
function fillSpan(
  start: number,
  end: number,
  figures: Rhythm[],
  meter: ExerciseMeter,
  measures: number,
  allowTies: boolean,
  timeUsed: Map<string, number>
): Rhythm[] | null {
  const dead = new Set<number>();
  const walk = (pos: number): Rhythm[] | null => {
    if (pos === end) return [];
    if (dead.has(pos)) return null;
    const legal = figures.filter((r) => fitsAt(r, pos, end, meter, allowTies));
    const bar = Math.floor(pos / meter.tsPerMeasure);
    const endsPhrase = bar % PHRASE_BARS === PHRASE_BARS - 1 || bar === measures - 1;
    const weightOf = (r: Rhythm) => {
      // Variety by time used, not count, as in simple meter.
      const variety = Math.max(1, 5 - (timeUsed.get(r.name) ?? 0) / meter.tsPerMeasure);
      const stillness = r.totalValue >= meter.tsPerMeasure && !endsPhrase ? MID_PHRASE_FULL_BAR_PENALTY : 1;
      return r.weight * variety * stillness;
    };
    for (const r of weightedOrder(legal, weightOf)) {
      timeUsed.set(r.name, (timeUsed.get(r.name) ?? 0) + r.totalValue);
      const rest = walk(pos + r.totalValue);
      if (rest) return [r, ...rest];
      timeUsed.set(r.name, (timeUsed.get(r.name) ?? 0) - r.totalValue);
    }
    dead.add(pos);
    return null;
  };
  return walk(start);
}

/** How a phrase ends in this meter. */
function cadenceFor(meter: ExerciseMeter, final: boolean, pickup: Rhythm | null, breathRest: Rhythm): Rhythm[] {
  // The last bar is one note; 6/8 is two beats, so like 2/4 it keeps no breath.
  if (final || meter.beatsPerMeasure === 2) return [compoundHeldNote(meter.tsPerMeasure)];
  const breath = pickup && Math.random() >= BREATH_REST_ODDS ? pickup : breathRest;
  return [compoundHeldNote(meter.tsPerMeasure - meter.beatUnits), breath];
}

export function generateCompoundRhythm(
  meter: ExerciseMeter,
  measures: number,
  available: Rhythm[],
  selectedCadences: Cadence[],
  allowTies: boolean
): RhythmWithPattern[] {
  const figures = available.filter(
    (r) =>
      r.meterKind === "compound" &&
      r.totalValue > 0 &&
      r.totalValue % meter.beatUnits === 0 &&
      r.totalValue <= meter.tsPerMeasure
  );
  if (figures.length === 0) {
    throw new Error(`No ${meter.name} rhythms are selected. Choose from the compound rhythms.`);
  }
  const plain = figures.filter((r) => !r.pattern && !r.rest);
  // As in simple meter: a phrase ends on a held note only when a held note is
  // something the reader has selected.
  const enforceCadence = plain.length > 0;
  const pickup = plain.find((r) => r.totalValue === meter.beatUnits) ?? null;
  const breathRest = catalogue.find((r) => r.name === "dotQuarterRest");
  if (!breathRest) throw new Error("The rhythm catalogue has no dotted-quarter rest.");

  const total = measures * meter.tsPerMeasure;
  const blockUnits = PHRASE_BARS * meter.tsPerMeasure;
  const timeUsed = new Map<string, number>();
  const result: RhythmWithPattern[] = [];
  let cadenceIndex = 0;
  const cantFill = () =>
    new Error(`The selected rhythms can't fill ${measures} measure(s) of ${meter.name}. Add a shorter rhythm.`);

  for (let start = 0; start < total; start += blockUnits) {
    const end = Math.min(start + blockUnits, total);
    const cadence = enforceCadence ? cadenceFor(meter, end >= total, pickup, breathRest) : [];
    const cadenceUnits = cadence.reduce((s, r) => s + r.totalValue, 0);
    // The block must fill from the selection alone. The cadence's held notes
    // are the meter's, not the reader's, and must not make possible what the
    // selection is not - one bar of 9/8 from dotted halves stays refused, as
    // rhythm-feasibility says.
    if (!spanFits(start, end, figures, meter, allowTies)) throw cantFill();
    // The cadence can leave a remainder nothing fills even when the whole
    // block tiles; then the block goes without it, as simple meter does.
    const closes =
      cadence.length > 0 &&
      cadenceUnits <= end - start &&
      spanFits(start, end - cadenceUnits, figures, meter, allowTies);
    const body = fillSpan(start, closes ? end - cadenceUnits : end, figures, meter, measures, allowTies, timeUsed);
    if (!body) throw cantFill();
    for (const r of body) result.push(...expand(r));
    if (closes) {
      const [held, breath] = cadence;
      result.push({
        ...expand(held)[0],
        isCadenceEnd: true,
        cadenceType: selectedCadences[cadenceIndex]?.type || "Unknown",
      });
      // NOT isCadenceEnd: that flag advances the cadence plan, once per phrase.
      if (breath) result.push({ ...expand(breath)[0], isCadenceEnd: false, isPhraseBreath: true });
      cadenceIndex++;
    }
  }
  return result;
}
