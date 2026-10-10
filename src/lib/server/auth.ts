import { betterAuth } from "better-auth";
import { username } from "better-auth/plugins/username";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { stripe as stripePlugin } from "@better-auth/stripe";
import type Stripe from "stripe";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./db";
import { serverEnv } from "./env";
import { resetPasswordEmail, sendAccountEmail, verifyEmailEmail } from "./auth-email";
import { classlinkEmail, isStudentEmail } from "../roster";
import { EDUCATOR_ON_SALE } from "../plan";
import { PRICES, SEATS_PER_PACK, stripe, stripeWebhookSecret, taxReady } from "./stripe";
import { becomeEducator } from "./educator";
import { recordAffiliateSale, referralFor } from "./codes";
import { checkoutDiscount } from "../referral";

/**
 * A paid seat pack (src/pages/api/billing/seats.ts starts the checkout): 25
 * seats per pack for a year. Keyed by the checkout, so Stripe sending the
 * event twice grants it once.
 */
async function grantSeatPack(session: Stripe.Checkout.Session) {
  if (session.metadata?.kind !== "seat_pack" || session.payment_status !== "paid") return;
  const userId = session.metadata.userId;
  const packs = Number(session.metadata.packs);
  if (!userId || !Number.isInteger(packs) || packs < 1) return;
  const expiresAt = new Date();
  expiresAt.setFullYear(expiresAt.getFullYear() + 1);
  await prisma.seatGrant.upsert({
    where: { stripeCheckoutId: session.id },
    create: { userId, seats: packs * SEATS_PER_PACK, expiresAt, stripeCheckoutId: session.id },
    update: {},
  });
}

/**
 * Pro and Educator, yearly. Only when Stripe is configured, so a local server
 * without keys runs without billing rather than failing to start.
 */
const billing =
  stripe && stripeWebhookSecret
    ? [
        stripePlugin({
          stripeClient: stripe,
          stripeWebhookSecret,
          // A customer is made at checkout, not at sign-up: most accounts never
          // pay, and student accounts must never reach Stripe at all.
          createCustomerOnSignUp: false,
          subscription: {
            enabled: true,
            plans: [
              { name: "pro", lookupKey: PRICES.pro },
              { name: "educator", lookupKey: PRICES.educator },
            ],
            // Sales tax is worked out by Stripe Tax from the billing address;
            // a school district is marked tax-exempt on its customer and pays
            // no tax. Schools also get to enter a tax ID for their receipts.
            getCheckoutSessionParams: async (_data, req) => ({
              params: {
                // We are the seller: Stripe Tax works out the tax, schools are
                // made exempt on their customer, and prices include tax. The
                // live account has Stripe's Managed Payments (Stripe as the
                // merchant of record) on by default, which refuses a checkout
                // without automatic tax - so it is off for ours.
                managed_payments: { enabled: false },
                automatic_tax: { enabled: await taxReady() },
                billing_address_collection: "required",
                tax_id_collection: { enabled: true },
                // An advertiser's link applies their code; otherwise the buyer may type one.
                ...checkoutDiscount((await referralFor(req?.headers.get("cookie")))?.stripePromotionId ?? null),
              },
            }),
            onSubscriptionComplete: async ({ subscription, plan }) => {
              if (plan.name === "educator") await becomeEducator(subscription.referenceId);
            },
            // Pro -> Educator is an update of the same subscription.
            onSubscriptionUpdate: async ({ subscription }) => {
              if (subscription.plan === "educator" && ["active", "trialing"].includes(subscription.status ?? "")) {
                await becomeEducator(subscription.referenceId);
              }
            },
          },
          onEvent: async (event) => {
            if (event.type === "checkout.session.completed") {
              await grantSeatPack(event.data.object);
              await recordAffiliateSale(event.data.object);
            }
          },
        }),
      ]
    : [];

/** Whether checkout can be offered on this deployment. */
export const billingEnabled = billing.length > 0;

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
const classlinkId = serverEnv("CLASSLINK_CLIENT_ID");
const classlinkSecret = serverEnv("CLASSLINK_CLIENT_SECRET");

/**
 * ClassLink single sign-on (notes/rostering-setup.md): a student clicks our
 * tile in their district's LaunchPad, or "Sign in with ClassLink" on the
 * login page, and is signed in. Their account is keyed by ClassLink's UserId.
 * A student's account gets no email (the same placeholder a class roster
 * gives, so it is a student account, src/lib/roster.ts); a teacher's keeps
 * the district email. Only when configured.
 */
type ClassLinkInfo = { UserId?: number | string; Email?: string; FirstName?: string; LastName?: string; Role?: string; Role_Level?: number | string };
const classlink =
  classlinkId && classlinkSecret
    ? [
        genericOAuth({
          config: [
            {
              providerId: "classlink",
              clientId: classlinkId,
              clientSecret: classlinkSecret,
              authorizationUrl: "https://launchpad.classlink.com/oauth2/v2/auth",
              tokenUrl: "https://launchpad.classlink.com/oauth2/v2/token",
              scopes: ["profile"],
              pkce: false,
              getUserInfo: async (tokens) => {
                const res = await fetch("https://nodeapi.classlink.com/v2/my/info", { headers: { Authorization: `Bearer ${tokens.accessToken}` } });
                if (!res.ok) return null;
                const me = (await res.json()) as ClassLinkInfo;
                if (me.UserId === undefined || me.UserId === null || me.UserId === "") return null;
                const id = String(me.UserId);
                const student = me.Role?.toLowerCase() === "student" || String(me.Role_Level) === "4";
                const name = [me.FirstName, me.LastName].filter(Boolean).join(" ").trim() || (student ? "Student" : "Teacher");
                return {
                  id,
                  name,
                  // A district can put any address on a ClassLink account, so it
                  // never signs anyone into an account made another way.
                  email: student || !me.Email ? classlinkEmail(id, student) : me.Email.toLowerCase(),
                  emailVerified: false,
                };
              },
            },
          ],
        }),
      ]
    : [];

