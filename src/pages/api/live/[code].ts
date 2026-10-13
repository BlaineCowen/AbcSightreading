import type { APIRoute } from "astro";
import { currentUser, json, readJson } from "../../../lib/server/api";
import { prisma } from "../../../lib/server/db";
import { clientKey, directorName, goOffAir, limits, noRoom, offAir, ownRoom, roomOnAir, tooMany } from "../../../lib/server/live";
import {
  checkPublish,
  isDeviceKey,
  isLiveCode,
  isLivePlay,
  liveEndsAt,
  liveEtag,
  normalizeLiveCode,
} from "../../../lib/live";

/**
 * One live room, by its code: the address on the director's poster.
 *
 * GET ?since=<version>: anyone with the code, no account. Off air it answers
 *   { live: false, director } and the device waits; on air
 *   { live: true, version, play } and, when the version is not `since`, the
 *   score too: { abc, settings, page }. Polled every 1.5 s by each student's
 *   device, so the usual answer is a few bytes and one small query, and
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

  const light = await prisma.liveRoom.findUnique({
    where: { code },
    select: { version: true, play: true, endsAt: true, endedAt: true, teacherId: true },
  });
  if (!light) {
    if (!limits.missesPerAddress(address)) return tooMany();
    return noRoom();
  }
  const open = roomOnAir(light);
  const play = open && isLivePlay(light.play) ? light.play : null;
  const etag = liveEtag({ version: light.version, playId: play?.id ?? null, open });
  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: pollHeaders(etag) });

  if (!open) {
    const director = await directorName(light.teacherId);
    return new Response(JSON.stringify({ live: false, director }), { status: 200, headers: pollHeaders(etag) });
  }

  const since = Number(url.searchParams.get("since"));
  const base = { live: true, version: light.version, play };
  if (url.searchParams.has("since") && since === light.version) {
    return new Response(JSON.stringify(base), { status: 200, headers: pollHeaders(etag) });
  }
  const full = await prisma.liveRoom.findUnique({ where: { code }, select: { abc: true, settings: true, page: true } });
  return new Response(JSON.stringify({ ...base, abc: full?.abc ?? "", settings: full?.settings ?? null, page: full?.page }), {
    status: 200,
    headers: pollHeaders(etag),
  });
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
  return json({ version: updated.version });
};

export const DELETE: APIRoute = async ({ request, params }) => {
  const user = await currentUser(request);
  if (!user) return json({ error: "Sign in first." }, 401);
  const s = await ownRoom(params.code, user.id);
  if (!s) return noRoom();
  if (roomOnAir(s)) await goOffAir(s.id);
  return json({ ok: true });
};
