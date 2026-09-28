import type { APIRoute } from "astro";
import { currentUser, json, readJson } from "../../lib/server/api";
import { recordPractice } from "../../lib/server/practice";

/**
 * POST { seconds, exercises, assignmentId?, page, day } - a practice page's
 * report, every 30 seconds while the student is at it (src/lib/practice-tracker.ts).
 * The server decides what counts: see creditSeconds.
 */
export const POST: APIRoute = async ({ request }) => {
  const user = await currentUser(request);
  if (!user) return json({ error: "Sign in first." }, 401);
  const b = ((await readJson(request)) ?? {}) as Record<string, unknown>;
  const result = await recordPractice(user.id, {
    seconds: Number(b.seconds),
    exercises: Number(b.exercises),
    assignmentId: typeof b.assignmentId === "string" ? b.assignmentId : null,
    page: String(b.page ?? ""),
    day: b.day,
  });
  return json(result);
};
