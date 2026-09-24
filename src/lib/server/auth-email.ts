import { Resend } from "resend";
import { serverEnv } from "./env";

/** A verified Resend sending domain - the one feedback mail already uses. */
const DEFAULT_FROM = "ABC Sight Reading <accounts@send.abc-sightreading.com>";

/**
 * Send one account email: a password reset or an address check.
 *
 * Without RESEND_API_KEY this logs the link instead of throwing, so sign-up
 * and reset can still be exercised locally - the link lands in the dev
 * server's output. In a deployed build a missing key is a configuration fault,
 * and is reported as one.
 */
export async function sendAccountEmail(to: string, subject: string, text: string) {
  const apiKey = serverEnv("RESEND_API_KEY");
  if (!apiKey) {
    if (import.meta.env.DEV) {
      console.info(`[auth-email] RESEND_API_KEY unset; would send to ${to}:\n${subject}\n${text}`);
      return;
    }
    throw new Error("Account email is not configured: no RESEND_API_KEY.");
  }
  const { error } = await new Resend(apiKey).emails.send({
    from: serverEnv("AUTH_EMAIL_FROM") ?? DEFAULT_FROM,
    to: [to],
    subject,
    text,
  });
  if (error) {
    console.error("[auth-email] Resend refused the message:", error);
    throw new Error("Could not send the email.");
  }
}

export function resetPasswordEmail(url: string) {
  return {
    subject: "Reset your ABC Sight Reading password",
    text: [
      "Someone asked to reset the password for this ABC Sight Reading account.",
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
    subject: "Confirm your email for ABC Sight Reading",
    text: [
      "Welcome to ABC Sight Reading.",
      "",
      "Confirm this is your address by opening this link:",
      url,
      "",
      "If you did not create an account, ignore this email.",
    ].join("\n"),
  };
}
