/**
 * Phrases and periods for Unison exercises: 4-bar phrases that ask and
 * answer, the way a melody is built, instead of one line wandering from the
 * first bar to the last. Tests: tests/unit/unison-form.test.ts.
 *
 * A period is two phrases. The first (the question) ends on a half cadence -
 * on V, at so, ti or re. The second (the answer) sings the question's first
 * two bars again, note for note, then turns to an authentic cadence on do.
 * Longer forms add contrasting phrases and bring the opening back at the end:
 * 16 bars are A A' B A' (period, contrast, the answer again).
 *
 * The play-along videos lay the phrases over their backing track's sections
 * (backing-tracks.ts `form`), so the questions and answers land on the
 * track's own 4- and 8-bar changes and the opening returns where the track's
 * does.
 *
 * Built on the generator, not inside it: each phrase is an ordinary exercise
 * (createNewSr) a few bars long, the question asked for with
 * `phraseEnding: "half"`; this joins them, checks every join is a move the
 * exercise's skip rules allow, and writes the whole out once. With phrases off
 * nothing here runs and the generator's output is exactly what it was.
 */
import type { UnisonScore } from "./generateUnison";
import { isAllowedMove, toSkipPolicy } from "./skip-policy";

export type Ending = "half" | "authentic";

/**
 * One phrase of a plan.
 * - new: fresh material, ending as `ending` says.
 * - answer: the first `of`-phrase's opening two bars, then new bars to an
 *   authentic cadence.
 * - repeat: the `of`-phrase again, note for note.
 */
export type PhraseSpec =
  | { kind: "new"; bars: number; ending: Ending; letter: string }
  | { kind: "answer"; bars: number; of: number; letter: string }
  | { kind: "repeat"; bars: number; of: number; letter: string };

/** The bars an answer copies from its question. */
export const RHYME_BARS = 2;

/** A section of a backing track: its letter (repeated letters are the same music) and its length. */
export interface FormSection {
  letter: string;
  bars: number;
}

/**
 * The phrase plan for an exercise `measures` long, on the page: whole
 * periods where the length allows, contrast in the middle, the opening's
 * answer to finish. Null where the length is not in 4-bar phrases (the page
 * then writes its usual single line).
 */
export function periodPlan(measures: number): PhraseSpec[] | null {
  if (measures < 8 || measures % 4 !== 0) return null;
  // 12 bars: question, contrast, answer - a b a'.
  if (measures === 12) {
    return [
      { kind: "new", bars: 4, ending: "half", letter: "A" },
      { kind: "new", bars: 4, ending: "half", letter: "B" },
      { kind: "answer", bars: 4, of: 0, letter: "A" },
    ];
  }
  // Otherwise the opening period (A), contrast in 8- and 4-bar sections, and
  // the answer to finish: 8 = A, 16 = A A' B A', 20 = A B A', 24 = A B C A'.
  const sections: FormSection[] = [{ letter: "A", bars: 8 }];
  let middle = measures - 8 - (measures > 8 ? 4 : 0);
  const letters = ["B", "C", "D"];
  for (let k = 0; middle > 0; k++) {
    const bars = middle >= 8 ? 8 : 4;
    sections.push({ letter: letters[k % letters.length], bars });
    middle -= bars;
  }
  if (measures > 8) sections.push({ letter: "A", bars: 4 });
  return planFromForm(sections);
}

/**
 * The phrase plan over a backing track's sections. Each new letter's first
 * 8-bar section is a period (question, answer); a 4-bar section is one
 * phrase. A letter heard before comes back: the 8-bar return is its period's
 * question again with a new answer, the 4-bar return its answer. The plan
 * always ends on an authentic cadence.
 */
