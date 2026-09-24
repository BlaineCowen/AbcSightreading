import type { APIRoute } from "astro";
import { currentUser, json, notSignedIn, readJson } from "../../../lib/server/api";
import { prisma } from "../../../lib/server/db";
import { checkName } from "../../../lib/preset-validate";

/**
 * PATCH { name } renames one preset; DELETE removes it.
 *
 * Both match on id AND owner, so an id belonging to someone else behaves
 * exactly like one that does not exist - 404, with nothing changed and nothing
 * revealed about whether it exists.
 */

const missing = () => json({ error: "No such preset." }, 404);

export const PATCH: APIRoute = async ({ request, params }) => {
  const user = await currentUser(request);
  if (!user) return notSignedIn();
  const body = (await readJson(request)) as { name?: unknown } | undefined;
  const name = checkName(body?.name);
  if (!name.ok) return json({ error: name.error }, 400);
  const { count } = await prisma.preset.updateMany({
    where: { id: params.id, userId: user.id },
    data: { name: name.value },
  });
  return count ? json({ ok: true }) : missing();
};

export const DELETE: APIRoute = async ({ request, params }) => {
  const user = await currentUser(request);
  if (!user) return notSignedIn();
  const { count } = await prisma.preset.deleteMany({
    where: { id: params.id, userId: user.id },
  });
  return count ? json({ ok: true }) : missing();
};
