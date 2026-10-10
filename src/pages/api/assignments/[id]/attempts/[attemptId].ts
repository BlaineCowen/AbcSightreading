import type { APIRoute } from "astro";
import { currentUser, json, readJson } from "../../../../../lib/server/api";
import { AttemptError, attachTake, finishAttempt } from "../../../../../lib/server/attempts";
import { checkAttemptResult } from "../../../../../lib/pieces/attempts";

/**
 * A student's own attempt.
 *
 * PATCH { overall, pitch, rhythm, marks } -> the attempt, graded
 * PATCH { take: <blob path> }            -> its take arrived (uploaded straight to Blob first)
 */
export const PATCH: APIRoute = async ({ request, params }) => {
  const user = await currentUser(request);
  if (!user) return json({ error: "Sign in first." }, 401);
  const body = (await readJson(request)) as Record<string, unknown> | undefined;
  try {
    if (body && "take" in body) {
      await attachTake(user.id, params.id!, params.attemptId!, body.take);
      return json({ ok: true });
    }
    const checked = checkAttemptResult(body);
    if (!checked.ok) return json({ error: checked.error }, 400);
    return json(await finishAttempt(user.id, params.id!, params.attemptId!, checked.value));
  } catch (e) {
    if (e instanceof AttemptError) return json({ error: e.message }, e.status);
    throw e;
  }
};
