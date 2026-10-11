import type { APIRoute } from "astro";
import { currentUser, json, readJson } from "../../../../lib/server/api";
import { accountTypeFor } from "../../../../lib/server/students";
import { ClassroomError } from "../../../../lib/server/classroom";
import { postToClassroom, sendGrades } from "../../../../lib/server/classroom-grades";

/**
 * An assignment in Google Classroom (src/lib/server/classroom-grades.ts).
 *
 * POST { action: "post" }   -> { classroomWorkId }: posted as coursework in the class's Classroom class
 * POST { action: "grades" } -> { sent, ungraded, notLinked }: every grade sent as a draft grade
 * On a missing permission: { error, reconnect: true }, and the page asks Google for it.
 */
export const POST: APIRoute = async ({ request, params, url }) => {
  const user = await currentUser(request);
  if (!user) return json({ error: "Sign in first." }, 401);
  if ((await accountTypeFor(user)) !== "educator") return json({ error: "Google Classroom is part of the educator plan." }, 403);
  const body = (await readJson(request)) as { action?: unknown } | undefined;
  try {
    if (body?.action === "post") return json(await postToClassroom(user.id, params.id!, url.origin, request.headers));
    if (body?.action === "grades") return json(await sendGrades(user.id, params.id!, request.headers));
    return json({ error: "Post it, or send its grades?" }, 400);
  } catch (e) {
    if (e instanceof ClassroomError) return json({ error: e.message, reconnect: e.reconnect }, e.status);
    throw e;
  }
};