export const auth = betterAuth({
  baseURL: url,
  secret: serverEnv("BETTER_AUTH_SECRET"),
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  // The origins a sign-in form may post from. The dev server listens on the
  // LAN too (`--host`), so a phone on the network is trusted locally, and so
  // is a `tailscale serve` link to it (https://<machine>.<tailnet>.ts.net:<port>).
  trustedOrigins: [
    url,
    ...(import.meta.env.DEV ? ["http://localhost:4321", "http://*:4321", "https://*.ts.net", "https://*.ts.net:*"] : []),
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
      ? {
          google: {
            clientId: googleId,
            clientSecret: googleSecret,
            // Choose which Google account each time: a teacher's school one, a student's school one.
            prompt: "select_account",
            // A refresh token, so a class can sync from Google Classroom again later.
            accessType: "offline",
            // A Google sign-in makes an account only when asked to (AuthForm passes
            // requestSignUp): the student tab's button signs in students their
            // teacher brought in from Google Classroom, and nobody else.
            disableImplicitSignUp: true,
          },
        }
      : {},
  account: {
    accountLinking: {
      // A teacher connects their school Google account to Classroom from an
      // account made with another email (src/lib/classroom.ts).
      allowDifferentEmails: true,
    },
  },
  databaseHooks: {
    user: {
      create: {
        // An account with no real email is a student's: a roster's, or ClassLink's.
        before: async (user) => (isStudentEmail(user.email) ? { data: { ...user, accountType: "student" } } : { data: user }),
      },
    },
    account: {
      // A student signs in with Google or ClassLink, but we keep only the link to
      // that account, never its tokens (the ID token carries their email).
      create: { after: async (account) => stripStudentTokens(account) },
      update: { after: async (account) => stripStudentTokens(account) },
    },
  },
  user: {
    deleteUser: {
      enabled: true,
      // A teacher's students go with the teacher: the accounts their roster or
      // class codes made, unless another teacher's class also has them. The
      // database cascade would otherwise leave them classless, holding a
      // child's name with no one to manage it.
      beforeDelete: async (user) => {
        // A deleted account must not go on being charged.
        if (stripe) {
          const subs = await prisma.subscription.findMany({
            where: { referenceId: user.id, status: { in: ["active", "trialing", "past_due"] }, stripeSubscriptionId: { not: null } },
            select: { stripeSubscriptionId: true },
          });
          for (const s of subs) await stripe.subscriptions.cancel(s.stripeSubscriptionId!);
        }
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
    ...classlink,
    ...billing,
  ],
  hooks: {
    // Students do not buy plans: they may be children, and their class gives
    // them what they need.
    before: createAuthMiddleware(async (ctx) => {
      if (!ctx.path.startsWith("/subscription/")) return;
      if (!EDUCATOR_ON_SALE && ctx.path === "/subscription/upgrade" && (ctx.body as { plan?: string } | undefined)?.plan === "educator") {
        throw new APIError("FORBIDDEN", { message: "The Educator plan is coming soon." });
      }
      const session = await getSessionFromCtx(ctx);
      if (session?.user && (session.user as { accountType?: string }).accountType === "student") {
        throw new APIError("FORBIDDEN", { message: "Student accounts cannot buy a plan." });
      }
    }),
  },
  session: {
    // Checks the session from a signed cookie for five minutes before going
    // back to the database - most requests then cost no query.
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  // Serverless instances do not share memory, so a per-instance limit is not
  // one. The database is shared.
  //
  // The limit is per client IP and path, and a whole school can share one IP.
  // Every page asks /get-session, so thirty students opening a page together
  // passed the default 100 in 10 s, and the page took each of them for signed
  // out (a QA run on production hit it at 85 page loads). /get-session only
  // reads the signed cookie, so it is not limited; sign-in, sign-up and
  // password resets keep Better Auth's strict rules (3 per 10 s or 60 s).
  rateLimit: {
    enabled: true,
    storage: "database",
    customRules: { "/get-session": false },
  },
  // Vercel sets x-vercel-forwarded-for to the client's address and replaces
  // any x-forwarded-for a client sends; read Vercel's own header first.
  advanced: {
    ipAddress: { ipAddressHeaders: ["x-vercel-forwarded-for", "x-forwarded-for"] },
  },
});

/** Whether "Continue with Google" should be shown. */
export const googleEnabled = !!(googleId && googleSecret);
/** Whether "Sign in with ClassLink" should be shown. */
export const classlinkEnabled = classlink.length > 0;

async function stripStudentTokens(account: { id: string; userId: string; providerId: string; accessToken?: string | null; refreshToken?: string | null; idToken?: string | null }) {
  if (account.providerId === "credential" || !(account.accessToken || account.refreshToken || account.idToken)) return;
  const user = await prisma.user.findUnique({ where: { id: account.userId }, select: { accountType: true } });
  if (user?.accountType !== "student") return;
  await prisma.account.update({
    where: { id: account.id },
    data: { accessToken: null, refreshToken: null, idToken: null, accessTokenExpiresAt: null, refreshTokenExpiresAt: null },
  });
}

export type AuthSession = typeof auth.$Infer.Session;
