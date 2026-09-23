/**
 * Where a tester's feedback is sent, or null when feedback is switched off.
 *
 * Server-side only, and that is the point. The address used to be
 * PUBLIC_FEEDBACK_EMAIL, which Astro puts in the browser, so it was written
 * into the markup of every page for anything crawling the site to collect.
 * Now the browser posts the report to /api/feedback and the server decides
 * where it goes, so the address never leaves the server. FEEDBACK_TO is the
 * name for it; PUBLIC_FEEDBACK_EMAIL is still read so an environment that has
 * only the old name keeps working.
 *
 * Read at REQUEST time first, and only then from the build.
 *
 * Reading `import.meta.env` alone would mean Astro inlines the value when the
 * site is built, and a build environment without the variable bakes in
 * `undefined` - which hides the button with no way to tell from the outside
 * that anything is wrong. Every page is `output: "server"`, so the server can
 * just ask for the variable on each request, and how the platform provides it
 * stops mattering.
 */

/** Warned once per server instance, rather than once per request. */
let warned = false;

/** An address, loosely: one @, a dot in the domain, no spaces. */
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function readFeedbackEmail(
  /** `process.env` as the server sees it now. */
  runtime: Record<string, string | undefined>,
  /** The build-time value, for whichever name is set. */
  buildTime: string | undefined
): string | null {
  const raw = (
    runtime.FEEDBACK_TO ??
    runtime.PUBLIC_FEEDBACK_EMAIL ??
    buildTime ??
    ""
  ).trim();

  if (!raw) {
    warn(
      "FEEDBACK_TO is not set in this environment, so the Feedback button is " +
        "hidden. Set it on the project to switch the button on."
    );
    return null;
  }

  // A value that is not an address cannot be sent to, and the button would look
  // broken rather than absent. Say which value is wrong and hide it.
  if (!LOOKS_LIKE_EMAIL.test(raw)) {
    warn(
      `FEEDBACK_TO is set to ${JSON.stringify(raw)}, which is not an email ` +
        "address, so the Feedback button is hidden."
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
