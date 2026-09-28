import type { APIRoute } from "astro";
import { currentUser, json } from "../../../lib/server/api";
import { myAssignments } from "../../../lib/server/practice";

/** GET -> { enrolled, assignments } for the signed-in student, across their classes. */
export const GET: APIRoute = async ({ request }) => {
  const user = await currentUser(request);
  if (!user) return json({ error: "Sign in first." }, 401);
  return json(await myAssignments(user.id));
};
