import { Resend } from "resend";
import { serverEnv } from "./env";

/** A verified Resend sending domain - the one feedback mail already uses. */
const DEFAULT_FROM = "abcSightReading <accounts@send.abc-sightreading.com>";

/**
 * Send one account email: a password reset or an address check.
 *
 * Without RESEND_API_KEY this logs the link instead of throwing, so sign-up
 * and reset can still be exercised locally - the link lands in the dev
 * server's output. In a deployed build a missing key is a configuration fault,
 * and is reported as one.
 */
export async function sendAccountEmail(
  to: string | string[],
  subject: string,
  text: string,
  attachments?: { filename: string; content: Buffer }[],
  /** A quote sent in a teacher's name: the teacher copied, and replies to them. */
  opts?: { cc?: string[]; replyTo?: string }
) {
  const apiKey = serverEnv("RESEND_API_KEY");
  if (!apiKey) {
    if (import.meta.env.DEV) {
      console.info(`[auth-email] RESEND_API_KEY unset; would send to ${[to].flat().join(", ")}${opts?.cc?.length ? ` (cc ${opts.cc.join(", ")})` : ""}:\n${subject}\n${text}`);
      return;
    }
    throw new Error("Account email is not configured: no RESEND_API_KEY.");
  }
  const { error } = await new Resend(apiKey).emails.send({
    from: serverEnv("AUTH_EMAIL_FROM") ?? DEFAULT_FROM,
    to: [to].flat(),
    subject,
    text,
    ...(attachments ? { attachments } : {}),
    ...(opts?.cc?.length ? { cc: opts.cc } : {}),
    ...(opts?.replyTo ? { replyTo: opts.replyTo } : {}),
  });
  if (error) {
    console.error("[auth-email] Resend refused the message:", error);
    throw new Error("Could not send the email.");
  }
}

export function resetPasswordEmail(url: string) {
  return {
    subject: "Reset your abcSightReading password",
    text: [
      "Someone asked to reset the password for this abcSightReading account.",
      "",
      `To choose a new password, open this link within the hour:`,
      url,
      "",
      "If that was not you, ignore this email - your password has not changed.",
    ].join("\n"),
  };
}

export function verifyEmailEmail(url: string) {
  return {
    subject: "Confirm your email for abcSightReading",
    text: [
      "Welcome to abcSightReading.",
      "",
      "Confirm this is your address by opening this link:",
      url,
      "",
      "If you did not create an account, ignore this email.",
    ].join("\n"),
  };
}
