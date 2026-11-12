import { defineMiddleware } from "astro:middleware";
import { refCookie, refFromUrl } from "./lib/referral";
// Loaded with the function so its database connection opens at start-up (db.ts).
import "./lib/server/db";
import { withPlanCache } from "./lib/server/plan-cache";

/**
 * One address for the site. abc.blainecowen.com was the beta's address and
 * still serves the project, but sign-in only trusts www.abc-sightreading.com
 * (BETTER_AUTH_URL), so an old link is sent to the same page there - path,
 * query and all - with a permanent redirect. Previews and local dev are
 * untouched: only the old host is matched.
 */
const MOVED: Record<string, string> = {
  "abc.blainecowen.com": "https://www.abc-sightreading.com",
};

export const onRequest = defineMiddleware(async (context, next) => {
  const target = MOVED[context.url.hostname];
  if (target) {
    return Response.redirect(new URL(context.url.pathname + context.url.search, target).href, 308);
  }
  // The plan, remembered between requests in a signed cookie (plan-cache.ts).
  const { response, setCookie } = await withPlanCache(context.request, context.url, () => next());
  const cookies: string[] = setCookie ? [setCookie] : [];
  // An advertiser's link, ?ref=CODE on any page: kept for checkout (referral.ts).
  const ref = refFromUrl(context.url);
  if (ref) cookies.push(refCookie(ref, context.url.protocol === "https:"));
  if (!cookies.length) return response;
  try {
    for (const c of cookies) response.headers.append("Set-Cookie", c);
    return response;
  } catch {
    // Some responses (a redirect, say) come with headers that cannot change.
    const copy = new Response(response.body, response);
    for (const c of cookies) copy.headers.append("Set-Cookie", c);
    return copy;
  }
});
