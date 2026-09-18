/// <reference lib="webworker" />
import { runChoralJob, type ChoralJob } from "./choral-jobs";

/**
 * Runs choral generation off the page's thread - see choral-jobs.ts.
 *
 * The generator's logging is switched off here. It narrates every note and
 * every retry, useful when chasing one exercise in a terminal and nothing but
 * cost in a browser: about 4.5 million calls for one hard exercise.
 */
const quiet = () => {};
console.log = quiet;
console.warn = quiet;
console.info = quiet;
console.debug = quiet;

self.onmessage = (e: MessageEvent<{ id: number; job: ChoralJob }>) => {
  const { id, job } = e.data;
  try {
    const result = runChoralJob(job);
    (self as unknown as Worker).postMessage({ id, ok: true, result });
  } catch (err) {
    (self as unknown as Worker).postMessage({
      id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};
