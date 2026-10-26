import type { APIRoute } from "astro";
import { currentUser, json, readJson } from "../../../lib/server/api";
import { prisma } from "../../../lib/server/db";
import { clientKey, goOffAir, limits, noRoom, notifyRoom, offAir, ownRoom, roomOnAir, roomState, tooMany } from "../../../lib/server/live";
import { checkPublish, isDeviceKey, isLiveCode, liveEndsAt, normalizeLiveCode } from "../../../lib/live";

/**
 * One live room, by its code: the address on the director's poster.
 *
 * GET ?since=<version>: anyone with the code, no account. Off air it answers
 *   { live: false, director } and the device waits; on air
 *   { live: true, version, play } and, when the version is not `since`, the
 *   score too: { abc, settings, page }. Polled every 1.5 s by a student's
 *   device without a socket to the push service (every 30 s with one, as a
 *   safety net), so the usual answer is a few bytes and one small query, and
 *   Vercel's CDN may answer it for a second (below): every device in a room
 *   asks the same address, so a class of thirty costs about one query a
 *   second, not twenty.
 * PUT { abc, settings }: the director's page publishes the exercise; the
 *   version goes up by one (not when nothing changed). Only while Live is on.
 * DELETE: Live off. The room and its address stay.
 */

const pollHeaders = (etag: string) => ({
  "Content-Type": "application/json",
  // The browser keeps it but always checks again, so a repeat poll can be a
  // 304; the CDN may serve it for one second. Nothing in it is private: it is
  // what anyone with the code is shown.
  "Cache-Control": "public, max-age=0, must-revalidate",
  "Vercel-CDN-Cache-Control": "max-age=1",
  ETag: etag,
});

export const GET: APIRoute = async ({ request, params, url, clientAddress }) => {
  const code = normalizeLiveCode(params.code ?? "");
  const address = clientKey(request, clientAddress);
  const device = url.searchParams.get("d");
  if (!limits.pollPerAddress(address)) return tooMany();
  if (isDeviceKey(device) && !limits.pollPerDevice(`${code}:${device}`)) return tooMany();
  if (!isLiveCode(code)) {
    if (!limits.missesPerAddress(address)) return tooMany();
    return noRoom();
  }

  const since = url.searchParams.has("since") ? Number(url.searchParams.get("since")) : undefined;
  const state = await roomState(code, since);
  if (!state) {
    if (!limits.missesPerAddress(address)) return tooMany();
    return noRoom();
  }
  if (request.headers.get("if-none-match") === state.etag) return new Response(null, { status: 304, headers: pollHeaders(state.etag) });
  return new Response(JSON.stringify(state.body), { status: 200, headers: pollHeaders(state.etag) });
};

export const PUT: APIRoute = async ({ request, params }) => {
  const user = await currentUser(request);
  if (!user) return json({ error: "Sign in first." }, 401);
  if (!limits.teacher(`put:${user.id}`)) return tooMany();
  const s = await ownRoom(params.code, user.id);
  if (!s) return noRoom();
  if (!roomOnAir(s)) return offAir();
  const checked = checkPublish(await readJson(request));
  if (!checked.ok) return json({ error: checked.error }, 400);
  const { abc, settings } = checked.value;
  const now = new Date();
  if (abc === s.abc && JSON.stringify(settings) === JSON.stringify(s.settings)) {
    return json({ version: s.version, unchanged: true });
  }
  const updated = await prisma.liveRoom.update({
    where: { id: s.id },
    data: { abc, settings, version: { increment: 1 }, endsAt: liveEndsAt(s.startedAt, now) },
    select: { version: true },
  });
  await notifyRoom(s.code);
  return json({ version: updated.version });
};

export const DELETE: APIRoute = async ({ request, params }) => {
  const user = await currentUser(request);
  if (!user) return json({ error: "Sign in first." }, 401);
  const s = await ownRoom(params.code, user.id);
  if (!s) return noRoom();
  if (roomOnAir(s)) {
    await goOffAir(s.id);
    await notifyRoom(s.code);
  }
  return json({ ok: true });
};
