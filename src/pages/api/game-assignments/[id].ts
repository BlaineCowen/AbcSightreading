import type { APIRoute } from "astro";
import { currentUser, json } from "../../../lib/server/api";
import { deleteGameAssignment, openGameAssignment } from "../../../lib/server/game-assignments";

/**
 * GET    -> the assignment to play: { game, title, setup, goal, goalText, role, progress } (a student of its class, or its teacher).
 * DELETE -> removes it and its results (its teacher).
 */
export const GET: APIRoute = async ({ request, params }) => {
  const user = await currentUser(request);
  if (!user) return json({ error: "Sign in first." }, 401);
  const a = await openGameAssignment(user, params.id!);
  return a ? json(a) : json({ error: "No such assignment." }, 404);
};

export const DELETE: APIRoute = async ({ request, params }) => {
  const user = await currentUser(request);
  if (!user) return json({ error: "Sign in first." }, 401);
  return (await deleteGameAssignment(user.id, params.id!)) ? json({ ok: true }) : json({ error: "No such assignment." }, 404);
};
