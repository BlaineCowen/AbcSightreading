import { get } from "svelte/store";
import { exercise, practice } from "./context";
import { tuner } from "../tuner/store";
import { METERS } from "../tuner/meters";

/**
 * One metronome on a practice page.
 *
 * The Tools metronome and the click under an exercise used to be two things:
 * start the one, press Play, and two clicks sounded, often at two tempos. Now
 * the tuner store is the metronome for both - its on/off, its level, its
 * subdivision, accent and sound - and on a practice page its tempo and meter
 * ARE the exercise's:
 *
 * - The page's tempo and the exercise's meter are pushed into the store, card
 *   open or not.
 * - A tempo set on the metronome (the card's nudge or tap) goes back to the
 *   page, through the setter the page registers here.
 * - Play takes over a metronome ticking on its own: see `clickThisTime`.
 *
 * Only a change moves anything, in either direction, so the two cannot chase
 * each other; the page's value wins when it registers.
 */

type PageTempo = {
  /** Set the page's tempo, as its own tempo control would. */
  setBpm: (bpm: number) => void;
  min: number;
  max: number;
};

let page: PageTempo | null = null;
let wired = false;

/** Whether this page's metronome is tied to an exercise (false on /tuner). */
export const linkedToPage = () => page !== null;

function init() {
  if (wired || typeof window === "undefined") return;
  wired = true;

  let lastPageBpm: number | null = null;
  let lastMeter: string | null = null;
  const fromPage = () => {
    if (!page) return;
    const { bpm } = get(practice);
    if (bpm !== lastPageBpm) {
      lastPageBpm = bpm;
      if (get(tuner).bpm !== bpm) tuner.setBpm(bpm);
    }
    const meter = get(exercise)?.meter ?? null;
    if (meter !== lastMeter) {
      lastMeter = meter;
      if (meter && meter !== get(tuner).meter && METERS.some((m) => m.id === meter)) tuner.setMeter(meter);
    }
  };
  practice.subscribe(fromPage);
  exercise.subscribe(fromPage);

  let lastTunerBpm = get(tuner).bpm;
  tuner.subscribe((t) => {
    if (t.bpm === lastTunerBpm) return;
    lastTunerBpm = t.bpm;
    if (!page || t.bpm === get(practice).bpm) return;
    const clamped = Math.min(page.max, Math.max(page.min, t.bpm));
    page.setBpm(clamped);
    if (clamped !== t.bpm) tuner.setBpm(clamped);
  });
}

/**
 * A practice page ties the metronome to its exercise. Returns the undo, for
 * onDestroy.
 */
export function linkPageTempo(link: PageTempo): () => void {
  init();
  page = link;
  // The page's tempo wins on arrival, whatever the metronome was left at.
  const { bpm } = get(practice);
  if (get(tuner).bpm !== bpm) tuner.setBpm(bpm);
  return () => {
    if (page === link) page = null;
  };
}

/**
 * Whether this playback of the exercise clicks.
 *
 * A drill pass that says On or Off decides. Otherwise it clicks when the click
 * is set to play with the music - or when the metronome was ticking on its own
 * as Play was pressed: that is someone who wants a click, and it carries on as
 * the exercise's, from beat 1 of the count-in.
 */
export function clickThisTime(o: { withMusic: boolean; wasRunning: boolean; passOverride?: boolean | null }): boolean {
  if (o.passOverride === true || o.passOverride === false) return o.passOverride;
  return o.withMusic || o.wasRunning;
}

/**
 * A practice page's playback starts (true) or ends - stop, pause, the last
 * note (false). Starting takes over a metronome ticking on its own, so it
 * carries on as the exercise's click from beat 1 of the count-in, and settles
 * whether this playback clicks. Returns that.
 */
export function exercisePlays(playing: boolean): boolean {
  const t = get(tuner);
  if (!playing) {
    if (t.exercisePlaying || t.musicClick) tuner.setPlayback(false, false);
    return false;
  }
  const wasRunning = t.metronomeRunning;
  if (wasRunning) tuner.setMetronomeRunning(false);
  const click = clickThisTime({ withMusic: t.clickWithMusic, wasRunning });
  tuner.setPlayback(true, click);
  return click;
}

/** Whether the metronome is heard: on its own, or under the exercise. */
export const metronomeSounding = (t: { metronomeRunning: boolean; exercisePlaying: boolean; musicClick: boolean }) =>
  t.metronomeRunning || (t.exercisePlaying && t.musicClick);

/**
 * The one Start/Stop, for the Tools card and the transport's Click. With no
 * exercise playing it starts or stops the metronome on its own. During
 * playback it turns the exercise's click on or off - and makes that the
 * setting, so the next Play keeps it.
 */
export function toggleMetronome() {
  const t = get(tuner);
  if (t.exercisePlaying) {
    const on = !t.musicClick;
    tuner.setClickWithMusic(on);
    tuner.setPlayback(true, on);
  } else {
    tuner.setMetronomeRunning(!t.metronomeRunning);
  }
}

/** The transport's metronome icon: the click with the music, now and from now on. */
export function setClickWithMusic(on: boolean) {
  tuner.setClickWithMusic(on);
  const t = get(tuner);
  if (t.exercisePlaying) tuner.setPlayback(true, on);
}
