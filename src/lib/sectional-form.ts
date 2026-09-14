import type { VoiceNote } from "./types";
import { splitScore, voiceIdsFromHeader } from "./abc-score-file";
import { seamLeapOk, seamResolutionOk, parallelsAcross, lastSounding, firstSounding } from "./splice-seams";

/**
 * Exercises built from several sections, so a piece can have a shape.
 *
 * Real UIL sight-reading music is sectional. The transcription in `scores/`
 * runs A to bar 10, a B section from the dominant, a C section at 16, an
 * imitative passage at 20, A again at 27, a full cadence at 34 where level 4
 * choirs stop, and a coda to 44. The generator writes one period of 8 to 16
 * bars and stops, which is a phrase rather than a piece.
 *
 * **This deliberately does not touch the generator.** It calls
 * `generateChoralExercise` once per section and joins the results. Nothing in
 * the search, the voicing or the harmony changes, so an exercise generated
 * without sections is byte-identical to one generated before this existed -
 * which is the whole point of building it this way round. The cost is that a
 * section cannot yet be told to start anywhere but the tonic; see the note on
 * `startsOn` below.
 *
 * What it does own is the SEAM. Two sections generated independently know
 * nothing about each other, so the join can hand a singer a leap the search
 * would never have written, strand an accidental that was owed a resolution, or
 * put two voices into parallel fifths across the barline. Each candidate
 * section is vetted against the end of the one before it and regenerated if it
 * does not fit - the same checks, and the same module, that the rhyming-phrase
 * and unison splices use.
 */

/** One section of a piece. */
export type SectionSpec = {
  /** "A", "B", "A'", "coda" - used to refer back to it. */
  label: string;
  measures: number;
  /**
   * Restate an earlier section's music instead of generating new.
   *
   * This is what makes a return a RETURN. Generating another section with the
   * same settings would produce different music that merely sounds similar;
   * a listener recognises A' because it is A.
   */
  restates?: string;
};

/** What a caller's generator hands back for one section. */
export type GeneratedSection = {
  voices: VoiceNote[][];
  /** The section rendered as ABC, so the pieces can be joined for display. */
  abc?: string;
};

export type SectionResult = {
  label: string;
  measures: number;
  /** Bar number this section begins at, counting from 1. */
  startsAtBar: number;
  voices: VoiceNote[][];
  abc?: string;
  restated: boolean;
};

export type SectionalOptions = {
  sections: SectionSpec[];
  maxSkip: number;
  /**
   * After which section the short version ends.
   *
   * One piece serving two levels is standard practice: a full cadence part way
   * through where the lower level stops, and the rest for the higher one. This
   * records where that is; it does not change a note.
   */
  shortEndingAfter?: string;
  /** Tries per section before its seam is accepted as-is. */
  seamAttempts?: number;
};

/** Everything a caller needs to render or inspect the finished piece. */
export type SectionalResult = {
  voices: VoiceNote[][];
  sections: SectionResult[];
  totalMeasures: number;
  /** Bar the short version ends on, if one was asked for. */
  shortEndingBar?: number;
  /** Seams that could not be made to fit, for reporting rather than throwing. */
  roughSeams: { after: string; reason: string }[];
};

/**
 * Does `next` follow `previous` without introducing a fault at the join?
 *
 * Exported because it is the interesting part and deserves its own tests: the
 * sections themselves are the generator's work, already tested, and the only
 * thing new here is whether two of them can be put end to end.
 */
export function seamOk(
  previous: VoiceNote[][],
  next: VoiceNote[][],
  maxSkip: number
): { ok: true } | { ok: false; reason: string } {
  if (previous.length !== next.length) {
    return { ok: false, reason: "different number of voices" };
  }
  for (let v = 0; v < previous.length; v++) {
    if (!seamLeapOk(previous[v], next[v], maxSkip)) {
      return { ok: false, reason: `voice ${v} leaps too far into the next section` };
    }
    if (!seamResolutionOk(previous[v], next[v])) {
      return { ok: false, reason: `voice ${v} strands an accidental at the join` };
    }
  }
  const prevs = previous.map((v) => lastSounding(v));
  const nexts = next.map((v) => firstSounding(v));
  if (parallelsAcross(prevs, nexts)) {
    return { ok: false, reason: "parallel fifths or octaves across the join" };
  }
  return { ok: true };
}

/**
 * Build a piece from sections.
 *
 * `generate` is injected rather than imported so this can be tested without
 * running the whole search - and so the caller keeps control of every
 * generation parameter. It is handed the measure count and must return one
 * section's voices, index-aligned with every other section's.
 */
