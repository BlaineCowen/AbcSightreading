import type { APIRoute } from "astro";
import { currentUser, json } from "../../../lib/server/api";
import { accountTypeFor } from "../../../lib/server/students";
import { ClassroomError, listCourses } from "../../../lib/server/classroom";

/** GET -> { courses: [{ id, name, section }] }, or { error, reconnect: true } when Google must be connected (again). */
export const GET: APIRoute = async ({ request }) => {
  const user = await currentUser(request);
  if (!user) return json({ error: "Sign in first." }, 401);
  if ((await accountTypeFor(user)) !== "educator") return json({ error: "Rosters are part of the educator plan." }, 403);
  try {
    return json({ courses: await listCourses(user.id, request.headers) });
  } catch (e) {
    if (e instanceof ClassroomError) return json({ error: e.message, reconnect: e.reconnect }, e.status);
    throw e;
  }
};
