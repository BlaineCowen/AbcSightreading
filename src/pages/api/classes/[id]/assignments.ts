import type { APIRoute } from "astro";
import { currentUser, json, readJson } from "../../../../lib/server/api";
import { prisma } from "../../../../lib/server/db";
import { checkAssignmentRequest } from "../../../../lib/practice";
import { classAssignments, describePreset, roleIn } from "../../../../lib/server/practice";
import { hasEducatorPlan } from "../../../../lib/server/plan";

/**
 * A class's assignments. The class's teacher only.
 *
 * GET  -> { students: [{ id, name, week }], assignments: [{ ..., progress: [...] }] }
 * POST { presetKey, minutes, dueAt?, note? } -> the assignment
 */

export const GET: APIRoute = async ({ request, params }) => {
  const user = await currentUser(request);
  if (!user) return json({ error: "Sign in first." }, 401);
  if ((await roleIn(user.id, params.id!)) !== "teacher") return json({ error: "No such class." }, 404);
  return json(await classAssignments(params.id!));
};

export const POST: APIRoute = async ({ request, params }) => {
  const user = await currentUser(request);
  if (!user) return json({ error: "Sign in first." }, 401);
  if ((await roleIn(user.id, params.id!)) !== "teacher") return json({ error: "No such class." }, 404);
  if (!(await hasEducatorPlan(user))) return json({ error: "Assignments are part of the Educator plan." }, 403);
  const checked = checkAssignmentRequest(await readJson(request));
  if (!checked.ok) return json({ error: checked.error }, 400);
  const preset = await describePreset(user.id, checked.value.presetKey, checked.value.piece);
  if (!preset) return json({ error: "That preset is not one of yours." }, 400);
  if ("error" in preset) return json({ error: preset.error }, 400);
  const a = await prisma.assignment.create({
    data: {
      classId: params.id!,
      presetKey: checked.value.presetKey,
      title: preset.title,
      page: preset.page,
      params: preset.params ?? undefined,
      minutes: checked.value.minutes,
      dueAt: checked.value.dueAt,
      note: checked.value.note,
    },
  });
  return json({ id: a.id }, 201);
};
