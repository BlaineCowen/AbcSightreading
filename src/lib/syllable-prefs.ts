import { get, writable } from "svelte/store";
import { signedInUser } from "./auth-client";
import type { CustomSyllables } from "../resources/rhythm-syllables";

/**
 * The teacher's own rhythm syllables, from their account. Signed out there are
 * none, and the pages offer only the built-in systems.
 */
export const mySyllables = writable<CustomSyllables | null>(null);
/** Whether someone is signed in, so the page can offer to set a set up. */
export const syllablesAvailable = writable(false);

let loading: Promise<void> | null = null;

/**
 * Loads the set once; `fresh` asks the server again (a page coming back into
 * view, since the set may have been changed on /account in another tab).
 */
export function loadMySyllables(fresh = false): Promise<void> {
  if (fresh) loading = null;
  loading ??= (async () => {
    if (!(await signedInUser())) return;
    const res = await fetch("/api/preferences");
    if (!res.ok) throw new Error(`The server said ${res.status}.`);
    const body = await res.json();
    const next = body.rhythmSyllables ?? null;
    // The same set again keeps the store as it is, so nothing redraws.
    if (JSON.stringify(next) !== JSON.stringify(get(mySyllables))) mySyllables.set(next);
    syllablesAvailable.set(true);
  })().catch((e) => {
    loading = null;
    throw e;
  });
  return loading;
}

/** Saves (or, with null, clears) the set. Answers with what was saved. */
export async function saveMySyllables(value: CustomSyllables | null): Promise<CustomSyllables | null> {
  const res = await fetch("/api/preferences", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rhythmSyllables: value }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error ?? `The server said ${res.status}.`);
  mySyllables.set(body.rhythmSyllables ?? null);
  return body.rhythmSyllables ?? null;
}
