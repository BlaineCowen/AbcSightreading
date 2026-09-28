import type { APIRoute } from "astro";
import { serverEnv } from "../lib/server/env";

/** Production only is crawled; a preview or local server turns every crawler away. */
export const GET: APIRoute = ({ site }) => {
  const production = serverEnv("VERCEL_ENV") === "production";
  const body = production
    ? [
        "User-agent: *",
        "Disallow: /api/",
        "Disallow: /account",
        "Disallow: /login",
        "Disallow: /reset-password",
        "Disallow: /join",
        "Disallow: /write",
        "",
        `Sitemap: ${new URL("/sitemap.xml", site)}`,
      ]
    : ["User-agent: *", "Disallow: /"];
  return new Response(body.join("\n") + "\n", { headers: { "Content-Type": "text/plain; charset=utf-8" } });
};
