import { defineMiddleware } from "astro:middleware";

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

export const onRequest = defineMiddleware((context, next) => {
  const target = MOVED[context.url.hostname];
  if (target) {
    return Response.redirect(new URL(context.url.pathname + context.url.search, target).href, 308);
  }
  return next();
});
