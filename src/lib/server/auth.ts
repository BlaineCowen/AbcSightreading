import { betterAuth } from "better-auth";
import { username } from "better-auth/plugins/username";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./db";
import { serverEnv } from "./env";
import { resetPasswordEmail, sendAccountEmail, verifyEmailEmail } from "./auth-email";
import { isStudentEmail } from "../roster";

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
      // A student account has no mailbox; its teacher resets the password.
      if (isStudentEmail(user.email)) return;
      const { subject, text } = resetPasswordEmail(url);
      await sendAccountEmail(user.email, subject, text);
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      if (isStudentEmail(user.email)) return;
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
    deleteUser: {
      enabled: true,
      // A teacher's students go with the teacher: the accounts their roster or
      // class codes made, unless another teacher's class also has them. The
      // database cascade would otherwise leave them classless, holding a
      // child's name with no one to manage it.
      beforeDelete: async (user) => {
        const managed = await prisma.enrollment.findMany({
          where: { managed: true, class: { userId: user.id } },
          select: { studentId: true },
        });
        for (const id of new Set(managed.map((e) => e.studentId))) {
          const elsewhere = await prisma.enrollment.count({
            where: { studentId: id, class: { userId: { not: user.id } } },
          });
          if (!elsewhere) await prisma.user.delete({ where: { id } });
        }
      },
    },
    additionalFields: {
      // standard | educator | student. Set by the server, never by a form.
      accountType: { type: "string", defaultValue: "standard", input: false },
    },
  },
  plugins: [
    // Students sign in with a username - "ktz482.maria.g", class code first
    // (src/lib/roster.ts) - and no email. No separate display name: the less
    // a child's account holds, the better.
    username({
      minUsernameLength: 3,
      maxUsernameLength: 40,
      usernameValidator: (u) => /^[a-z0-9.]+$/.test(u),
      displayUsername: false,
    }),
  ],
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
