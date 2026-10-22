import { compilePolyPitch, instantiatePolyPitch, type PolyPitch, type PolyNote } from "./polypitch";
import { measureWindow, windowJob, type MeasuredWindowNote, type WindowJob } from "./measure";
import { combineReadings, planWindows, roughCents, type EnsembleKind, type MeasuredNote } from "./tuning";

/**
 * A take listened to: every note in it (Basic Pitch, the choir-trained model
 * for voices), then each note pulled out of the mix and its pitch measured
 * from its own curve, since Basic Pitch alone reads pitch only to about a
 * third of a semitone and most out-of-tune notes would pass as in tune
 * (OmniPitch's index.html, `fetchCurve`).
 *
 * Transcription runs on the page: in a worker, Chrome on Apple Silicon ran it
 * about five times slower (OmniPitch README). Separation runs on a pool of
 * workers, a window each, as OmniPitch's engine does; without workers, on
 * the page too.
 */

export interface Take {
  samples: Float32Array;
  sampleRate: number;
}

export interface Analysis {
  notes: MeasuredNote[];
  /** Each note alone (index into `notes`): its first sample's seconds in the take and its sound. */
  solos: Map<number, { from: number; signal: Float32Array }>;
}

export type Progress =
  | { stage: "loading" }
  | { stage: "notes" }
  | { stage: "measuring"; done: number; total: number };

/** The longest take listened to, in seconds: past it, the take is cut (a three-minute piece, at most). */
export const MAX_SECONDS = 180;

let pagePP: Promise<PolyPitch> | null = null;
/** The detector on the page, made once; `warm` also builds the model, which takes a second or more. */
export function loadDetector(warm = false): Promise<PolyPitch> {
  pagePP ??= compilePolyPitch().then(instantiatePolyPitch).then((pp) => {
    if (warm) {
      pp.basicPitchNotes(new Float32Array(22050), 22050, false);
      pp.basicPitchNotes(new Float32Array(22050), 22050, true);
    }
    return pp;
  });
  pagePP.catch(() => (pagePP = null));
  return pagePP;
}

/** Decoded audio as one channel (the mean of its channels), at most MAX_SECONDS. */
export function toMono(buffer: AudioBuffer): Take {
  const len = Math.min(buffer.length, Math.floor(MAX_SECONDS * buffer.sampleRate));
  const mono = new Float32Array(len);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const ch = buffer.getChannelData(c);
    for (let i = 0; i < len; i++) mono[i] += ch[i] / buffer.numberOfChannels;
  }
  return { samples: mono, sampleRate: buffer.sampleRate };
}

/** Lets the page paint (a progress line) before a long synchronous step. */
const paint = () => new Promise<void>((ok) => requestAnimationFrame(() => setTimeout(ok, 0)));

export async function analyseTake(
  take: Take,
  kind: EnsembleKind,
  onProgress: (p: Progress) => void,
  cancelled: () => boolean = () => false
): Promise<Analysis | null> {
  onProgress({ stage: "loading" });
  const pp = await loadDetector();
  if (cancelled()) return null;
  onProgress({ stage: "notes" });
  await paint();
  const found: PolyNote[] = pp.basicPitchNotes(take.samples, take.sampleRate, kind === "voices");
  if (cancelled()) return null;

  const notes: MeasuredNote[] = found.map((n) => ({
    start: n.start,
    end: n.end,
    midi: n.midi,
    velocity: n.velocity,
    a440Cents: roughCents(n.cents, n.amp),
    measured: false,
    sure: true,
  }));
  const solos = new Map<number, { from: number; signal: Float32Array }>();
  const windows = planWindows(notes);
  let done = 0;
  onProgress({ stage: "measuring", done, total: notes.length });

  const take_ = (r: MeasuredWindowNote) => {
    const n = notes[r.j];
    const read = combineReadings(r.held, r.harmonic);
    if (read) {
      n.a440Cents = read.cents;
      n.sure = read.sure;
      n.measured = true;
    }
    if (r.curve) n.curve = r.curve;
    solos.set(r.j, { from: r.from, signal: r.signal });
  };
  const jobFor = (w: (typeof windows)[number]) => windowJob(take.samples, take.sampleRate, notes, w);

  const pool = await workerPool(await compilePolyPitch());
  try {
    const queue = windows.slice();
    const lane = async (run: (job: WindowJob) => Promise<MeasuredWindowNote[]>) => {
      while (queue.length && !cancelled()) {
        const w = queue.shift()!;
        try {
          (await run(jobFor(w))).forEach(take_);
        } catch (err) {
          console.warn("[ensemble] a window was not measured", err);
        }
        done += w.members.length;
        onProgress({ stage: "measuring", done: Math.min(done, notes.length), total: notes.length });
      }
    };
    if (pool.length) await Promise.all(pool.flatMap((wk) => [lane(wk.run), lane(wk.run)]));
    else await lane(async (job) => {
      await paint();
      return measureWindow(pp, job);
    });
  } finally {
    pool.forEach((wk) => wk.close());
  }
  if (cancelled()) return null;
  return { notes, solos };
}

type PoolWorker = { run: (job: WindowJob) => Promise<MeasuredWindowNote[]>; close: () => void };

/** Up to four separation workers (one per spare core), each with its own copy of the module; none if they fail to start. */
async function workerPool(module: WebAssembly.Module): Promise<PoolWorker[]> {
  if (typeof Worker === "undefined") return [];
  const count = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1));
  const started = await Promise.all(
    Array.from({ length: count }, () =>
      new Promise<PoolWorker | null>((ok) => {
        let worker: Worker;
        try {
          worker = new Worker(new URL("./separate.worker.ts", import.meta.url), { type: "module" });
        } catch {
          return ok(null);
        }
        const waiting = new Map<number, { ok: (v: MeasuredWindowNote[]) => void; fail: (e: Error) => void }>();
        let next = 0;
        const timer = setTimeout(() => (worker.terminate(), ok(null)), 20000);
        worker.onerror = () => {
          clearTimeout(timer);
          waiting.forEach((w) => w.fail(new Error("worker failed")));
          ok(null);
        };
        worker.onmessage = (e) => {
          const m = e.data;
          if (m.kind === "ready") {
            clearTimeout(timer);
            ok({
              run: (job) =>
                new Promise((res, rej) => {
                  const id = next++;
                  waiting.set(id, { ok: res, fail: rej });
                  worker.postMessage({ kind: "window", id, job }, [job.segment.buffer]);
                }),
              close: () => worker.terminate(),
            });
          } else if (m.kind === "error") {
            clearTimeout(timer);
            worker.terminate();
            ok(null);
          } else if (m.kind === "done" || m.kind === "failed") {
            const w = waiting.get(m.id);
            waiting.delete(m.id);
            if (m.kind === "done") w?.ok(m.out);
            else w?.fail(new Error(m.message));
          }
        };
        worker.postMessage({ kind: "init", module });
      })
    )
  );
  return started.filter((w): w is PoolWorker => w !== null);
}
