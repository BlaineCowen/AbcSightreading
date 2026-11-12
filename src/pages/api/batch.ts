import type { APIContext, APIRoute } from "astro";
import { json } from "../../lib/server/api";
import { GET as usage } from "./usage";
import { GET as gift } from "./gift/index";
import { GET as freeMonth } from "./free-month/index";
import { GET as preferences } from "./preferences/index";
import { GET as tracks } from "./tracks";
import { GET as student } from "./student";
import { GET as assignments } from "./assignments/index";
import { GET as recent } from "./recent";
import { GET as presets } from "./presets/index";
import { GET as billing } from "./billing/index";

/**
 * Several reads in one request (12 November 2026, Blaine: "Can we also
 * minimize the amount we are calling the db?"). The practice page asked for
 * eight of these at once as it opened, each its own request, sign-in check and
 * plan lookup; src/lib/api-get.ts now gathers reads made in the same moment
 * and sends them here.
 *
 *   GET /api/batch?p=/api/usage&p=/api/presets?store=abcsr_presets
 *   -> { results: [{ status, body }, ...] }   (body: the route's JSON, as text)
 *
 * Each path runs the route's own GET with this request's cookies, so it
 * answers exactly as on its own and the same account rules apply; only the
 * routes below, only reads. They run together in this one call, so they share
 * its plan lookup (plan-cache.ts) and the session check. A failed one is its
 * own status, the others are unaffected.
 */
const ROUTES: Record<string, APIRoute> = {
  "/api/usage": usage,
  "/api/gift": gift,
  "/api/free-month": freeMonth,
  "/api/preferences": preferences,
  "/api/tracks": tracks,
  "/api/student": student,
  "/api/assignments": assignments,
  "/api/recent": recent,
  "/api/presets": presets,
  "/api/billing": billing,
};
export const BATCHABLE = Object.keys(ROUTES);
const MAX = 16;

export const GET: APIRoute = async (context) => {
  const paths = context.url.searchParams.getAll("p");
  if (!paths.length || paths.length > MAX) return json({ error: `1 to ${MAX} paths.` }, 400);
  const cookies: string[] = [];
  const results = await Promise.all(
    paths.map(async (path) => {
      const url = new URL(path, context.url);
      const route = url.origin === context.url.origin ? ROUTES[url.pathname] : undefined;
      if (!route) return { status: 404, body: JSON.stringify({ error: "Not batchable." }) };
      try {
        const request = new Request(url, { headers: context.request.headers });
        const res = await route({ ...context, request, url, params: {} } as APIContext);
        cookies.push(...res.headers.getSetCookie());
        return { status: res.status, body: res.status === 204 ? "" : await res.text() };
      } catch (e) {
        console.error(`batch: ${url.pathname}`, e);
        return { status: 500, body: JSON.stringify({ error: "That did not work. Try again." }) };
      }
    })
  );
  const res = json({ results });
  for (const c of cookies) res.headers.append("Set-Cookie", c);
  return res;
};
