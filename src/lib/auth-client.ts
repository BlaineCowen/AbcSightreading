import { createAuthClient } from "better-auth/svelte";
import { usernameClient, inferAdditionalFields } from "better-auth/client/plugins";

/**
 * The browser's side of accounts. Same origin as the pages, so no base URL.
 * `authClient.useSession()` is a store: `$session.data?.user` in a component.
 */
export const authClient = createAuthClient({
  plugins: [
    usernameClient(),
    inferAdditionalFields({ user: { accountType: { type: "string", input: false } } }),
  ],
});

/**
 * Who is signed in, asked once per page load and shared by everything on the
 * page that needs it (the navbar and the preset list both do). Null when
 * nobody is, or when the server cannot be reached - either way the page
 * carries on with browser-only presets.
 */
export type SignedInUser = { id: string; email: string; accountType: "standard" | "educator" | "student" };
let current: Promise<SignedInUser | null> | null = null;
export function signedInUser() {
  current ??= authClient
    .getSession()
    .then(({ data }) =>
      data?.user
        ? {
            id: data.user.id,
            email: data.user.email,
            accountType: (["educator", "student"].includes(data.user.accountType as string)
              ? data.user.accountType
              : "standard") as SignedInUser["accountType"],
          }
        : null
    )
    .catch(() => null);
  return current;
}
