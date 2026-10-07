import { writable } from "svelte/store";
import { signedInUser } from "./auth-client";
import { DEFAULT_SUBSCRIPTIONS, needsPro, subscriptionsFrom } from "./curriculum/catalogue";

/**
 * What the preset menu offers (src/lib/curriculum/catalogue.ts) and the
 * teacher's own versions of track steps. Signed in, from the account
 * (/api/tracks); signed out, from this browser, built-in sets only. A
 * browser's own choice is carried to the account the first time it signs in,
 * if the account has never chosen.
 */
export interface TrackPrefs {
  ready: boolean;
  signedIn: boolean;
  tracks: string[];
  overrides: Record<string, Record<string, unknown>>;
  canSubscribe: boolean;
}

const LOCAL_KEY = "sr-subscriptions";

function localList(): string[] | null {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? subscriptionsFrom(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}
function saveLocal(list: string[]) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(list));
  } catch {}
}

export const trackPrefs = writable<TrackPrefs>({
  ready: false, signedIn: false, tracks: [...DEFAULT_SUBSCRIPTIONS], overrides: {}, canSubscribe: false,
});

let loading: Promise<void> | null = null;

export function loadTrackPrefs(): Promise<void> {
  loading ??= (async () => {
    const local = localList();
    if (!(await signedInUser())) {
      trackPrefs.set({ ready: true, signedIn: false, tracks: local ?? [...DEFAULT_SUBSCRIPTIONS], overrides: {}, canSubscribe: false });
      return;
    }
    const res = await fetch("/api/tracks");
    if (!res.ok) throw new Error(`The server said ${res.status}.`);
    let body = await res.json();
    if (!body.chosen && local) body = await send({ tracks: local });
    trackPrefs.set({ ready: true, signedIn: true, ...body });
  })().catch((e) => {
    loading = null;
    trackPrefs.update((p) => ({ ...p, ready: true }));
    throw e;
  });
  return loading;
}

async function send(body: Record<string, unknown>) {
  const res = await fetch("/api/tracks", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out?.error ?? `The server said ${res.status}.`);
  return out;
}

async function put(body: Record<string, unknown>) {
  const out = await send(body);
  trackPrefs.set({ ready: true, signedIn: true, ...out });
}

export async function setSubscribed(track: string, subscribed: boolean) {
  let signedIn = false;
  trackPrefs.subscribe((p) => (signedIn = p.signedIn))();
  if (signedIn) return put({ track, subscribed });
  if (subscribed && needsPro(track)) throw new Error("Instrument courses come with Pro.");
  trackPrefs.update((p) => {
    const tracks = subscribed ? [...new Set([...p.tracks, track])] : p.tracks.filter((t) => t !== track);
    saveLocal(tracks);
    return { ...p, tracks };
  });
}

/** Keep the teacher's own version of a step (options), or drop it (null). */
export const saveStepVersion = (key: string, options: Record<string, unknown> | null) => put({ key, options });
