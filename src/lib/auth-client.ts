import { createAuthClient } from "better-auth/svelte";

/**
 * The browser's side of accounts. Same origin as the pages, so no base URL.
 * `authClient.useSession()` is a store: `$session.data?.user` in a component.
 */
export const authClient = createAuthClient();

/**
 * Who is signed in, asked once per page load and shared by everything on the
 * page that needs it (the navbar and the preset list both do). Null when
 * nobody is, or when the server cannot be reached - either way the page
 * carries on with browser-only presets.
 */
let current: Promise<{ id: string; email: string } | null> | null = null;
export function signedInUser() {
  current ??= authClient
    .getSession()
    .then(({ data }) => (data?.user ? { id: data.user.id, email: data.user.email } : null))
    .catch(() => null);
  return current;
}
