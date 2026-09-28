import { get, writable } from "svelte/store";
import { BEAT_SECONDS, isActive } from "./practice";
import { tuner } from "./tuner/store";
import { droneOn } from "./tools/state";

/**
 * Measures practice on a page and reports it (rules in practice.ts). Runs only
 * for an account in a class: the first report asks, and a "not logged" answer
 * stops it for the rest of the page.
 *
 * A second counts when the page is visible and the student touched it, or
 * something was sounding - the page's playback, the metronome, the drone or
 * the tuner - within the last five minutes. Every 30 seconds the counted
 * seconds go to the server, which decides the credit; closing the tab sends
 * what is left.
 */

/** Seconds counted on this page so far, for the assignment banner. */
export const sessionSeconds = writable(0);

type Options = { page: "unison" | "choral"; assignmentId: string | null; isBusy: () => boolean };

let options: Options | null = null;
let lastActivity = new Date();
let pendingSeconds = 0;
let pendingExercises = 0;
let sinceBeat = 0;
let stopped = false;
let timer: ReturnType<typeof setInterval> | null = null;

const touch = () => (lastActivity = new Date());

const localDay = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function busy() {
  const t = tuner.get();
  return !!options?.isBusy() || t.metronomeRunning || t.engineStatus === "running" || get(droneOn);
}

function body() {
  return JSON.stringify({
    seconds: pendingSeconds,
    exercises: pendingExercises,
    assignmentId: options?.assignmentId ?? null,
    page: options?.page,
    day: localDay(),
  });
}

async function report() {
  if (stopped || (!pendingSeconds && !pendingExercises)) return;
  const payload = body();
  pendingSeconds = pendingExercises = 0;
  try {
    const res = await fetch("/api/practice", { method: "POST", headers: { "Content-Type": "application/json" }, body: payload });
    if (res.status === 401) return stop();
    const r = await res.json();
    if (r && r.logged === false) stop();
  } catch {
    // Offline for a moment: that half-minute is lost, the rest carries on.
  }
}

/** On the way out, the last partial report - sendBeacon survives the page closing. */
function flush() {
  if (stopped || (!pendingSeconds && !pendingExercises)) return;
  navigator.sendBeacon?.("/api/practice", new Blob([body()], { type: "application/json" }));
  pendingSeconds = pendingExercises = 0;
}

function stop() {
  stopped = true;
  if (timer) clearInterval(timer);
  timer = null;
}

export function startPractice(o: Options) {
  if (typeof window === "undefined" || timer) return;
  options = o;
  for (const ev of ["pointerdown", "keydown", "wheel", "touchstart", "mousemove"]) {
    window.addEventListener(ev, touch, { passive: true });
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
    else touch();
  });
  window.addEventListener("pagehide", flush);
  timer = setInterval(() => {
    const now = new Date();
    if (isActive({ visible: document.visibilityState === "visible", lastActivityAt: lastActivity, busy: busy(), now })) {
      pendingSeconds++;
      sessionSeconds.update((s) => s + 1);
    }
    if (++sinceBeat >= BEAT_SECONDS) {
      sinceBeat = 0;
      report();
    }
  }, 1000);
}

/** A new exercise was generated: activity, and a count the teacher sees. */
export function noteExercise() {
  touch();
  if (options && !stopped) pendingExercises++;
}
