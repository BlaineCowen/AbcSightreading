import type { Chord, VoiceNote } from "./types";
import type { FormPlan, PlannedSection } from "./form-plan";
import {
  buildSectionalExercise,
  joinSectionAbc,
  type SectionResult,
} from "./sectional-form";

/**
 * Turning a `FormPlan` into an actual piece.
 *
 * `form-plan.ts` decides the shape and `sectional-form.ts` joins sections while
 * vetting the seams; this is the small amount of glue between them, plus the
 * one thing neither could own - re-rendering a finished piece when the
 * annotation toggles change, which needs every section's own `render` kept and
 * the whole thing re-joined.
 *
 * Nothing here generates music. `generate` is injected, exactly as it is for
 * `buildSectionalExercise`, so this can be tested without running the search
 * and so the caller keeps every generation parameter.
 */

/** What the caller's generator hands back for one section. */
export type RenderedSection = {
  voices: VoiceNote[][];
  abc: string;
  /** Re-writes this section with different annotations. */
  render: (display: FullLengthDisplay) => string;
  /** This section's chords, so the finished piece can list its own. */
  chords?: Chord[];
  /**
   * What `render` is made from, as plain data. Carried untouched so a piece
   * built in a worker can have its sections re-rendered on the page - see
   * choral-jobs.ts.
   */
  renderInput?: unknown;
};

/** What travels on a section's `meta` - see sectional-form.ts. */
export type SectionMeta = {
  render: (display: FullLengthDisplay) => string;
  chords: Chord[];
  renderInput?: unknown;
};

export type FullLengthDisplay = {
  chordSymbols?: boolean;
  lyrics?: "movable" | "fixed" | "names" | null;
  midiProgram?: number;
};

export type FullLengthOptions = {
  plan: FormPlan;
  maxSkip: number;
  /** Tries per section before its seam is accepted as it is. */
  seamAttempts?: number;
};

export type FullLengthPiece = {
  plan: FormPlan;
  sections: SectionResult[];
  voices: VoiceNote[][];
  /** The whole piece as one ABC document. */
  abc: string;
  /** Re-write the whole piece with different annotations. */
  render: (display: FullLengthDisplay) => string;
  /** Every section's chords, end to end. */
  chordProgression: Chord[];
  /** Seams that could not be made to fit, for reporting rather than throwing. */
  roughSeams: { after: string; reason: string }[];
};

/**
 * Build the piece the plan describes.
 *
 * `generate` is handed the planned section - its length, texture and key area -
 * and returns that section's music. It is called once per attempt, so a seam
 * that does not fit costs another call rather than the whole piece.
 */
export function buildFullLengthPiece(
  generate: (section: PlannedSection, attempt: number) => RenderedSection,
  opts: FullLengthOptions
): FullLengthPiece {
  const { plan, maxSkip, seamAttempts = 4 } = opts;

  const specs = plan.sections.map((s) => ({
    label: s.label,
    measures: s.measures,
    ...(s.restates ? { restates: s.restates } : {}),
  }));
  const byLabel = new Map(plan.sections.map((s) => [s.label, s]));

  const built = buildSectionalExercise(
    (spec, attempt) => {
      const planned = byLabel.get(spec.label);
      if (!planned) throw new Error(`No plan for section "${spec.label}".`);
      const made = generate(planned, attempt);
      const meta: SectionMeta = {
        render: made.render,
        chords: made.chords ?? [],
        renderInput: made.renderInput,
      };
      return { voices: made.voices, abc: made.abc, meta };
    },
    { sections: specs, maxSkip, seamAttempts }
  );

  const render = (display: FullLengthDisplay) =>
    joinRendered(built.sections, display) ?? "";

  return {
    plan,
    sections: built.sections,
    voices: built.voices,
    abc: joinRendered(built.sections, {}) ?? "",
    render,
    chordProgression: built.sections.flatMap(
      (s) => (s.meta as SectionMeta | undefined)?.chords ?? []
    ),
    roughSeams: built.roughSeams,
  };
}

/**
 * Re-render every section with the given annotations and join them.
 *
 * A section that never carried a `render` falls back to the ABC it was built
 * with, so a piece is still joinable if a caller did not supply one.
 */
export function joinRendered(
  sections: SectionResult[],
  display: FullLengthDisplay
): string | null {
  const rendered = sections.map((s) => {
    const render = (s.meta as SectionMeta | undefined)?.render;
    return typeof render === "function" ? { ...s, abc: render(display) } : s;
  });
  return joinSectionAbc(rendered);
}