export function planFromForm(form: FormSection[]): PhraseSpec[] {
  const plan: PhraseSpec[] = [];
  /** For each letter, where its first question and its answer (or only phrase) are in the plan. */
  const seen = new Map<string, { question?: number; answer: number }>();
  for (const section of form) {
    const phrases = Math.max(1, Math.round(section.bars / 4));
    const before = seen.get(section.letter);
    if (!before) {
      if (phrases >= 2) {
        const question = plan.length;
        plan.push({ kind: "new", bars: 4, ending: "half", letter: section.letter });
        plan.push({ kind: "answer", bars: 4, of: question, letter: section.letter });
        for (let k = 2; k < phrases; k++) plan.push({ kind: "new", bars: 4, ending: k % 2 ? "authentic" : "half", letter: section.letter });
        seen.set(section.letter, { question, answer: question + 1 });
      } else {
        plan.push({ kind: "new", bars: 4, ending: "half", letter: section.letter });
        seen.set(section.letter, { answer: plan.length - 1 });
      }
      continue;
    }
    if (phrases >= 2 && before.question !== undefined) {
      plan.push({ kind: "repeat", bars: 4, of: before.question, letter: section.letter });
      plan.push({ kind: "answer", bars: 4, of: before.question, letter: section.letter });
      for (let k = 2; k < phrases; k++) plan.push({ kind: "new", bars: 4, ending: k % 2 ? "authentic" : "half", letter: section.letter });
    } else {
      for (let k = 0; k < phrases; k++) plan.push({ kind: "repeat", bars: 4, of: before.answer, letter: section.letter });
    }
  }
  // Whatever the form, the piece ends at home.
  const last = plan[plan.length - 1];
  if (last && last.kind === "new") plan[plan.length - 1] = { ...last, ending: "authentic" };
  if (last && last.kind === "repeat" && endingOf(plan, last.of) === "half") {
    plan[plan.length - 1] = { kind: "new", bars: last.bars, ending: "authentic", letter: last.letter };
  }
  return plan;
}

/** How a planned phrase ends. */
export function endingOf(plan: PhraseSpec[], index: number): Ending {
  const p = plan[index];
  if (p.kind === "new") return p.ending;
  if (p.kind === "answer") return "authentic";
  return endingOf(plan, p.of);
}

export const planBars = (plan: PhraseSpec[]) => plan.reduce((sum, p) => sum + p.bars, 0);

// ------------------------------------------------------------------ composing

type Note = { noteLength: number; pitchValue: number; degree: number; rhythm?: { rest?: boolean } | null; [k: string]: unknown };
type Generated = [abc: string, chords: unknown[], score: UnisonScore];

/** How many draws a phrase gets to join its neighbours. */
const JOIN_TRIES = 60;
/** How many times the whole plan is tried before the exercise is written as one line instead. */
const PLAN_TRIES = 8;

const notesOf = (score: UnisonScore): Note[] => (Object.values(score.partsObject.parts)[0] as any).chordNoteObject;
const sounding = (notes: Note[]) => notes.filter((n) => !n.rhythm?.rest);

/** The notes of a part from bar `from` for `bars` bars (notes never cross a barline here: ties are off). */
function barsOf(notes: Note[], barUnits: number, from: number, bars: number): Note[] {
  const out: Note[] = [];
  let pos = 0;
  for (const n of notes) {
    const bar = Math.floor(pos / barUnits);
    if (bar >= from && bar < from + bars) out.push(structuredClone(n));
    pos += n.noteLength;
  }
  return out;
}

/** An eighth or shorter, in 32nds: where Max 8th skip applies. */
const SHORT = 4;

/**
 * Writes the exercise for `plan`: each new phrase from `generate` (the
 * generator, measures and ending set per phrase), answers and repeats copied
 * from the phrases they answer or repeat. Every join between phrases must be
 * a move the exercise's own rules allow - its skips (exact skip lists too)
 * and, between two eighths, its Max 8th skip - so a phrase is drawn again
 * until it joins the phrase before it and, where the plan already fixes it,
 * the one after. A plan that cannot be joined is tried again whole, and after
 * that the exercise is written as the usual single line: a lost rhyme, never
 * a broken rule (the NYSSMA levels hold their skip lists exactly).
 * Returns what createNewSr returns.
 */
