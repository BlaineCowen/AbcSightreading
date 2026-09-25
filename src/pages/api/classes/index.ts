import type { APIRoute } from "astro";
import { currentUser, json, readJson } from "../../../lib/server/api";
import { prisma } from "../../../lib/server/db";
import { checkClassName, MAX_CLASSES } from "../../../lib/class-validate";
import { listClasses, notSignedIn, toClass, withProgress } from "./_shared";

/**
 * The signed-in director's classes.
 *
 * GET              -> ClassWithProgress[], in their order
 * POST { name }    -> the new class, placed last
 */

export const GET: APIRoute = async ({ request }) => {
  const user = await currentUser(request);
  if (!user) return notSignedIn();
  return json(await listClasses(user.id));
};

export const POST: APIRoute = async ({ request }) => {
  const user = await currentUser(request);
  if (!user) return notSignedIn();
  const body = (await readJson(request)) as { name?: unknown } | undefined;
  const name = checkClassName(body?.name);
  if (!name.ok) return json({ error: name.error }, 400);
  const count = await prisma.class.count({ where: { userId: user.id } });
  if (count >= MAX_CLASSES) return json({ error: `You can keep up to ${MAX_CLASSES} classes.` }, 409);
  const last = await prisma.class.findFirst({
    where: { userId: user.id },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  const created = await prisma.class.create({
    data: { userId: user.id, name: name.value, position: (last?.position ?? -1) + 1 },
    select: withProgress,
  });
  return json(toClass(created), 201);
};
