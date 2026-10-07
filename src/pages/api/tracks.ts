import type { APIRoute } from "astro";
import { currentUser, json, readJson } from "../../lib/server/api";
import { prisma } from "../../lib/server/db";
import { hasPremium } from "../../lib/server/plan";
import { checkOverride, overridesFrom, parseTrackKey } from "../../lib/curriculum/subscriptions";
import { isSubscribable, needsPro, subscriptionsFrom } from "../../lib/curriculum/catalogue";
import { Prisma } from "../../generated/prisma/client";

/**
 * What a teacher's preset menu offers (src/lib/curriculum/catalogue.ts): the
 * sets and tracks subscribed to, abcStepByStep until they choose; and their
 * own versions of track steps. The built-in sets are anyone's; the
 * instrument tracks, and keeping a version, are Pro and up.
 *
 * GET                                  -> { tracks, chosen, overrides, canSubscribe }
 * PUT { track, subscribed }            -> the same, after (un)subscribing
 * PUT { tracks: string[] }             -> the same, the whole list (a browser's own, on first sign-in)
 * PUT { key, options | null }          -> the same, after keeping (or dropping) a version of a step
 */

const notSignedIn = () => json({ error: "Sign in to subscribe to a track." }, 401);

async function state(userId: string, canSubscribe: boolean) {
  const pref = await prisma.userPreference.findUnique({ where: { userId } });
  return {
    tracks: subscriptionsFrom(pref?.curriculumTracks),
    chosen: Array.isArray(pref?.curriculumTracks),
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
  const pro = await hasPremium(user);
  const body = ((await readJson(request)) ?? {}) as { track?: unknown; tracks?: unknown; subscribed?: unknown; key?: unknown; options?: unknown };
  const pref = await prisma.userPreference.findUnique({ where: { userId: user.id } });
  const save = async (list: string[]) => {
    const data = { curriculumTracks: list };
    await prisma.userPreference.upsert({ where: { userId: user.id }, create: { userId: user.id, ...data }, update: data });
    return json(await state(user.id, pro));
  };

  if (body.track !== undefined) {
    if (!isSubscribable(body.track)) return json({ error: "There is no such track." }, 400);
    const now = subscriptionsFrom(pref?.curriculumTracks);
    if (body.subscribed === false) return save(now.filter((t) => t !== body.track));
    if (needsPro(body.track) && !pro) return json({ error: "Instrument tracks come with Pro." }, 403);
    return save(now.includes(body.track) ? now : [...now, body.track]);
  }

  if (Array.isArray(body.tracks)) {
    // A Pro track kept in a browser while signed out is only taken with Pro.
    return save(subscriptionsFrom(body.tracks).filter((t) => pro || !needsPro(t)));
  }

  if (!pro) return json({ error: "Keeping your own version of a step comes with Pro." }, 403);
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
