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

/** Mail services anyone can sign up for: never a school's address, whatever the name. */
const PERSONAL_MAIL = new Set(
  `gmail.com googlemail.com yahoo.com ymail.com outlook.com hotmail.com live.com msn.com icloud.com me.com mac.com
  aol.com proton.me protonmail.com gmx.com gmx.net mail.com zoho.com yandex.com fastmail.com hey.com comcast.net
  att.net sbcglobal.net verizon.net charter.net cox.net bellsouth.net earthlink.net`.split(/\s+/)
);

/**
 * Whether an address is plainly a school's or a district's, so the teacher
 * behind it joins without applying. Errs towards no: a school address it
 * misses only means applying. Texas districts end their names in isd (austinisd.org,
 * katyisd.org, fortbendisd.com) and California's in usd (lausd.net, sfusd.edu);
 * k12 anywhere (k12.ca.us, ccsd.k12.nv.us); schools (jeffcoschools.us,
 * schools.nyc.gov); sd and a number (sd43.bc.ca); a public-schools .edu;
 * and abroad a label edu, sch or school (edu.au, sch.uk, school.nz).
 */
export function isSchoolEmail(email: string): boolean {
  const domain = email.trim().toLowerCase().split("@")[1] ?? "";
  if (!domain || PERSONAL_MAIL.has(domain)) return false;
  const labels = domain.split(".");
  if (/(^|\.)k12/.test(domain)) return true;
  const name = labels.slice(0, -1);
  if (name.some((l) => /^[a-z0-9-]+(isd|usd)$/.test(l) || /schools?$/.test(l) || /^i?sd\d+$/.test(l))) return true;
  // A .edu is as often a university (whose students are not teachers), so
  // only a public-schools name there: cps.edu, fcps.edu, dcps.edu.
  if (labels.at(-1) === "edu") return name.some((l) => /^[a-z]{1,4}ps$/.test(l));
  // Abroad, schools sit under a label of their own: edu.au, sch.uk, school.nz.
  return name.some((l) => l === "edu" || l === "sch" || l === "school");
}

export type FounderCheck = {
  open: boolean;
  signedIn: boolean;
  accountType?: string;
  emailVerified?: boolean;
  disposable?: boolean;
  already?: boolean;
  /** Plainly a teacher: signed in through a district's ClassLink, or a school email. */
  proven?: boolean;
  /** Their application, when they made one (personal email). */
  application?: "pending" | "approved" | "declined" | null;
  /** Another account behind the same address (emailKey) is already a founder. */
  personJoined?: boolean;
};

export type FounderDecision =
  | { ok: true }
  | { ok: false; reason: string; step?: "sign-in" | "confirm" | "joined" | "apply" | "pending" };

/**
 * Who may join. A teacher's account (never a student's), with a confirmed
 * email that is not a throwaway one, since each founder gets 300 free seats
 * and their students get Pro. And a teacher: a school email or ClassLink
 * joins at once; anyone else applies with their school, and the owner
 * approves (that joins them). One per person, by emailKey. Someone who has
 * joined is told so, even after the offer closes.
 */
export function founderDecision(c: FounderCheck): FounderDecision {
  if (c.already) return { ok: false, reason: "You're a founding teacher.", step: "joined" };
  if (!c.open) return { ok: false, reason: "The founding teacher offer has closed." };
  if (!c.signedIn) return { ok: false, reason: "Create a free account or sign in to join.", step: "sign-in" };
  if (c.accountType === "student") return { ok: false, reason: "The founding teacher offer is for teachers' accounts." };
  if (c.disposable) return { ok: false, reason: "Use your school or personal email to join, not a throwaway address." };
  if (!c.emailVerified) return { ok: false, reason: "Confirm your email first: the link is in the email we sent when you signed up.", step: "confirm" };
  if (c.personJoined) return { ok: false, reason: "Another account with this email address has already joined. Sign in with that one." };
  if (!c.proven) {
    if (c.application === "pending") return { ok: false, reason: "Thanks! We're checking your school and will email you, usually within a day.", step: "pending" };
    if (c.application === "declined")
      return { ok: false, reason: "We couldn't confirm you teach at that school. Write to support@abc-sightreading.com and we'll sort it out." };
    return { ok: false, reason: "Tell us where you teach. A school email joins at once; with a personal one we check first.", step: "apply" };
  }
  return { ok: true };
}

export type FounderApplicationInput = { school: string; district: string; role: string; proofUrl: string; note: string };

/** An application as sent: each field there and short, and the proof a web address. */
export function checkApplication(body: unknown): { ok: true; value: FounderApplicationInput } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const text = (k: string, max: number) => (typeof b[k] === "string" ? (b[k] as string).trim().slice(0, max) : "");
  const value = { school: text("school", 120), district: text("district", 120), role: text("role", 80), proofUrl: text("proofUrl", 400), note: text("note", 600) };
  if (!value.school) return { ok: false, error: "Which school do you teach at?" };
  if (!value.district) return { ok: false, error: "Which district (or city, for a private school)?" };
  if (!value.role) return { ok: false, error: "What do you teach?" };
  let url: URL | null = null;
  try {
    url = new URL(/^https?:\/\//i.test(value.proofUrl) ? value.proofUrl : `https://${value.proofUrl}`);
  } catch {}
  if (!url || !url.hostname.includes(".")) return { ok: false, error: "Add a link to a page that lists you: the school's staff directory, or your page on its website." };
  return { ok: true, value: { ...value, proofUrl: url.toString() } };
}
