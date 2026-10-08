/**
 * Recent exercises: what a signed-in person generated last, for the home page
 * (HomeDashboard.svelte, /api/recent, the RecentExercise table). Each is a
 * link that reopens that exact exercise with the settings it was shown in -
 * the same link Share's "Link to this exercise" gives - so nothing about the
 * exercise is stored but the link itself.
 */

export const RECENT_PAGES = ["unison", "choral"] as const;
export type RecentPage = (typeof RECENT_PAGES)[number];

/** How many are kept per person; older ones are dropped as new ones arrive. */
export const MAX_RECENT = 20;
export const MAX_TITLE_LENGTH = 120;
export const MAX_DETAIL_LENGTH = 200;
/** A packed exercise is a few KB; this leaves room and refuses anything silly. */
export const MAX_LINK_LENGTH = 12_000;

export type NewRecent = { page: RecentPage; title: string; detail: string; link: string };
export type RecentExercise = NewRecent & { id: string; createdAt: number };

/**
 * Only this site's own practice pages, as a path: the home page shows these
 * as links, so a stored link must never be able to send anyone elsewhere.
 */
const LINK_FOR: Record<RecentPage, RegExp> = {
  unison: /^\/sightreading(\?[^#\s]*)?(#[^\s]*)?$/,
  choral: /^\/choral-sightreading(\?[^#\s]*)?(#[^\s]*)?$/,
};

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function checkRecent(body: unknown): { ok: true; value: NewRecent } | { ok: false; error: string } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const page = b.page;
  if (!RECENT_PAGES.includes(page as RecentPage)) return { ok: false, error: "Unknown page." };
  const link = typeof b.link === "string" ? b.link : "";
  if (!link || link.length > MAX_LINK_LENGTH || !LINK_FOR[page as RecentPage].test(link))
    return { ok: false, error: "Not a link to this page." };
  const title = text(b.title, MAX_TITLE_LENGTH);
  if (!title) return { ok: false, error: "No title." };
  return { ok: true, value: { page: page as RecentPage, title, detail: text(b.detail, MAX_DETAIL_LENGTH), link } };
}

/** The path, query and fragment of a URL on this site (what a link stores). */
export function sitePath(href: string): string {
  const u = new URL(href, "https://example.invalid");
  return u.pathname + u.search + u.hash;
}

/** "just now", "5 min ago", "3 h ago", "yesterday", "4 days ago", then the date. */
export function whenLabel(at: number, now = Date.now()): string {
  const s = Math.max(0, (now - at) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`;
  const days = Math.floor(s / 86_400);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
