import type { APIRoute } from "astro";

/**
 * The server's clock, { now } in milliseconds, for "Start together": each
 * device asks a few times and keeps the quickest answer (clockOffset in
 * src/lib/live.ts). No database, nothing stored.
 */
export const GET: APIRoute = () =>
  new Response(JSON.stringify({ now: Date.now() }), {
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
