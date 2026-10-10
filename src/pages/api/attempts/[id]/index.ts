import type { APIRoute } from "astro";
import { currentUser, json } from "../../../../lib/server/api";
import { attemptFor, summaryOf } from "../../../../lib/server/attempts";

/** One attempt with its marks: the student's own, or one in the teacher's class. */
export const GET: APIRoute = async ({ request, params }) => {
  const user = await currentUser(request);
  if (!user) return json({ error: "Sign in first." }, 401);
  const at = await attemptFor(user.id, params.id!);
  if (!at) return json({ error: "No such attempt." }, 404);
  return json({ ...summaryOf(at), assignmentId: at.assignmentId, studentName: at.student.name, marks: at.marks ?? [] });
};
