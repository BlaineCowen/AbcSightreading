import type { APIRoute } from "astro";
import { currentUser, json } from "../../../../lib/server/api";
import { roleIn } from "../../../../lib/server/practice";
import { classGameAssignments } from "../../../../lib/server/game-assignments";

/** GET -> { assignments } a class's game assignments with each student's progress. Its teacher only. */
export const GET: APIRoute = async ({ request, params }) => {
  const user = await currentUser(request);
  if (!user) return json({ error: "Sign in first." }, 401);
  if ((await roleIn(user.id, params.id!)) !== "teacher") return json({ error: "No such class." }, 404);
  return json({ assignments: await classGameAssignments(params.id!) });
};
