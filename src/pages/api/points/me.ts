import type { APIRoute } from "astro";
import { currentUser, json } from "../../../lib/server/api";
import { myPoints } from "../../../lib/server/points";
import { practiceDay } from "../../../lib/practice";

/**
 * GET ?day=YYYY-MM-DD -> the student's week (points.ts): points, place,
 * streak, the class leaderboard and goal, and badges not yet shown.
 * { on: false } for anyone points are not on for.
 */
export const GET: APIRoute = async ({ request, url }) => {
  const user = await currentUser(request);
  if (!user) return json({ error: "Sign in first." }, 401);
  return json(await myPoints(user.id, practiceDay(url.searchParams.get("day"))));
};
