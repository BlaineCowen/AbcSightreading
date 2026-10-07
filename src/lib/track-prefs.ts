import { writable } from "svelte/store";
import { signedInUser } from "./auth-client";

/**
 * The teacher's curriculum tracks (src/lib/curriculum) and their own versions
 * of steps, from their account (/api/tracks). Signed out there are none.
 */
export interface TrackPrefs {
  signedIn: boolean;
  tracks: string[];
  overrides: Record<string, Record<string, unknown>>;
  canSubscribe: boolean;
}

export const trackPrefs = writable<TrackPrefs>({ signedIn: false, tracks: [], overrides: {}, canSubscribe: false });

let loading: Promise<void> | null = null;

export function loadTrackPrefs(): Promise<void> {
  loading ??= (async () => {
    if (!(await signedInUser())) return;
    const res = await fetch("/api/tracks");
    if (!res.ok) throw new Error(`The server said ${res.status}.`);
    trackPrefs.set({ signedIn: true, ...(await res.json()) });
  })().catch((e) => {
    loading = null;
    throw e;
  });
  return loading;
}

async function put(body: Record<string, unknown>) {
  const res = await fetch("/api/tracks", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out?.error ?? `The server said ${res.status}.`);
  trackPrefs.set({ signedIn: true, ...out });
}

export const setSubscribed = (track: string, subscribed: boolean) => put({ track, subscribed });
/** Keep the teacher's own version of a step (options), or drop it (null). */
export const saveStepVersion = (key: string, options: Record<string, unknown> | null) => put({ key, options });
