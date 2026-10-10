import type { APIRoute } from "astro";
import { currentUser, json, readJson } from "../../../../lib/server/api";
import { accountTypeFor } from "../../../../lib/server/students";
import { ClassroomError, syncClass } from "../../../../lib/server/classroom";

/**
 * POST { courseId? } -> { added: [names], present, gone: [names], courseName }
 * Brings a Google Classroom class's students into this class (courseId the
 * first time; afterwards the class remembers it and a sync needs none).
 */
export const POST: APIRoute = async ({ request, params }) => {
  const user = await currentUser(request);
  if (!user) return json({ error: "Sign in first." }, 401);
  if ((await accountTypeFor(user)) !== "educator") return json({ error: "Rosters are part of the educator plan." }, 403);
  const body = (await readJson(request)) as { courseId?: unknown } | undefined;
  const courseId = body?.courseId;
  if (courseId !== undefined && (typeof courseId !== "string" || !/^[\w-]{1,40}$/.test(courseId))) return json({ error: "Which Google Classroom class?" }, 400);
  try {
    return json(await syncClass(user.id, params.id!, (courseId as string | undefined) ?? null, request.headers));
  } catch (e) {
    if (e instanceof ClassroomError) return json({ error: e.message, reconnect: e.reconnect }, e.status);
    throw e;
  }
};
