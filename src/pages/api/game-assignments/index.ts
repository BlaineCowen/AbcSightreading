import type { APIRoute } from "astro";
import { currentUser, json, readJson } from "../../../lib/server/api";
import { hasEducatorPlan } from "../../../lib/server/plan";
import { checkGameAssignment, createGameAssignments, gameShown, myGameAssignments } from "../../../lib/server/game-assignments";

/**
 * Game assignments (src/lib/game-assignments.ts).
 * GET  -> { assignments } the signed-in student's, across their classes, with progress.
 * POST { game, setup, goal, dueAt?, note?, classIds } -> { ids } one a class (the teacher's classes, Educator).
 */
export const GET: APIRoute = async ({ request }) => {
  const user = await currentUser(request);
  if (!user) return json({ error: "Sign in first." }, 401);
  return json({ assignments: await myGameAssignments(user) });
};

export const POST: APIRoute = async ({ request }) => {
  const user = await currentUser(request);
  if (!user) return json({ error: "Sign in first." }, 401);
  if (!(await hasEducatorPlan(user))) return json({ error: "Assignments are part of the Educator plan." }, 403);
  const checked = checkGameAssignment(await readJson(request));
  if (!checked.ok) return json({ error: checked.error }, 400);
  if (!gameShown(checked.value.game, user)) return json({ error: "No such game." }, 404);
  const ids = await createGameAssignments(user.id, checked.value);
  if (!ids) return json({ error: "No such class." }, 404);
  return json({ ids, title: checked.value.title }, 201);
};
