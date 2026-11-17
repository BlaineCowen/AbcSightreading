import { get, writable } from "svelte/store";
import { BEAT_SECONDS, isActive } from "./practice";
import { tuner } from "./tuner/store";
import { droneOn } from "./tools/state";
import { EXERCISE_MIN_SECONDS } from "./points";

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

/**
 * Points (points.ts): what the exercise on the page is, set by the page as it
 * draws one (setExercise). It is reported once the student has practised
 * EXERCISE_MIN_SECONDS on it, or graded it (noteGrade), and the report goes
 * at once so the points card comes up then. What it earned comes back in
 * `pointsNews` (PointsToast shows it).
 */
export type ExerciseMeta = {
  kind: "step" | "preset" | "own" | "assigned"; key: string; label: string; step: number | null;
  keySig: string | null; minor: boolean; compound: boolean; bass: boolean; contest: boolean;
};
export type PointsNews = {
  earned: { label: string; points: number; note?: string }[]; total: number; today: number; week: number; streak: number;
  badges: { badgeId: string; level: number; name: string; says: string; icon: string; colour: string }[];
};
export const pointsNews = writable<PointsNews | null>(null);
let current: { id: string; meta: ExerciseMeta; active: number; sent: boolean } | null = null;
let pendingPts: { exercises: (ExerciseMeta & { id: string })[]; grades: Record<string, unknown>[] } = { exercises: [], grades: [] };
const newId = () => Math.random().toString(36).slice(2, 12);
const ownMeta = (): ExerciseMeta => ({ kind: "own", key: `own:${options?.page ?? "page"}`, label: "your own settings", step: null, keySig: null, minor: false, compound: false, bass: false, contest: false });

/** Seconds counted on this page so far, for the assignment banner. */
export const sessionSeconds = writable(0);

type Options = { page: "unison" | "choral" | "piece"; assignmentId: string | null; isBusy: () => boolean };

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
    ...(pendingPts.exercises.length || pendingPts.grades.length ? { points: pendingPts } : {}),
  });
}
const hasPending = () => pendingSeconds || pendingExercises || pendingPts.exercises.length || pendingPts.grades.length;
const clearPending = () => {
  pendingSeconds = pendingExercises = 0;
  pendingPts = { exercises: [], grades: [] };
};

async function report() {
  if (stopped || !hasPending()) return;
  const payload = body();
  const pts = pendingPts;
  clearPending();
  sinceBeat = 0;
  try {
    const res = await fetch("/api/practice", { method: "POST", headers: { "Content-Type": "application/json" }, body: payload });
    if (res.status === 401) return stop();
    const r = await res.json();
    if (r && r.logged === false) stop();
    if (r?.points && (r.points.earned?.length || r.points.badges?.length)) pointsNews.set(r.points);
  } catch {
    // Offline for a moment: that half-minute is lost, the rest carries on. Its exercises
    // and grades wait for the next report (the server counts an exercise id once).
    pendingPts = { exercises: [...pts.exercises, ...pendingPts.exercises].slice(-5), grades: [...pts.grades, ...pendingPts.grades].slice(-5) };
  }
}

/** On the way out, the last partial report - sendBeacon survives the page closing. */
function flush() {
  if (stopped || !hasPending()) return;
  navigator.sendBeacon?.("/api/practice", new Blob([body()], { type: "application/json" }));
  clearPending();
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
      // The exercise on the page earns once it has had its practice.
      if (current && !current.sent && ++current.active >= EXERCISE_MIN_SECONDS) {
        sendExercise();
        void report();
        return;
      }
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
  current = { id: newId(), meta: ownMeta(), active: 0, sent: false };
}

/** What the exercise just drawn is (called after noteExercise / countGeneration): its points depend on it. */
export function setExercise(meta: ExerciseMeta) {
  if (current && !current.sent) current.meta = meta;
}

function sendExercise() {
  if (!current || current.sent || !options || stopped) return;
  current.sent = true;
  pendingPts.exercises.push({ id: current.id, ...current.meta });
}

/** The exercise on the page was graded (Pitch & rhythm, or clapped): its points, at once. Not for an assignment's attempts, which the server scores. */
export function noteGrade(g: { score: number; pitch: number | null; rhythm: number | null; clapped: boolean }) {
  if (!current || !options || stopped) return;
  sendExercise();
  const { kind, key, label, step } = current.meta;
  pendingPts.grades.push({ exerciseId: current.id, kind, key, label, step, ...g });
  touch();
  void report();
}
