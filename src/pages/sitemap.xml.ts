import type { APIRoute } from "astro";
import { PUBLIC_PAGES } from "../lib/seo";

/** Hand-made: every page is server-rendered, so there is nothing for a build-time sitemap to find. */
export const GET: APIRoute = ({ site }) => {
  const urls = PUBLIC_PAGES.map((p) => `  <url><loc>${new URL(p, site).href}</loc></url>`).join("\n");
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
    { headers: { "Content-Type": "application/xml; charset=utf-8" } }
  );
};
