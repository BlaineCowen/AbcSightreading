import {
  generateChoralExercise,
  renderChoral,
  type ChoralRenderInput,
  type GenerateChoralParams,
} from "./generateChoral";
import { buildFullLengthPiece, joinRendered, type FullLengthDisplay, type SectionMeta } from "./full-length";
import type { FormPlan } from "./form-plan";
import type { SectionResult } from "./sectional-form";
import type { Chord } from "./types";

/**
 * Choral generation as a job that can run off the page's thread.
 *
 * A hard exercise is a long search - 16 bars at UIL 5 in four parts took up to
 * 2 seconds on a desktop, and over 3 when it failed and used up its retries.
 * Run on the page, that is the page frozen: the spinner stops, taps do nothing,
 * and on a phone, several times slower, nothing says what is happening. The
 * generator also narrates itself - some 4.5 million console calls for one such
 * exercise - which a browser pays for while it keeps them.
 *
 * So the work goes to a worker (choral.worker.ts), and what comes back is plain
 * data: a closure cannot cross threads. `rendererFor` rebuilds the `render`
 * the page keeps for re-annotating the exercise on screen.
 */

export type ChoralJob =
  | { kind: "exercise"; params: GenerateChoralParams }
  | { kind: "piece"; params: GenerateChoralParams; plan: FormPlan; maxSkip: number };

/** What a job hands back: plain data only. */
export type ChoralJobResult = {
  abc: string;
  chordProgression: Chord[];
  /** Sections whose seam never came good. Always empty for one exercise. */
  roughSeams: string[];
  /** A single exercise's render input. */
  exercise?: ChoralRenderInput;
  /** A piece's sections, each carrying its own render input on `meta`. */
  sections?: SectionResult[];
};

/** Run a job where it stands. The worker calls this; so does the fallback. */
export function runChoralJob(job: ChoralJob): ChoralJobResult {
  if (job.kind === "exercise") {
    const out = generateChoralExercise(job.params);
    return {
      abc: out.abcString,
      chordProgression: out.chordProgression,
      roughSeams: [],
      exercise: out.renderInput,
    };
  }

  // A whole example: one generation per section, joined with the seams vetted.
  // Each section is generated with its own length and texture - the plan's,
  // not the page's - so the imitative passage gets staggered entrances
  // whatever the texture control says.
  const piece = buildFullLengthPiece(
    (section) => {
      const out = generateChoralExercise({
        ...job.params,
        measures: section.measures,
        voiceTexture: section.texture,
      });
      return {
        voices: out.voiceNotes,
        abc: out.abcString,
        render: out.render,
        chords: out.chordProgression,
        renderInput: out.renderInput,
      };
    },
    { plan: job.plan, maxSkip: job.maxSkip }
  );
  if (!piece.abc) throw new Error("The sections could not be joined into one score.");
  return {
    // With the annotations asked for, not the defaults - generating with
    // solfege already showing should not hand back a bare score.
    abc: piece.render(job.params.display ?? {}),
    chordProgression: piece.chordProgression,
    roughSeams: piece.roughSeams.map((r) => r.after),
    // `render` is the one thing on `meta` that cannot cross; the input it was
    // made from can.
    sections: piece.sections.map((s) => {
      const meta = s.meta as SectionMeta | undefined;
      return { ...s, meta: meta && { chords: meta.chords, renderInput: meta.renderInput } };
    }),
  };
}

/** The `render` for a finished job, rebuilt from its plain data. */
export function rendererFor(
  result: ChoralJobResult
): (display: FullLengthDisplay) => string {
  if (result.exercise) {
    const input = result.exercise;
    return (display) => renderChoral(input, display);
  }
  const sections = (result.sections ?? []).map((s) => {
    const input = (s.meta as { renderInput?: ChoralRenderInput } | undefined)?.renderInput;
    return input
      ? { ...s, meta: { ...(s.meta as object), render: (d: FullLengthDisplay) => renderChoral(input, d) } }
      : s;
  });
  return (display) => joinRendered(sections, display) ?? result.abc;
}

/** Thrown into a job's promise when it is cancelled. */
export class JobCancelled extends Error {
  constructor() {
    super("Cancelled");
    this.name = "JobCancelled";
  }
}

let worker: Worker | null = null;
let nextId = 0;

function getWorker(): Worker | null {
  if (worker) return worker;
  if (typeof Worker === "undefined") return null;
  try {
    worker = new Worker(new URL("./choral.worker.ts", import.meta.url), { type: "module" });
  } catch {
    worker = null;
  }
  return worker;
}

/**
 * Start a job in the worker. `cancel` stops it outright - the worker is
 * terminated, since a search in progress has no way to be interrupted - and a
 * fresh one is made for the next job.
 *
 * Where no worker can be made, the job runs on the page after one frame, so
 * the "writing" state still gets drawn first. That is the old behaviour, kept
 * as a floor.
 */
export function startChoralJob(job: ChoralJob): {
  result: Promise<ChoralJobResult>;
  cancel: () => void;
} {
  const w = getWorker();
  if (!w) {
    let cancelled = false;
    const result = new Promise<ChoralJobResult>((resolve, reject) => {
      setTimeout(() => {
        if (cancelled) return reject(new JobCancelled());
        try {
          resolve(runChoralJob(job));
        } catch (e) {
          reject(e);
        }
      }, 16);
    });
    return { result, cancel: () => (cancelled = true) };
  }

  const id = ++nextId;
  let settle: { resolve: (r: ChoralJobResult) => void; reject: (e: unknown) => void } | null = null;
  const result = new Promise<ChoralJobResult>((resolve, reject) => {
    settle = { resolve, reject };
  });
  const onMessage = (e: MessageEvent) => {
    if (e.data?.id !== id) return;
    w.removeEventListener("message", onMessage);
    w.removeEventListener("error", onError);
    if (e.data.ok) settle?.resolve(e.data.result);
    else settle?.reject(new Error(e.data.error));
  };
  const onError = (e: ErrorEvent) => {
    w.removeEventListener("message", onMessage);
    w.removeEventListener("error", onError);
    // A worker that failed to load is no use for the next job either.
    w.terminate();
    if (worker === w) worker = null;
    settle?.reject(new Error(e.message || "The generator stopped unexpectedly."));
  };
  w.addEventListener("message", onMessage);
  w.addEventListener("error", onError);
  w.postMessage({ id, job });

  return {
    result,
    cancel: () => {
      w.removeEventListener("message", onMessage);
      w.removeEventListener("error", onError);
      w.terminate();
      if (worker === w) worker = null;
      settle?.reject(new JobCancelled());
    },
  };
}
