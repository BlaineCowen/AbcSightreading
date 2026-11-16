import type { APIRoute } from "astro";
import { currentUser, json, readJson } from "../../../../lib/server/api";
import { roleIn } from "../../../../lib/server/practice";
import { isAdmin } from "../../../../lib/server/admin";
import { classPoints, giveBadge, updateClassPoints } from "../../../../lib/server/points";
import { practiceDay } from "../../../../lib/practice";
import { TEACHER_BADGES } from "../../../../lib/badges";

/**
 * A class's points and badges (points.ts), its teacher only, and the owner
 * only while it is tried out (owner-flags "points").
 *
 * GET   ?day= -> settings, this week's points by student, last week's result
 * PATCH { leaderboardOn?, weeklyGoal? (null: the recommended one), breakUntil? }
 * POST  { studentId, badgeId, title? } -> a badge from the teacher
 */
async function teacher(request: Request, classId: string) {
  const user = await currentUser(request);
  if (!user) return { error: json({ error: "Sign in first." }, 401) };
  if (!isAdmin(user)) return { error: json({ error: "Not open yet." }, 403) };
  if ((await roleIn(user.id, classId)) !== "teacher") return { error: json({ error: "No such class." }, 404) };
  return { user };
}

export const GET: APIRoute = async ({ request, params, url }) => {
  const t = await teacher(request, params.id!);
  if (t.error) return t.error;
  return json(await classPoints(params.id!, practiceDay(url.searchParams.get("day"))));
};

export const PATCH: APIRoute = async ({ request, params }) => {
  const t = await teacher(request, params.id!);
  if (t.error) return t.error;
  await updateClassPoints(params.id!, ((await readJson(request)) ?? {}) as Record<string, unknown>);
  return json({ ok: true });
};

export const POST: APIRoute = async ({ request, params }) => {
  const t = await teacher(request, params.id!);
  if (t.error) return t.error;
  const b = ((await readJson(request)) ?? {}) as Record<string, unknown>;
  const badge = TEACHER_BADGES.find((x) => x.id === b.badgeId);
  const title = typeof b.title === "string" ? b.title.trim().slice(0, 40) : "";
  if (!badge || typeof b.studentId !== "string") return json({ error: "Choose a badge and a student." }, 400);
  if (badge.id === "t-own" && !title) return json({ error: "Name your badge." }, 400);
  const ok = await giveBadge(t.user!.id, params.id!, b.studentId, badge.id, badge.id === "t-own" ? title : null);
  return ok ? json({ ok: true }, 201) : json({ error: "That student is not in this class." }, 404);
};
