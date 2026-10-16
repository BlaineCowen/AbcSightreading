import type { APIRoute } from "astro";
import { currentUser, json, readJson } from "../../../lib/server/api";
import { isAdmin } from "../../../lib/server/admin";
import { decideApplication, FounderError, listApplications } from "../../../lib/server/founders";

/** Founding-teacher applications, for the owner. GET -> list; POST { id, approve } -> decided (approving joins them). */
export const GET: APIRoute = async ({ request }) => {
  if (!isAdmin(await currentUser(request))) return json({ error: "Not found." }, 404);
  return json(await listApplications());
};

export const POST: APIRoute = async ({ request }) => {
  if (!isAdmin(await currentUser(request))) return json({ error: "Not found." }, 404);
  const body = (await readJson(request).catch(() => null)) as { id?: unknown; approve?: unknown } | null;
  if (typeof body?.id !== "string" || typeof body.approve !== "boolean") return json({ error: "Send { id, approve }." }, 400);
  try {
    return json(await decideApplication(body.id, body.approve));
  } catch (e) {
    if (e instanceof FounderError) return json({ error: e.message }, e.status);
    throw e;
  }
};