export function composeUnison(
  params: any,
  plan: PhraseSpec[],
  generate: (params: any) => Generated,
  finish: (score: UnisonScore) => Generated,
): Generated {
  const policy = toSkipPolicy(params.maxSkip);
  const maxEighth = typeof params.maxEighthSkip === "number" ? params.maxEighthSkip : Infinity;
  const joins = (a: Note[], b: Note[]) => {
    const last = sounding(a).at(-1);
    const first = sounding(b)[0];
    if (!last || !first) return true;
    if (!isAllowedMove(last, first, first.noteLength, policy)) return false;
    // Two eighths across a join follow the Max 8th skip, as inside a figure.
    const lastIsShort = a.at(-1) === last && last.noteLength <= SHORT;
    if (lastIsShort && first.noteLength <= SHORT && Math.abs(first.pitchValue - last.pitchValue) > maxEighth) return false;
    return true;
  };
  for (let attempt = 0; attempt < PLAN_TRIES; attempt++) {
    const score = composeOnce(params, plan, generate, joins);
    if (score) return finish(score);
  }
  return generate({ ...structuredClone(params), phrases: false, form: undefined });
}

function composeOnce(
  params: any,
  plan: PhraseSpec[],
  generate: (params: any) => Generated,
  joins: (a: Note[], b: Note[]) => boolean,
): UnisonScore | null {
  const phrases: Note[][] = [];
  let template: UnisonScore | null = null;
  const draw = (measures: number, ending: Ending): { notes: Note[]; score: UnisonScore } => {
    const out = generate({ ...structuredClone(params), measures, phraseEnding: ending, dynamics: [], phrases: false, form: undefined });
    return { notes: notesOf(out[2]), score: out[2] };
  };
  /**
   * How the phrase after `index` will begin, where the plan fixes it: a
   * repeat of something written, or an answer (it opens with its question's
   * opening - which, when the question is this phrase, is `own`).
   */
  const fixedNext = (index: number, own: Note[]): Note[] | null => {
    const next = plan[index + 1];
    if (next?.kind === "repeat" && phrases[next.of]) return phrases[next.of];
    if (next?.kind === "answer") return next.of === index ? own : phrases[next.of] ?? null;
    return null;
  };

  for (let i = 0; i < plan.length; i++) {
    const spec = plan[i];
    const before = phrases[i - 1];
    if (spec.kind === "repeat") {
      const copy = phrases[spec.of].map((n) => structuredClone(n));
      if (before && !joins(before, copy)) return null;
      phrases.push(copy);
      continue;
    }
    let chosen: Note[] | null = null;
    for (let t = 0; t < JOIN_TRIES && !chosen; t++) {
      let notes: Note[];
      if (spec.kind === "answer" && template) {
        // The question's opening two bars, then two new bars to a full cadence.
        const opening = barsOf(phrases[spec.of], template.timeSig.tsPerMeasure, 0, RHYME_BARS);
        const rest = draw(spec.bars - RHYME_BARS, "authentic");
        if (!joins(opening, rest.notes)) continue;
        notes = [...opening, ...rest.notes];
      } else {
        const out = draw(spec.bars, spec.kind === "new" ? spec.ending : "authentic");
        template ??= out.score;
        notes = out.notes;
      }
      if (before && !joins(before, notes)) continue;
      const next = fixedNext(i, notes);
      if (next && !joins(notes, next)) continue;
      chosen = notes;
    }
    if (!chosen) return null;
    phrases.push(chosen);
  }

  const score = structuredClone(template!) as UnisonScore;
  const part = Object.values(score.partsObject.parts)[0] as any;
  part.chordNoteObject = phrases.flat();
  return score;
}
