import type { APIRoute } from "astro";
import { currentUser, json, readJson } from "../../lib/server/api";
import { prisma } from "../../lib/server/db";
import { checkRecent, MAX_RECENT, type RecentExercise } from "../../lib/recent-exercises";

/**
 * The signed-in person's recent exercises (src/lib/recent-exercises.ts), for
 * the home page.
 *
 * GET            -> RecentExercise[], newest first
 * POST { page, title, detail, link } -> 204; the same link again moves to the top
 * DELETE ?id=X   -> 204 (one); DELETE with no id clears them all
 */

const notSignedIn = () => json({ error: "Sign in to keep recent exercises." }, 401);

type Row = { id: string; page: string; title: string; detail: string; link: string; createdAt: Date };
const toRecent = (r: Row): RecentExercise => ({
  id: r.id,
  page: r.page as RecentExercise["page"],
  title: r.title,
  detail: r.detail,
  link: r.link,
  createdAt: r.createdAt.getTime(),
});

export const GET: APIRoute = async ({ request }) => {
  const user = await currentUser(request);
  if (!user) return notSignedIn();
  const rows = await prisma.recentExercise.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: MAX_RECENT,
  });
  return json(rows.map(toRecent));
};

export const POST: APIRoute = async ({ request }) => {
  const user = await currentUser(request);
  if (!user) return notSignedIn();
  const checked = checkRecent(await readJson(request));
  if (!checked.ok) return json({ error: checked.error }, 400);
  const userId = user.id;
  await prisma.$transaction(async (tx) => {
    // The same exercise again (reopened from a link) moves up rather than repeating.
    await tx.recentExercise.deleteMany({ where: { userId, link: checked.value.link } });
    await tx.recentExercise.create({ data: { userId, ...checked.value } });
    const old = await tx.recentExercise.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      skip: MAX_RECENT,
      select: { id: true },
    });
    if (old.length) await tx.recentExercise.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
  });
  return new Response(null, { status: 204 });
};

export const DELETE: APIRoute = async ({ request, url }) => {
  const user = await currentUser(request);
  if (!user) return notSignedIn();
  const id = url.searchParams.get("id");
  // Matched on owner too, so another person's id simply removes nothing.
  await prisma.recentExercise.deleteMany({ where: { userId: user.id, ...(id ? { id } : {}) } });
  return new Response(null, { status: 204 });
};
