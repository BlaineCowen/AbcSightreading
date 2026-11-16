import type { APIRoute } from "astro";
import { currentUser, json, readJson } from "../../../../lib/server/api";
import { prisma } from "../../../../lib/server/db";
import { copyAssignment } from "../../../../lib/server/practice";
import { hasEducatorPlan } from "../../../../lib/server/plan";
import { isAdmin } from "../../../../lib/server/admin";
import { isBoardTest } from "../../../../lib/board-test";

/**
 * POST { classIds } -> { made: [{ classId, id }] }: the same assignment in
 * more of the teacher's classes (copyAssignment).
 */
export const POST: APIRoute = async ({ request, params }) => {
  const user = await currentUser(request);
  if (!user) return json({ error: "Sign in first." }, 401);
  if (!(await hasEducatorPlan(user))) return json({ error: "Assignments are part of the Educator plan." }, 403);
  const body = (await readJson(request)) as { classIds?: unknown } | null;
  const classIds = Array.isArray(body?.classIds) ? body.classIds.filter((x): x is string => typeof x === "string").slice(0, 100) : [];
  if (!classIds.length) return json({ error: "Choose a class." }, 400);
  const a = await prisma.assignment.findUnique({ where: { id: params.id! }, select: { params: true } });
  // Owner only while board tests are tried out, as when one is made (classes/[id]/assignments).
  if (a && isBoardTest(a.params) && !isAdmin(user)) return json({ error: "Board tests are not open yet." }, 403);
  const made = await copyAssignment(user.id, params.id!, classIds);
  if (!made) return json({ error: "No such assignment." }, 404);
  return json({ made }, 201);
};
