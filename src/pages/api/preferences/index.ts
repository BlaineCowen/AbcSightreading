import type { APIRoute } from "astro";
import { currentUser, json, readJson } from "../../../lib/server/api";
import { prisma } from "../../../lib/server/db";
import { checkCustomSyllables } from "../../../resources/rhythm-syllables";
import { Prisma } from "../../../generated/prisma/client";

/**
 * The signed-in teacher's own settings.
 *
 * GET                              -> { rhythmSyllables: CustomSyllables | null }
 * PUT { rhythmSyllables }          -> the same, as saved. null clears the set.
 */

const notSignedIn = () => json({ error: "Sign in to keep your own syllables." }, 401);

export const GET: APIRoute = async ({ request }) => {
  const user = await currentUser(request);
  if (!user) return notSignedIn();
  const pref = await prisma.userPreference.findUnique({ where: { userId: user.id } });
  return json({ rhythmSyllables: pref?.rhythmSyllables ?? null });
};

export const PUT: APIRoute = async ({ request }) => {
  const user = await currentUser(request);
  if (!user) return notSignedIn();
  const body = ((await readJson(request)) ?? {}) as { rhythmSyllables?: unknown };
  let value: object | null = null;
  if (body.rhythmSyllables !== null) {
    const checked = checkCustomSyllables(body.rhythmSyllables);
    if (!checked.ok) return json({ error: checked.error }, 400);
    value = checked.value;
  }
  // A nullable Json column is cleared with DbNull, not a JS null.
  const data = { rhythmSyllables: value ?? Prisma.DbNull };
  await prisma.userPreference.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...data },
    update: data,
  });
  return json({ rhythmSyllables: value });
};
