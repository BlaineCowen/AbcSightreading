import { billingStatus } from "./billing-client";

/**
 * Features only the site owner sees, for trying them on the real site before
 * anyone else. The owner is an email in ADMIN_EMAILS / ADMIN_EMAIL (the same
 * account /admin opens for); the server says so in /api/billing (`owner`).
 *
 * Add a name here, then in a component:
 *
 *   let showGame = false;
 *   onMount(async () => (showGame = await ownerSees("new-game")));
 *
 * This only hides UI. Anything the feature does on the server must check
 * isAdmin(user) itself (src/lib/server/admin.ts), as the /admin endpoints do.
 *
 * Add ?everyone to a page's address to see it as everyone else does.
 * When a feature is ready for everyone, delete its name and its checks.
 */
export const OWNER_FLAGS = [] as const satisfies readonly string[];

export type OwnerFlag = (typeof OWNER_FLAGS)[number] | (string & {});

export async function ownerSees(_flag: OwnerFlag): Promise<boolean> {
  if (typeof location !== "undefined" && new URLSearchParams(location.search).has("everyone")) return false;
  return !!(await billingStatus())?.owner;
}
