import type { APIRoute } from "astro";
import { currentUser, json, readJson } from "../../../lib/server/api";
import { prisma } from "../../../lib/server/db";
import { checkClassName, checkCourseSteps } from "../../../lib/class-validate";
import { isCourse } from "../../../lib/class-course";
import { Prisma } from "../../../generated/prisma/client";
import { missing, notSignedIn, ownsSavedKeys, toClass, withProgress } from "./_shared";

/**
 * PATCH { name?, position?, course?, courseSteps? } renames or moves a class,
 * sets the course it follows (class-course.ts), or its own list of the
 * course's steps (null goes back to the course as written); DELETE removes it and
 * its progress. Both match on id AND owner, so someone else's class behaves
 * like one that does not exist.
 */

export const PATCH: APIRoute = async ({ request, params }) => {
  const user = await currentUser(request);
  if (!user) return notSignedIn();
  const body = ((await readJson(request)) ?? {}) as { name?: unknown; position?: unknown; course?: unknown; courseSteps?: unknown };
  const data: { name?: string; position?: number; course?: string | null; courseSteps?: string[] | typeof Prisma.DbNull } = {};
  if (body.course !== undefined) {
    if (body.course !== null && !isCourse(body.course)) return json({ error: "No such course." }, 400);
    data.course = body.course as string | null;
    // A new course starts as written; the old course's list would not fit it.
    if (body.courseSteps === undefined) data.courseSteps = Prisma.DbNull;
  }
  if (body.courseSteps !== undefined) {
    const steps = checkCourseSteps(body.courseSteps);
    if (!steps.ok) return json({ error: steps.error }, 400);
    if (steps.value && !(await ownsSavedKeys(user.id, steps.value))) return json({ error: "No such preset." }, 404);
    data.courseSteps = steps.value ?? Prisma.DbNull;
  }
  if (body.name !== undefined) {
    const name = checkClassName(body.name);
    if (!name.ok) return json({ error: name.error }, 400);
    data.name = name.value;
  }
  if (body.position !== undefined) {
    if (!Number.isInteger(body.position) || (body.position as number) < 0) {
      return json({ error: "A position is a whole number." }, 400);
    }
    data.position = body.position as number;
  }
  if (!Object.keys(data).length) return json({ error: "Nothing to change." }, 400);
  const { count } = await prisma.class.updateMany({ where: { id: params.id, userId: user.id }, data });
  if (!count) return missing();
  const c = await prisma.class.findFirst({ where: { id: params.id, userId: user.id }, select: withProgress });
  return c ? json(toClass(c)) : missing();
};

export const DELETE: APIRoute = async ({ request, params }) => {
  const user = await currentUser(request);
  if (!user) return notSignedIn();
  const { count } = await prisma.class.deleteMany({ where: { id: params.id, userId: user.id } });
  return count ? json({ ok: true }) : missing();
};
