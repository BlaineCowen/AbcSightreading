import type { APIRoute } from "astro";
import { currentUser, json, readJson } from "../../../lib/server/api";
import { prisma } from "../../../lib/server/db";
import { checkClassName } from "../../../lib/class-validate";
import { missing, notSignedIn, toClass, withProgress } from "./_shared";

/**
 * PATCH { name?, position? } renames or moves a class; DELETE removes it and
 * its progress. Both match on id AND owner, so someone else's class behaves
 * like one that does not exist.
 */

export const PATCH: APIRoute = async ({ request, params }) => {
  const user = await currentUser(request);
  if (!user) return notSignedIn();
  const body = ((await readJson(request)) ?? {}) as { name?: unknown; position?: unknown };
  const data: { name?: string; position?: number } = {};
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
