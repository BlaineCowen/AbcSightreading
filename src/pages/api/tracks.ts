import type { APIRoute } from "astro";
import { currentUser, json, readJson } from "../../lib/server/api";
import { prisma } from "../../lib/server/db";
import { hasPremium } from "../../lib/server/plan";
import { checkOverride, isTrackId, overridesFrom, parseTrackKey } from "../../lib/curriculum/subscriptions";
import { Prisma } from "../../generated/prisma/client";

/**
 * Curriculum tracks a teacher subscribes to, and their own versions of steps
 * (src/lib/curriculum). Subscribing, and keeping a version, is Pro and up;
 * reading is any signed-in account (a lapsed plan still sees what it had).
 *
 * GET                                  -> { tracks, overrides, canSubscribe }
 * PUT { track, subscribed }            -> the same, after (un)subscribing
 * PUT { key, options | null }          -> the same, after keeping (or dropping) a version of a step
 */

const notSignedIn = () => json({ error: "Sign in to subscribe to a track." }, 401);

async function state(userId: string, canSubscribe: boolean) {
  const pref = await prisma.userPreference.findUnique({ where: { userId } });
  return {
    tracks: (pref?.curriculumTracks ?? []).filter(isTrackId),
    overrides: overridesFrom(pref?.trackOverrides),
    canSubscribe,
  };
}

export const GET: APIRoute = async ({ request }) => {
  const user = await currentUser(request);
  if (!user) return notSignedIn();
  return json(await state(user.id, await hasPremium(user)));
};

export const PUT: APIRoute = async ({ request }) => {
  const user = await currentUser(request);
  if (!user) return notSignedIn();
  if (!(await hasPremium(user))) return json({ error: "Curriculum tracks come with Pro." }, 403);
  const body = ((await readJson(request)) ?? {}) as { track?: unknown; subscribed?: unknown; key?: unknown; options?: unknown };
  const pref = await prisma.userPreference.findUnique({ where: { userId: user.id } });

  if (body.track !== undefined) {
    if (!isTrackId(body.track)) return json({ error: "There is no such track." }, 400);
    const now = new Set((pref?.curriculumTracks ?? []).filter(isTrackId));
    if (body.subscribed === false) now.delete(body.track);
    else now.add(body.track);
    const data = { curriculumTracks: [...now] };
    await prisma.userPreference.upsert({ where: { userId: user.id }, create: { userId: user.id, ...data }, update: data });
    return json(await state(user.id, true));
  }

  if (typeof body.key === "string") {
    if (!parseTrackKey(body.key)) return json({ error: "There is no such step." }, 400);
    const overrides = overridesFrom(pref?.trackOverrides);
    if (body.options === null) delete overrides[body.key];
    else {
      const checked = checkOverride(body.options);
      if (!checked.ok) return json({ error: checked.error }, 400);
      overrides[body.key] = checked.value;
    }
    const value = Object.keys(overrides).length ? (overrides as Prisma.InputJsonValue) : Prisma.DbNull;
    await prisma.userPreference.upsert({
      where: { userId: user.id },
      create: { userId: user.id, trackOverrides: value },
      update: { trackOverrides: value },
    });
    return json(await state(user.id, true));
  }

  return json({ error: "Nothing to change." }, 400);
};
