import type { APIRoute } from "astro";
import { Resend } from "resend";
import { readFeedbackEmail } from "../../lib/feedback-email";
import { composeEmail, validateReport } from "../../lib/feedback-report";

/**
 * Sends a tester's feedback as an email.
 *
 * The Feedback panel used to hand its report to a `mailto:` link, which asks
 * the reporter's own machine to open a mail client. On a machine without one
 * configured - a Chromebook, or any desktop Chrome where mail is webmail -
 * that does nothing at all and reports nothing, so the tester types their
 * report, presses the button and watches the page do nothing. Those reports
 * were simply lost. This route sends the mail server-side instead, so the
 * reporter needs nothing installed and the destination address never reaches
 * the browser.
 *
 * Reachable by anyone who knows the URL, so: length caps in validateReport, a
 * rate limit below, and nothing in the payload is ever interpreted - the
 * report is sent as plain text to one fixed address that the client cannot
 * influence.
 */

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/** Who the mail is from. A verified Resend sending domain. */
const DEFAULT_FROM = "ABC Sight Reading <feedback@send.abc-sightreading.com>";

/**
 * A rate limit that holds within one server instance.
 *
 * Deliberately modest about what it is: serverless instances come and go and
 * requests spread across them, so this is not a global limit and cannot be.
 * What it does do is stop one browser, or one script, from pushing thousands of
 * messages through a single warm instance, which is the realistic abuse here.
 * Anything determined needs a shared store, and that is not worth a dependency
 * for a feedback box on a choir practice tool.
 */
const WINDOW_MS = 10 * 60 * 1000;
const PER_IP = 5;
const PER_INSTANCE = 60;
const seen = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  let total = 0;
  // Drop what has aged out, of every caller, so the map cannot grow without
  // bound on an instance that stays warm.
  for (const [key, times] of seen) {
    const fresh = times.filter((t) => now - t < WINDOW_MS);
    if (fresh.length === 0) seen.delete(key);
    else {
      seen.set(key, fresh);
      total += fresh.length;
    }
  }
  if (total >= PER_INSTANCE) return true;
  const mine = seen.get(ip) ?? [];
  if (mine.length >= PER_IP) return true;
  seen.set(ip, [...mine, now]);
  return false;
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const env = (globalThis as any).process?.env ?? {};

  const to = readFeedbackEmail(
    env,
    import.meta.env.FEEDBACK_TO ?? import.meta.env.PUBLIC_FEEDBACK_EMAIL
  );
  // Under `astro dev`, Vite loads .env into `import.meta.env` and not into
  // `process.env`, so reading the runtime environment alone never finds the key
  // locally and every local send answers 503. In a deployed build the platform
  // provides it at runtime, and falling back to the build-time value there
  // would bake the key into the server bundle - so that fallback is dev only.
  const apiKey =
    env.RESEND_API_KEY ??
    (import.meta.env.DEV ? import.meta.env.RESEND_API_KEY : undefined);

  // Configuration, not the caller's fault - so say so plainly rather than
  // returning a generic failure. The panel falls back to showing the report
  // for the tester to copy, so a misconfigured server still does not lose it.
  if (!to) {
    return json({ error: "Feedback is not configured: no destination address." }, 503);
  }
  if (!apiKey) {
    return json({ error: "Feedback is not configured: no mail provider key." }, 503);
  }

  const ip = clientAddress || request.headers.get("x-forwarded-for") || "unknown";
  if (rateLimited(ip)) {
    return json({ error: "Too many reports from here just now. Try again shortly." }, 429);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Expected a JSON body." }, 400);
  }

  const checked = validateReport(body);
  if (!checked.ok) return json({ error: checked.error }, 400);

  const { subject, text } = composeEmail(checked.report);

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: env.FEEDBACK_FROM || import.meta.env.FEEDBACK_FROM || DEFAULT_FROM,
      to: [to],
      subject,
      text,
    });
    if (error) {
      // The provider's own message goes to the deploy logs, not to the caller:
      // it can name the sending domain and the account. The caller gets the
      // address to send to by hand, so a provider outage does not turn a
      // written report into nothing. That does hand the address to anyone who
      // can make a send fail, which is a far smaller exposure than the page
      // markup it used to sit in on every request.
      console.error("[feedback] Resend refused the message:", error);
      return json({ error: "The mail provider refused the message.", contact: to }, 502);
    }
  } catch (e: any) {
    console.error("[feedback] send failed:", e?.message ?? e);
    return json({ error: "Could not send the message.", contact: to }, 502);
  }

  return json({ ok: true });
};

/** Anything but POST, so a stray GET gets an answer rather than a stack trace. */
export const ALL: APIRoute = () =>
  json({ error: "POST a feedback report here." }, 405);
