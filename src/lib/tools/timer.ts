import { get, writable } from "svelte/store";
import { playArpeggio } from "./tone";

/**
 * The practice timer: a countdown that keeps running while its card is
 * closed, and chimes (do-mi-so-do) when time is up. Measured against the
 * clock, not by counting ticks, so a busy or backgrounded tab cannot stretch it.
 */

export const timer = writable({ durationMs: 10 * 60_000, remainingMs: 10 * 60_000, running: false });

let endsAt = 0;
let interval: ReturnType<typeof setInterval> | null = null;

function tick() {
  const left = Math.max(0, endsAt - Date.now());
  timer.update((t) => ({ ...t, remainingMs: left }));
  if (left === 0) {
    stopTicking();
    timer.update((t) => ({ ...t, running: false }));
    playArpeggio([60, 64, 67, 72]);
  }
}
function stopTicking() {
  if (interval) clearInterval(interval);
  interval = null;
}

export function startTimer() {
  const t = get(timer);
  if (t.running) return;
  const from = t.remainingMs > 0 ? t.remainingMs : t.durationMs;
  endsAt = Date.now() + from;
  timer.set({ ...t, remainingMs: from, running: true });
  interval = setInterval(tick, 250);
}

export function pauseTimer() {
  stopTicking();
  tick();
  timer.update((t) => ({ ...t, running: false }));
}

export function setTimerMinutes(minutes: number) {
  stopTicking();
  const ms = minutes * 60_000;
  timer.set({ durationMs: ms, remainingMs: ms, running: false });
}

export const formatClock = (ms: number) => {
  const s = Math.ceil(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};
