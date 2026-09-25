import type { APIRoute } from "astro";
import { currentUser, json, readJson } from "../../../../lib/server/api";
import { prisma } from "../../../../lib/server/db";
import { parsePresetKey } from "../../../../lib/class-validate";
import { missing, notSignedIn, toClass, withProgress } from "../_shared";

/**
 * PUT { presetKey, passed } marks a preset passed, or not, for one class, and
 * answers with the class as it now is. Idempotent: marking a pass twice keeps
 * the first date, which is the one worth knowing.
 *
 * A saved preset must be the caller's own - checked here, since the key alone
 * could name anyone's.
 */
export const PUT: APIRoute = async ({ request, params }) => {
  const user = await currentUser(request);
  if (!user) return notSignedIn();
  const body = ((await readJson(request)) ?? {}) as { presetKey?: unknown; passed?: unknown };
  const key = parsePresetKey(body.presetKey);
  if (!key) return json({ error: "Unknown preset." }, 400);
  if (typeof body.passed !== "boolean") return json({ error: "Say whether it was passed." }, 400);
  const presetKey = body.presetKey as string;

  const owned = await prisma.class.findFirst({ where: { id: params.id, userId: user.id }, select: { id: true } });
  if (!owned) return missing();

  if (body.passed) {
    let presetId: string | undefined;
    if (key.kind === "saved") {
      const preset = await prisma.preset.findFirst({ where: { id: key.id, userId: user.id }, select: { id: true } });
      if (!preset) return json({ error: "No such preset." }, 404);
      presetId = preset.id;
    }
    await prisma.classProgress.upsert({
      where: { classId_presetKey: { classId: owned.id, presetKey } },
      create: { classId: owned.id, presetKey, presetId },
      update: {},
    });
  } else {
    await prisma.classProgress.deleteMany({ where: { classId: owned.id, presetKey } });
  }
  const c = await prisma.class.findFirst({ where: { id: owned.id }, select: withProgress });
  return c ? json(toClass(c)) : missing();
};
