/**
 * The first visit: a welcome card offering Quick start (step 1 of
 * abcStepByStep) or a walkthrough, and the walkthrough itself - a few
 * bubbles, each pointing at one control (`[data-tour="<id>"]` on the page).
 * Skippable, remembered in this browser, and brought back by the "?" button,
 * the navbar's Take the tour, or `?tour=1`. Drawn by TourLayer.svelte.
 */

export type TourPage = "unison" | "choral" | "piano";

export interface TourStep {
  /** The `data-tour` value of the control it points at. A step whose control is missing or hidden is left out. */
  anchor: string;
  title: string;
  body: string;
}

export const TOUR_STEPS: Record<TourPage, TourStep[]> = {
  unison: [
    { anchor: "preset", title: "Start from a preset", body: "Ready-made levels live here. New to sight reading? abcStepByStep takes you from rhythm alone to singing in parts, one new thing at a time." },
    { anchor: "reader", title: "Who is reading", body: "Voice or instrument. It sets the clef, the range and the sound." },
    { anchor: "settings", title: "Your settings", body: "Each pill shows what is chosen. Tap one to change the key, meter, length, notes or rhythms." },
    { anchor: "new", title: "New exercise", body: "Writes a fresh exercise from your settings. Every one is new." },
    { anchor: "play", title: "Play it", body: "Hear the exercise with a count-in. Tempo, Loop and the metronome are on this bar too." },
    { anchor: "display", title: "What the score shows", body: "Solfège, note names, rhythm syllables, the cursor and the sound." },
    { anchor: "grade", title: "Listen and grade", body: "Sing it (or clap a rhythm) into the microphone and see each note marked on the music." },
    { anchor: "tools", title: "Practice tools", body: "Tuner, metronome, drone, starting pitches and a timer, without leaving the page." },
  ],
  choral: [
    { anchor: "preset", title: "Start from a preset", body: "UIL's five levels are always here, with abcStepByStep and any courses you choose." },
    { anchor: "voicing", title: "Your choir", body: "SATB, SAB, SSA, two parts and more. Pick the voicing your choir sings." },
    { anchor: "settings", title: "Your settings", body: "Key, meter, length, rhythms and chords. Tap a pill to change it." },
    { anchor: "new", title: "New exercise", body: "Writes fresh parts from your settings." },
    { anchor: "play", title: "Play it", body: "Hear every part, or mute and hide parts to practise one line against the others." },
    { anchor: "display", title: "What the score shows", body: "Solfège, chord symbols, the cursor and the sound." },
    { anchor: "tools", title: "Practice tools", body: "Tuner, metronome, drone, starting pitches and a timer." },
  ],
  piano: [
    { anchor: "pill-level", title: "Pick a level", body: "Ten levels, one new thing each: from hands taking turns in C position to Alberti bass." },
    { anchor: "pill-hands", title: "Hands", body: "Both hands together, or one at a time, and the left hand's accompaniment." },
    { anchor: "new", title: "New exercise", body: "Writes a fresh exercise at your level." },
    { anchor: "play", title: "Play it", body: "Hear both hands. Tempo and Loop are on this bar." },
    { anchor: "grade", title: "Play and grade", body: "Plug in a MIDI keyboard and get every note marked." },
  ],
};

/** The page a path is, or null where there is no tour. */
export function tourPageFor(pathname: string): TourPage | null {
  const p = pathname.replace(/\/+$/, "");
  if (p === "/sightreading") return "unison";
  if (p === "/choral-sightreading") return "choral";
  if (p === "/piano-sightreading") return "piano";
  return null;
}

/** Remembered in this browser: the tour seen (finished or skipped) on a page, and the welcome card answered. */
export const tourKey = (page: TourPage) => `abc-tour-${page}-v1`;
export const WELCOME_KEY = "abc-welcome-v1";

type Store = Pick<Storage, "getItem" | "setItem">;

const read = (store: Store | null, key: string) => {
  try {
    return store?.getItem(key) ?? null;
  } catch {
    return null;
  }
};

export function tourSeen(page: TourPage, store: Store | null): boolean {
  return read(store, tourKey(page)) === "done";
}

export function markTourSeen(page: TourPage, store: Store | null) {
  try {
    store?.setItem(tourKey(page), "done");
  } catch {}
}

export function markWelcomed(store: Store | null) {
  try {
    store?.setItem(WELCOME_KEY, "done");
  } catch {}
}

/**
 * Whether a visit should be greeted: a practice page opened with nothing in
 * the address (a step, a preset, an assignment, a shared exercise all mean
 * the visitor knows where they are going), by someone not yet greeted,
 * who has not toured this page, and is not a student (a teacher's
 * assignment is their start).
 */
export function shouldWelcome(opts: { page: TourPage | null; search: string; hash: string; student: boolean; store: Store | null }): boolean {
  if (!opts.page || opts.student) return false;
  if (opts.search.replace(/^\?/, "") !== "" || opts.hash.replace(/^#/, "") !== "") return false;
  if (read(opts.store, WELCOME_KEY) === "done") return false;
  return !tourSeen(opts.page, opts.store);
}

/** Starts the walkthrough on this page (the "?" button, the navbar). */
export function startTour() {
  window.dispatchEvent(new CustomEvent("sr-start-tour"));
}

/**
 * Quick start: step 1 of abcStepByStep (ladder.ts `stepHref(ladder[0])`,
 * held equal by a test), written at once: `start=1` asks the Unison page to
 * write it as it opens. Written out so this, loaded on every page, does not
 * pull in the ladder.
 */
export const FIRST_STEP_HREF = "/sightreading?step=sbs-01-rhythm&start=1";

/** Whether this visit came from Quick start (read from the address as it arrived). */
export const isQuickStart = (search: string) => new URLSearchParams(search).get("start") === "1";

/**
 * The address as the visitor arrived, before a page rewrote it with its
 * settings: kept by an inline script in Layout.astro.
 */
export function arrival(): { search: string; hash: string } {
  const a = (window as unknown as { __srArrival?: { search: string; hash: string } }).__srArrival;
  return a ?? { search: location.search, hash: location.hash };
}
