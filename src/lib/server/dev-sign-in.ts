import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import type { BetterAuthPlugin } from "better-auth";
import { serverEnv } from "./env";

/**
 * One-tap sign-in on the dev server (Blaine, 2 November 2026: a password
 * manager cannot keep up with localhost, the Tailscale name and every port,
 * and Google always sends a local sign-in back to localhost). /login on the
 * dev server offers "Sign in as <DEV_SIGN_IN_EMAIL>", which signs that
 * account in on whatever address the page is on.
 *
 * Never in a real build: it exists only when Vite says development and no
 * Vercel environment is set (`devSignInOn`). It is only answered from this
 * computer or a Tailscale device (`devSignInAllowedFrom`, by the socket's own
 * address, never a forwarded header), never the home network. The auth
 * endpoint itself also needs a key made fresh each time the server starts,
 * which only /api/dev/sign-in (the address check) holds.
 */

export const devSignInOn = () => import.meta.env.DEV && !serverEnv("VERCEL_ENV");

/** The account it signs in as. */
export const devSignInEmail = () => (devSignInOn() ? serverEnv("DEV_SIGN_IN_EMAIL")?.trim().toLowerCase() || null : null);

/** This computer (loopback) or a Tailscale address (100.64.0.0/10). */
export function devSignInAllowedFrom(address: string | undefined): boolean {
  if (!address) return false;
  const a = address.replace(/^::ffff:/, "");
  if (a === "127.0.0.1" || a === "::1") return true;
  const m = /^100\.(\d+)\.\d+\.\d+$/.exec(a);
  return !!m && Number(m[1]) >= 64 && Number(m[1]) <= 127;
}

/** Made fresh each time the server starts; never leaves the server. */
export const DEV_SIGN_IN_KEY = crypto.randomUUID();

/** The Better Auth side: POST /api/auth/dev/sign-in with the key signs DEV_SIGN_IN_EMAIL in. */
export function devSignIn(): BetterAuthPlugin {
  return {
    id: "dev-sign-in",
    endpoints: {
      devSignIn: createAuthEndpoint("/dev/sign-in", { method: "POST" }, async (ctx) => {
        const email = devSignInEmail();
        if (!email || ctx.request?.headers.get("x-dev-sign-in") !== DEV_SIGN_IN_KEY) throw new APIError("NOT_FOUND", { message: "Not here." });
        const found = await ctx.context.internalAdapter.findUserByEmail(email);
        if (!found?.user) throw new APIError("NOT_FOUND", { message: `No account for ${email}.` });
        const session = await ctx.context.internalAdapter.createSession(found.user.id);
        await setSessionCookie(ctx, { session, user: found.user });
        return ctx.json({ ok: true });
      }),
    },
  };
}
