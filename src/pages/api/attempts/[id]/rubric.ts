import type { APIRoute } from "astro";
import { currentUser, json, readJson } from "../../../../lib/server/api";
import { AttemptError, scoreRubric } from "../../../../lib/server/attempts";

/** PUT { rubric: 1-4 | null } -> the teacher's rubric level on a portfolio checkpoint try. */
export const PUT: APIRoute = async ({ request, params }) => {
  const user = await currentUser(request);
  if (!user) return json({ error: "Sign in first." }, 401);
  const body = (await readJson(request)) as { rubric?: unknown } | null;
  try {
    return json(await scoreRubric(user.id, params.id!, body?.rubric ?? null));
  } catch (e) {
    if (e instanceof AttemptError) return json({ error: e.message }, e.status);
    throw e;
  }
};
