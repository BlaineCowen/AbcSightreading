import type { APIRoute } from "astro";
import { currentUser, json } from "../../../lib/server/api";
import { teacherAssignments } from "../../../lib/server/practice";

/** GET -> { classes, assignments } for the signed-in teacher, every class (the account page's Assignments tab). */
export const GET: APIRoute = async ({ request }) => {
  const user = await currentUser(request);
  if (!user) return json({ error: "Sign in first." }, 401);
  return json(await teacherAssignments(user.id));
};
