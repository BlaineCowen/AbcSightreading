import type { APIRoute } from "astro";
import { currentUser, json, notSignedIn, readJson } from "../../../lib/server/api";
import { prisma } from "../../../lib/server/db";
import { checkPresetUpdate } from "../../../lib/preset-validate";

/**
 * PATCH { name?, params? } renames a preset, saves over its settings, or both,
 * and answers with the preset as it now is; DELETE removes it.
 *
 * Both match on id AND owner, so an id belonging to someone else behaves
 * exactly like one that does not exist - 404, with nothing changed and nothing
 * revealed about whether it exists.
 */

const missing = () => json({ error: "No such preset." }, 404);

export const PATCH: APIRoute = async ({ request, params }) => {
  const user = await currentUser(request);
  if (!user) return notSignedIn();
  const change = checkPresetUpdate(await readJson(request));
  if (!change.ok) return json({ error: change.error }, 400);
  const { name, params: settings } = change.value;
  const { count } = await prisma.preset.updateMany({
    where: { id: params.id, userId: user.id },
    data: { name, params: settings as object | undefined },
  });
  if (!count) return missing();
  const p = await prisma.preset.findFirst({
    where: { id: params.id, userId: user.id },
    select: { id: true, name: true, createdAt: true, params: true },
  });
  return p
    ? json({ id: p.id, name: p.name, createdAt: p.createdAt.getTime(), params: p.params })
    : missing();
};

export const DELETE: APIRoute = async ({ request, params }) => {
  const user = await currentUser(request);
  if (!user) return notSignedIn();
  const { count } = await prisma.preset.deleteMany({
    where: { id: params.id, userId: user.id },
  });
  return count ? json({ ok: true }) : missing();
};
