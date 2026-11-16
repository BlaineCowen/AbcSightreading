import type { APIRoute } from "astro";
import { currentUser, json } from "../../../lib/server/api";
import { myBadges, pointsClasses } from "../../../lib/server/points";
import { isAdmin } from "../../../lib/server/admin";

/** GET -> the student's badges and their counts toward the next levels (the Badges page). */
export const GET: APIRoute = async ({ request }) => {
  const user = await currentUser(request);
  if (!user) return json({ error: "Sign in first." }, 401);
  // While it is tried out: students of an owner's classes, and the owner.
  if (!isAdmin(user) && !(await pointsClasses(user.id)).length) return json({ on: false });
  return json({ on: true, ...(await myBadges(user.id)) });
};
