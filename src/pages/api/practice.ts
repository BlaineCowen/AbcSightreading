import type { APIRoute } from "astro";
import { currentUser, json, readJson } from "../../lib/server/api";
import { recordPractice } from "../../lib/server/practice";
import { award, checkPointsReport } from "../../lib/server/points";
import { practiceDay } from "../../lib/practice";

/**
 * POST { seconds, exercises, assignmentId?, page, day, points? } - a practice page's
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
  // Points (server/points.ts): what this report earned, for the card after an exercise. Only students of an owner's classes, for now.
  let points = null;
  if (result.logged) {
    const pts = checkPointsReport(b.points);
    if (result.credited || pts.exercises.length || pts.grades.length) {
      try {
        points = await award(user.id, practiceDay(b.day), {
          credited: result.credited,
          page: String(b.page ?? ""),
          assignmentId: typeof b.assignmentId === "string" ? b.assignmentId : null,
          ...pts,
        });
      } catch (e) {
        // Points never cost a student their practice log.
        console.error("points", e);
      }
    }
  }
  return json(points ? { ...result, points } : result);
};
