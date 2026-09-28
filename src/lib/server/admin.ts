import { serverEnv } from "./env";

/** The site owner: an email in ADMIN_EMAILS (comma-separated). Codes and affiliate payouts are theirs to manage. */
export function isAdmin(user: { email: string } | null | undefined): boolean {
  if (!user) return false;
  const list = (serverEnv("ADMIN_EMAILS") ?? "").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);
  return list.includes(user.email.toLowerCase());
}
