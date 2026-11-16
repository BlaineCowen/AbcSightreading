import { serverEnv } from "./env";

/** The site owner: an email in ADMIN_EMAILS or ADMIN_EMAIL (comma-separated). Codes and affiliate payouts are theirs to manage. */
export function isAdmin(user: { email: string } | null | undefined): boolean {
  if (!user) return false;
  // ADMIN_EMAILS and ADMIN_EMAIL together (they replaced each other until 16
  // November 2026, when Blaine's HISD account joined his first one as an owner).
  const list = [serverEnv("ADMIN_EMAILS"), serverEnv("ADMIN_EMAIL")]
    .join(",")
    .toLowerCase()
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return list.includes(user.email.toLowerCase());
}
