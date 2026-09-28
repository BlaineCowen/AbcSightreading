import { writable } from "svelte/store";
import { signedInUser } from "./auth-client";
import { noteExercise } from "./practice-tracker";
import { anonymousUsage, generationAllowance, recordAnonymousGeneration, type Tier } from "./plan";

/**
 * The page's side of the monthly exercise allowance (rules in plan.ts).
 * Signed out, it counts in this browser; signed in, the server counts. Either
 * way a failure to count lets the exercise through - a network blip should
 * never stand between a choir and its next exercise.
 */

export type UsageState = { tier: Tier; limit: number | null; remaining: number | null; blocked: boolean };

export const usage = writable<UsageState | null>(null);

const browserStorage = () => (typeof localStorage === "undefined" ? null : localStorage);

/** Asks before generating: true to go ahead (and that one is counted), false when the month is used up. */
export async function claimGeneration(): Promise<boolean> {
  const user = await signedInUser();
  if (!user) {
    const storage = browserStorage();
    if (!storage) return true;
    const before = generationAllowance("anonymous", anonymousUsage(storage));
    if (!before.allowed) {
      usage.set({ tier: "anonymous", limit: before.limit, remaining: 0, blocked: true });
      return false;
    }
    const after = generationAllowance("anonymous", recordAnonymousGeneration(storage));
    usage.set({ tier: "anonymous", limit: after.limit, remaining: after.remaining, blocked: false });
    return true;
  }
  try {
    const res = await fetch("/api/usage", { method: "POST" });
    if (!res.ok) return true;
    const body = await res.json();
    usage.set({ tier: body.plan, limit: body.limit, remaining: body.remaining, blocked: !body.granted });
    if (body.granted) noteExercise();
    return !!body.granted;
  } catch {
    noteExercise();
    return true;
  }
}

/** Clears the "used up" notice, as when the reader closes it. */
export const dismissLimit = () => usage.update((u) => (u ? { ...u, blocked: false } : u));

/**
 * Loads the month's count when a page opens, so it shows before the first
 * exercise: from this browser signed out, from the server signed in. Quiet on
 * failure - the count then appears after the next Generate.
 */
export async function loadUsage() {
  const user = await signedInUser();
  if (!user) {
    const storage = browserStorage();
    if (!storage) return;
    const a = generationAllowance("anonymous", anonymousUsage(storage));
    usage.set({ tier: "anonymous", limit: a.limit, remaining: a.remaining, blocked: false });
    return;
  }
  try {
    const res = await fetch("/api/usage");
    if (!res.ok) return;
    const body = await res.json();
    usage.set({ tier: body.plan, limit: body.limit, remaining: body.remaining, blocked: false });
  } catch {}
}
