import type { APIRoute } from "astro";
import { auth } from "../../../lib/server/auth";
import { json } from "../../../lib/server/api";
import { DEV_SIGN_IN_KEY, devSignInAllowedFrom, devSignInEmail } from "../../../lib/server/dev-sign-in";

/**
 * The dev server's one-tap sign-in (src/lib/server/dev-sign-in.ts): POST
 * from /login signs DEV_SIGN_IN_EMAIL in on this address. Only on the dev
 * server, only from this computer or a Tailscale device; anywhere else it is
 * not there (404).
 */
export const POST: APIRoute = async ({ request, clientAddress }) => {
  if (!devSignInEmail() || !devSignInAllowedFrom(clientAddress)) return json({ error: "Not found." }, 404);
  const base = new URL(String(auth.options.baseURL));
  return auth.handler(
    new Request(new URL("/api/auth/dev/sign-in", base), {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: base.origin, "x-dev-sign-in": DEV_SIGN_IN_KEY },
      body: "{}",
    })
  );
};
