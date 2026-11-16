import type { APIRoute } from "astro";
import { currentUser, json, readJson } from "../../../../../lib/server/api";
import { AttemptError, listAttempts, startAttempt } from "../../../../../lib/server/attempts";

/**
 * An assignment's graded attempts (src/lib/pieces/attempts.ts, src/lib/gradebook.ts).
 *
 * GET                          -> { role, max, attempts }: a student's own, or the teacher's whole class
 * POST { partId }              -> { attempt, used, max }: a student starts one at a piece, counted now
 * POST { mode, exercise }      -> the same at a sight-reading assignment (sing, clap or tap; the exercise's link)
 * POST { mode, exercise, studentId } -> the teacher's device at a board test, for that student (board-test.ts)
 */

const fail = (e: unknown) => {
  if (e instanceof AttemptError) return json({ error: e.message }, e.status);
  throw e;
};

export const GET: APIRoute = async ({ request, params }) => {
  const user = await currentUser(request);
  if (!user) return json({ error: "Sign in first." }, 401);
  try {
    return json(await listAttempts(user.id, params.id!));
  } catch (e) {
    return fail(e);
  }
};

export const POST: APIRoute = async ({ request, params }) => {
  const user = await currentUser(request);
  if (!user) return json({ error: "Sign in first." }, 401);
  const body = (await readJson(request)) as { partId?: unknown; mode?: unknown; exercise?: unknown; studentId?: unknown } | undefined;
  try {
    return json(await startAttempt(user.id, params.id!, body ?? {}), 201);
  } catch (e) {
    return fail(e);
  }
};
