/**
 * Founding teachers (Blaine, 16 October 2026): the offer that gets teachers
 * using the app with their classes while it is new. A teacher who joins on
 * /founders before the offer closes gets the Educator plan free through the
 * end of May 2027 with FOUNDER_SEATS student seats, and 50% off Educator for
 * as long as they renew after that. The rules are here (tests
 * founders.test.ts), the database side in src/lib/server/founders.ts.
 */

/** The last day Educator is free, end of the day in Texas. */
export const FOUNDER_FREE_UNTIL = "2027-05-31";
/** Student seats while it is free (the plan's own 100 and a grant for the rest). */
export const FOUNDER_SEATS = 300;
/** Percent off Educator once the free time ends, for as long as they renew. */
export const FOUNDER_DISCOUNT = 50;
/** The last day to join, unless FOUNDERS_CLOSE says otherwise. */
export const FOUNDERS_CLOSE_DEFAULT = "2027-01-31";

/** Midnight at the end of an ISO day in US Central (UTC-6 in winter, -5 in summer; the later is taken). */
export const endOfDay = (iso: string) => new Date(Date.parse(`${iso}T00:00:00Z`) + 86_400_000 + 6 * 3_600_000);

export const founderEndsAt = () => endOfDay(FOUNDER_FREE_UNTIL);

/** Whether the offer is open: switched on, and not past its closing day. */
export function foundersOpen(close: string | undefined, enabled: string | undefined, now = new Date()) {
  if (enabled === "0") return false;
  const day = close && !Number.isNaN(Date.parse(close)) ? close : FOUNDERS_CLOSE_DEFAULT;
  return now < endOfDay(day);
}

export type FounderCheck = {
  open: boolean;
  signedIn: boolean;
  accountType?: string;
  emailVerified?: boolean;
  disposable?: boolean;
  already?: boolean;
};

export type FounderDecision =
  | { ok: true }
  | { ok: false; reason: string; step?: "sign-in" | "confirm" | "joined" };

/**
 * Who may join. A teacher's account (never a student's), with a confirmed
 * email that is not a throwaway one, since each founder gets 300 free seats.
 * Someone who has joined is told so, even after the offer closes.
 */
export function founderDecision(c: FounderCheck): FounderDecision {
  if (c.already) return { ok: false, reason: "You're a founding teacher.", step: "joined" };
  if (!c.open) return { ok: false, reason: "The founding teacher offer has closed." };
  if (!c.signedIn) return { ok: false, reason: "Create a free account or sign in to join.", step: "sign-in" };
  if (c.accountType === "student") return { ok: false, reason: "The founding teacher offer is for teachers' accounts." };
  if (c.disposable) return { ok: false, reason: "Use your school or personal email to join, not a throwaway address." };
  if (!c.emailVerified) return { ok: false, reason: "Confirm your email first: the link is in the email we sent when you signed up.", step: "confirm" };
  return { ok: true };
}