export function buildSectionalExercise(
  generate: (measures: number, attempt: number) => GeneratedSection,
  opts: SectionalOptions
): SectionalResult {
  const { sections, maxSkip, seamAttempts = 6 } = opts;
  if (sections.length === 0) {
    return { voices: [], sections: [], totalMeasures: 0, roughSeams: [] };
  }

  const done: SectionResult[] = [];
  const roughSeams: SectionalResult["roughSeams"] = [];
  let combined: VoiceNote[][] | null = null;
  let bar = 1;

  for (const spec of sections) {
    const earlier = spec.restates
      ? done.find((d) => d.label === spec.restates)
      : undefined;
    if (spec.restates && !earlier) {
      throw new Error(`Section "${spec.label}" restates "${spec.restates}", which does not exist.`);
    }

    let chosen: GeneratedSection | null = null;
    let lastReason = "";
    if (earlier) {
      // A restatement is a copy, not another roll of the dice.
      chosen = { voices: earlier.voices.map((v) => v.map((n) => ({ ...n }))), abc: earlier.abc };
      if (combined) {
        const verdict = seamOk(combined, chosen.voices, maxSkip);
        if (!verdict.ok) {
          lastReason = verdict.reason;
          roughSeams.push({ after: done[done.length - 1].label, reason: verdict.reason });
        }
      }
    } else {
      for (let attempt = 0; attempt < seamAttempts; attempt++) {
        const candidate = generate(spec.measures, attempt);
        if (!combined) { chosen = candidate; break; }
        const verdict = seamOk(combined, candidate.voices, maxSkip);
        if (verdict.ok) { chosen = candidate; break; }
        lastReason = verdict.reason;
        chosen = candidate; // keep the last one in case none fits
      }
      // A seam that never came good is reported, not thrown: a piece with one
      // awkward join is worth more than no piece, and the caller can say so.
      if (lastReason && combined) {
        const verdict = seamOk(combined, chosen!.voices, maxSkip);
        if (!verdict.ok) {
          roughSeams.push({ after: done[done.length - 1].label, reason: verdict.reason });
        }
      }
    }

    const voices = chosen!.voices;
    done.push({
      label: spec.label,
      measures: spec.measures,
      startsAtBar: bar,
      voices,
      abc: chosen!.abc,
      restated: Boolean(earlier),
    });
    bar += spec.measures;

    combined = combined
      ? combined.map((v, i) => [...v, ...voices[i]])
      : voices.map((v) => [...v]);
  }

  const totalMeasures = sections.reduce((sum, s) => sum + s.measures, 0);
  let shortEndingBar: number | undefined;
  if (opts.shortEndingAfter) {
    const at = done.find((d) => d.label === opts.shortEndingAfter);
    if (at) shortEndingBar = at.startsAtBar + at.measures - 1;
  }

  return { voices: combined!, sections: done, totalMeasures, shortEndingBar, roughSeams };
}

/**
 * A shape like the transcribed example: statement, departure, return, coda.
 *
 * Offered as a starting point rather than a rule - the measure counts are the
 * ones that piece uses, and a caller is free to describe any other shape.
 */
export function classicSectionalShape(): SectionSpec[] {
  return [
    { label: "A", measures: 8 },
    { label: "B", measures: 8 },
    { label: "C", measures: 4 },
    { label: "A'", measures: 8, restates: "A" },
    { label: "coda", measures: 4 },
  ];
}

/**
 * The sections, joined into one ABC file.
 *
 * Each section is already a complete, valid ABC document; this keeps the first
 * one's header and runs the voices end to end underneath it. Working on the
 * rendered text rather than re-assembling from notes is what lets this module
 * stay off the generator entirely - `assembleAbcString` needs the voice parts
 * and rhythms, which `generateChoralExercise` does not hand back, and asking it
 * to would be changing the thing this is meant not to touch.
 *
 * Returns null if any section came without ABC, since half a piece is no use.
 */
export function joinSectionAbc(sections: SectionResult[]): string | null {
  if (sections.length === 0 || sections.some((s) => !s.abc)) return null;

  const first = splitScore(sections[0].abc!);
  const ids = voiceIdsFromHeader(first.header);
  if (ids.length === 0) return null;

  const music: Record<string, string[]> = Object.fromEntries(ids.map((id) => [id, []]));
  for (const section of sections) {
    const part = splitScore(section.abc!);
    for (const id of ids) {
      const line = (part.voices[id] ?? "").replace(/\s+/g, " ").trim();
      // A section ends with a final barline; only the last one should keep it.
      music[id].push(line.replace(/\|\]\s*$/, "|"));
    }
  }

  const lines = ids.map((id) => {
    const joined = music[id].join(" ").replace(/\s+/g, " ").trim();
    return `[V:${id}] ${joined.replace(/\|$/, "|]")}`;
  });
  return `${first.header}\n${lines.join("\n")}\n`;
}
