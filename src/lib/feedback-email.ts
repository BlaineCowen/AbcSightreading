/**
 * Where the in-app Feedback button sends reports, or null for no button.
 *
 * The address is opt-in per environment, because an address written into the
 * markup is an address that gets scraped. Unset means the button does not
 * appear at all.
 *
 * Read at REQUEST time first, and only then from the build.
 *
 * Layout.astro used to read `import.meta.env.PUBLIC_FEEDBACK_EMAIL` alone,
 * which Astro inlines when the site is built. A build environment that does
 * not have the variable leaves `undefined` in the bundle, and the button
 * silently disappears - which is what happened in production: the variable was
 * set on the Vercel project, the build never received it, every page shipped
 * without a Feedback button for days, and nothing anywhere said so. It was
 * found by curling the live HTML, not from a log.
 *
 * Every page is `output: "server"`, so the server can simply ask for the
 * variable on each request. Then it no longer matters whether the platform
 * hands it to the build, the runtime, or both.
 */

/** Warned once per server instance, rather than once per request. */
let warned = false;

/** An address, loosely: one @, a dot in the domain, no spaces. */
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function readFeedbackEmail(
  /** `process.env` as the server sees it now. */
  runtime: Record<string, string | undefined>,
  /** `import.meta.env.PUBLIC_FEEDBACK_EMAIL`, inlined at build time. */
  buildTime: string | undefined
): string | null {
  const raw = (runtime.PUBLIC_FEEDBACK_EMAIL ?? buildTime ?? "").trim();

  if (!raw) {
    warn(
      "PUBLIC_FEEDBACK_EMAIL is not set in this environment, so the Feedback " +
        "button is hidden. Set it on the project to switch the button on."
    );
    return null;
  }

  // A value that is not an address would render a mailto nobody can send, and
  // the button would look broken rather than absent. Say so and hide it.
  if (!LOOKS_LIKE_EMAIL.test(raw)) {
    warn(
      `PUBLIC_FEEDBACK_EMAIL is set to ${JSON.stringify(raw)}, which is not an ` +
        "email address, so the Feedback button is hidden."
    );
    return null;
  }

  return raw;
}

function warn(message: string): void {
  if (warned) return;
  warned = true;
  console.warn(`[feedback] ${message}`);
}
