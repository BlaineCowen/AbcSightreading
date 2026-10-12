import type { APIRoute } from "astro";
import { currentUser, json, readJson } from "../../../lib/server/api";
import { ensureRoom, goLive, limits, mayRunLive, newRoomCode, roomOf, roomOnAir, tooMany, type RoomShape } from "../../../lib/server/live";
import { formatLiveCode, livePath } from "../../../lib/live";

/**
 * The director's live room (src/lib/live.ts).
 *
 * GET  -> { room: { code, display, path, live, page, version, endsAt } | null }:
 *         a reloaded page carries on while Live is on. `?make=1` makes the
 *         room (off air) if there is none, for the poster.
 * POST { page: "choral" | "unison" }: Live on (Pro or Educator), making the
 *         room the first time. POST { action: "new-code" }: a new code, off
 *         air; the old address stops working.
 */

const shape = (r: RoomShape) => ({
  code: r.code,
  display: formatLiveCode(r.code),
  path: livePath(r.code),
  live: roomOnAir(r),
  page: r.page,
  version: r.version,
  endsAt: r.endsAt.getTime(),
});

export const GET: APIRoute = async ({ request, url }) => {
  const user = await currentUser(request);
  if (!user) return json({ room: null });
  if (url.searchParams.get("make") === "1") {
    const allowed = await mayRunLive(user);
    if (!allowed.ok) return allowed.response;
    return json({ room: shape(await ensureRoom(user.id)) });
  }
  const room = await roomOf(user.id);
  return json({ room: room ? shape(room) : null });
};

export const POST: APIRoute = async ({ request }) => {
  const user = await currentUser(request);
  if (!user) return json({ error: "Sign in to use live practice." }, 401);
  if (!limits.teacher(`start:${user.id}`)) return tooMany();
  const allowed = await mayRunLive(user);
  if (!allowed.ok) return allowed.response;
  const body = ((await readJson(request)) ?? {}) as { page?: unknown; action?: unknown };
  if (body.action === "new-code") return json({ room: shape(await newRoomCode(user.id)) });
  const page = body.page === "unison" ? "unison" : "choral";
  return json({ room: shape(await goLive(user.id, page)) });
};
