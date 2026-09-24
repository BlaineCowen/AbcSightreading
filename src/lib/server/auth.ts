import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./db";
import { serverEnv } from "./env";
import { resetPasswordEmail, sendAccountEmail, verifyEmailEmail } from "./auth-email";

/**
 * Where this deployment is reached, for links in emails and the Google
 * callback. BETTER_AUTH_URL wins when set. Otherwise Vercel's own variables:
 * production uses the project's production domain, a preview uses its branch
 * alias - stable across pushes, so it can be registered with Google once,
 * which a per-deployment URL cannot.
 */
function baseURL(): string {
  const explicit = serverEnv("BETTER_AUTH_URL");
  if (explicit) return explicit;
  const host =
    serverEnv("VERCEL_ENV") === "production"
      ? serverEnv("VERCEL_PROJECT_PRODUCTION_URL")
      : serverEnv("VERCEL_BRANCH_URL") ?? serverEnv("VERCEL_URL");
  return host ? `https://${host}` : "http://localhost:4321";
}

const url = baseURL();

const googleId = serverEnv("GOOGLE_CLIENT_ID");
const googleSecret = serverEnv("GOOGLE_CLIENT_SECRET");

export const auth = betterAuth({
  baseURL: url,
  secret: serverEnv("BETTER_AUTH_SECRET"),
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  // The origins a sign-in form may post from. The dev server listens on the
  // LAN too (`--host`), so a phone on the network is trusted locally.
  trustedOrigins: [
    url,
    ...(import.meta.env.DEV ? ["http://localhost:4321", "http://*:4321"] : []),
    ...["VERCEL_URL", "VERCEL_BRANCH_URL", "VERCEL_PROJECT_PRODUCTION_URL"]
      .map((name) => serverEnv(name))
      .filter((host): host is string => !!host)
      .map((host) => `https://${host}`),
  ],
  emailAndPassword: {
    enabled: true,
    // Unverified accounts can still sign in and save presets. Verification
    // matters once money is involved; the email goes out now so most accounts
    // are verified by then.
    requireEmailVerification: false,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      const { subject, text } = resetPasswordEmail(url);
      await sendAccountEmail(user.email, subject, text);
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      const { subject, text } = verifyEmailEmail(url);
      await sendAccountEmail(user.email, subject, text);
    },
  },
  // Only offered when configured, so a missing key hides the button rather
  // than sending people to a Google error page.
  socialProviders:
    googleId && googleSecret
      ? { google: { clientId: googleId, clientSecret: googleSecret } }
      : {},
  user: {
    deleteUser: { enabled: true },
  },
  session: {
    // Checks the session from a signed cookie for five minutes before going
    // back to the database - most requests then cost no query.
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  // Serverless instances do not share memory, so a per-instance limit is not
  // one. The database is shared.
  rateLimit: { enabled: true, storage: "database" },
});

/** Whether "Continue with Google" should be shown. */
export const googleEnabled = !!(googleId && googleSecret);

export type AuthSession = typeof auth.$Infer.Session;
