import type { APIRoute } from "astro";
import { currentUser, json, readJson } from "../../../../lib/server/api";
import { accountTypeFor } from "../../../../lib/server/students";
import { isAdmin } from "../../../../lib/server/admin";
import { checkOneRosterClass } from "../../../../lib/oneroster";
import { OneRosterError, syncOneRosterClass } from "../../../../lib/server/oneroster";

/**
 * POST { key, title, school?, students: [{ key, first, last }] }
 *   -> { className, joinCode, created: [{ name, username, password }], enrolled, present, gone }
 *
 * One class of a OneRoster file into this class (the browser reads the file;
 * src/lib/oneroster.ts). Owner only while it is tested (owner-flags.ts
 * "oneroster"): lift the isAdmin check when it ships.
 */
export const POST: APIRoute = async ({ request, params }) => {
  const user = await currentUser(request);
  if (!user) return json({ error: "Sign in first." }, 401);
  if (!isAdmin(user)) return json({ error: "Not found." }, 404);
  if ((await accountTypeFor(user)) !== "educator") return json({ error: "Rosters are part of the educator plan." }, 403);
  const checked = checkOneRosterClass(await readJson(request));
  if (!checked.ok) return json({ error: checked.error }, 400);
  try {
    return json(await syncOneRosterClass(user.id, params.id!, checked.value));
  } catch (e) {
    if (e instanceof OneRosterError) return json({ error: e.message }, e.status);
    throw e;
  }
};
