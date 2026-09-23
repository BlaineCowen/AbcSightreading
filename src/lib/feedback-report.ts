/**
 * A tester's feedback report: what arrives from the browser, and the email it
 * becomes.
 *
 * Kept apart from the API route and from the Svelte panel so the rules can be
 * tested without standing up an HTTP server or a browser. The route is a thin
 * wrapper over `validateReport` and `composeEmail`.
 *
 * The button used to hand the whole thing to `mailto:`, which on a machine with
 * no desktop mail client does nothing whatsoever and says nothing about it -
 * the reporter types their report, presses the button, and the page sits there.
 * Every tester without Mail or Outlook configured was a report that never
 * arrived. Now the page posts it here and the server sends it.
 */

/** What the panel offers: a fault, or a suggestion. */
export type ReportKind = "bug" | "idea";

export type FeedbackReport = {
  kind: ReportKind;
  /** What the tester wrote. */
  message: string;
  /** The generator settings, already written out as lines a person can read. */
  context: string;
  /** The page they were on, settings and all. */
  href: string;
  userAgent: string;
  /** Viewport, as "1512x857". */
  screen: string;
};

/**
 * Caps, because this endpoint is reachable by anyone with the URL.
 *
 * Generous enough that no genuine report is turned away - 4,000 characters is
 * several paragraphs - and small enough that the endpoint cannot be used to
 * push arbitrary bulk through somebody else's mail provider.
 */
const LIMITS = {
  message: 4000,
  context: 2000,
  href: 2000,
  userAgent: 500,
  screen: 40,
} as const;

const KINDS: ReportKind[] = ["bug", "idea"];

export type Validated =
  | { ok: true; report: FeedbackReport }
  | { ok: false; error: string };

export function validateReport(input: unknown): Validated {
  if (typeof input !== "object" || input === null) {
    return { ok: false, error: "Expected a JSON object." };
  }
  const raw = input as Record<string, unknown>;

  const kind = raw.kind;
  if (typeof kind !== "string" || !KINDS.includes(kind as ReportKind)) {
    return { ok: false, error: `kind must be one of ${KINDS.join(", ")}.` };
  }

  // The message is the only part a person actually wrote, so it is the only
  // part that is required. Everything else is context the page collected and is
  // allowed to be missing - an older page, a blocked userAgent, a direct hit on
  // the endpoint. A report with no description is not worth sending.
  const message = typeof raw.message === "string" ? raw.message.trim() : "";
  if (!message) return { ok: false, error: "message is required." };
  if (message.length > LIMITS.message) {
    return { ok: false, error: `message must be at most ${LIMITS.message} characters.` };
  }

  const str = (value: unknown, max: number) =>
    typeof value === "string" ? value.trim().slice(0, max) : "";

  return {
    ok: true,
    report: {
      kind: kind as ReportKind,
      message,
      context: str(raw.context, LIMITS.context),
      href: str(raw.href, LIMITS.href),
      userAgent: str(raw.userAgent, LIMITS.userAgent),
      screen: str(raw.screen, LIMITS.screen),
    },
  };
}

/**
 * The email itself.
 *
 * Deliberately the same shape as the body the old `mailto:` link built, so the
 * reports that did arrive and the ones that arrive now read alike. Plain text:
 * there is nothing here that wants formatting, and plain text is what survives
 * every mail client.
 */
export function composeEmail(report: FeedbackReport): {
  subject: string;
  text: string;
} {
  const subject =
    report.kind === "bug"
      ? "Sight Reading: something is wrong"
      : "Sight Reading: an idea";

  // Only the parts that have something in them, and the divider only if
  // anything is going underneath it. A report that arrives with a bare heading
  // and nothing below reads like the page failed to collect anything.
  const facts = [
    report.context,
    report.href ? `Link: ${report.href}` : "",
    report.userAgent ? `Browser: ${report.userAgent}` : "",
    report.screen ? `Screen: ${report.screen}` : "",
  ].filter((line) => line !== "");

  const text = facts.length
    ? `${report.message}\n\n--- so this can be reproduced ---\n${facts.join("\n")}`
    : report.message;

  return { subject, text };
}
