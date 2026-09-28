import type { APIRoute } from "astro";
import { currentUser, json, readJson } from "../../../../lib/server/api";
import { checkRosterRequest } from "../../../../lib/educator-policy";
import { accountTypeFor, addRoster } from "../../../../lib/server/students";

/**
 * POST { students: [{ first, last, username?, password? }] } -> the accounts
 * made, with their passwords - shown once, for the printed cards.
 */
export const POST: APIRoute = async ({ request, params }) => {
  const user = await currentUser(request);
  if (!user) return json({ error: "Sign in first." }, 401);
  if ((await accountTypeFor(user)) !== "educator") return json({ error: "Rosters are part of the educator plan." }, 403);
  const checked = checkRosterRequest(await readJson(request));
  if (!checked.ok) return json({ error: checked.error }, 400);
  const result = await addRoster(user.id, params.id!, checked.value);
  if ("error" in result) return json({ error: result.error }, result.status);
  return json(result, 201);
};
