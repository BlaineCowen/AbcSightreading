import type { APIRoute } from "astro";
import { currentUser, json } from "../../../../lib/server/api";
import { AttemptError, boardRoster } from "../../../../lib/server/attempts";

/** GET -> { className, title, students: [{ id, name, tries, best }] }: a board test's names, for its teacher (board-test.ts). */
export const GET: APIRoute = async ({ request, params }) => {
  const user = await currentUser(request);
  if (!user) return json({ error: "Sign in first." }, 401);
  try {
    return json(await boardRoster(user.id, params.id!));
  } catch (e) {
    if (e instanceof AttemptError) return json({ error: e.message }, e.status);
    throw e;
  }
};
