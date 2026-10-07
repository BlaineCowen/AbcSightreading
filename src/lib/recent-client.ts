import { signedInUser } from "./auth-client";
import { sitePath, type NewRecent } from "./recent-exercises";

/**
 * Remember an exercise on the account, for the home page's Recent exercises.
 * Signed-out pages send nothing; a failure is quiet (the exercise on screen
 * matters, the list does not).
 */
export async function rememberExercise(entry: Omit<NewRecent, "link"> & { href: string }): Promise<void> {
  try {
    if (!(await signedInUser())) return;
    await fetch("/api/recent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ page: entry.page, title: entry.title, detail: entry.detail, link: sitePath(entry.href) }),
    });
  } catch {
    // Offline, or the server could not be reached: the list just misses this one.
  }
}
