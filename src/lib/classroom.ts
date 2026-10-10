/**
 * Google Classroom rosters (server side in src/lib/server/classroom.ts; tests
 * classroom.test.ts). A teacher connects their Google account once, picks one
 * of their Classroom classes, and its students come in as student accounts
 * linked to their Google accounts: they sign in with Continue with Google, no
 * codes or passwords. Syncing again adds whoever joined since and lists who
 * left, without removing anyone on its own.
 *
 * A student's account keeps the Google account's ID (Classroom's userId is
 * the same number as the Google sign-in's subject), never their email.
 */

/** What the teacher's Google account must grant: read their classes and who is in them. */
export const CLASSROOM_SCOPES = [
  "https://www.googleapis.com/auth/classroom.courses.readonly",
  "https://www.googleapis.com/auth/classroom.rosters.readonly",
];

/** Whether an account's granted scopes (Better Auth keeps them comma separated) cover the import. */
export const hasClassroomScopes = (scope: string | null | undefined) => {
  const granted = new Set((scope ?? "").split(/[,\s]+/).filter(Boolean));
  return CLASSROOM_SCOPES.every((s) => granted.has(s));
};

export const rosterSourceFor = (courseId: string) => `google:${courseId}`;
export const courseOf = (source: string | null | undefined) => (source?.startsWith("google:") ? source.slice(7) : null);

export type ClassroomCourse = { id: string; name: string; section: string | null };
export type ClassroomStudent = { googleId: string; first: string; last: string; name: string };

/** A course from the API, or null for one not worth listing. */
export function courseFrom(raw: unknown): ClassroomCourse | null {
  const c = raw as { id?: unknown; name?: unknown; section?: unknown } | null;
  if (!c || typeof c.id !== "string" || typeof c.name !== "string") return null;
  return { id: c.id, name: c.name, section: typeof c.section === "string" && c.section.trim() ? c.section.trim() : null };
}

/** A student from the API's roster, named as the teacher sees them. */
export function studentFrom(raw: unknown): ClassroomStudent | null {
  const s = raw as { userId?: unknown; profile?: { name?: { givenName?: unknown; familyName?: unknown; fullName?: unknown } } } | null;
  if (!s || typeof s.userId !== "string" || !/^\d+$/.test(s.userId)) return null;
  const n = s.profile?.name ?? {};
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  let first = str(n.givenName);
  let last = str(n.familyName);
  const full = str(n.fullName);
  if (!first && full) {
    const words = full.split(/\s+/);
    first = words[0];
    last ||= words.slice(1).join(" ");
  }
  first ||= "Student";
  return { googleId: s.userId, first: first.slice(0, 60), last: last.slice(0, 60), name: (last ? `${first} ${last}` : first).slice(0, 120) };
}

export type SyncPlan = {
  /** In Classroom with no account here yet: make one. */
  create: ClassroomStudent[];
  /** Have an account here (linked to that Google account) but are not in this class: add them. */
  enroll: { student: ClassroomStudent; userId: string }[];
  /** Already in the class. */
  present: number;
  /** In this class through Google, but no longer in the Classroom class: listed for the teacher, not removed. */
  gone: { userId: string; name: string }[];
};

/**
 * What a sync does, from the Classroom roster, the accounts here linked to
 * those Google accounts, and the class as it stands.
 */
export function planSync(
  roster: ClassroomStudent[],
  linked: Map<string, { userId: string; accountType: string }>,
  members: { userId: string; name: string; googleId: string | null }[]
): SyncPlan {
  const inClass = new Set(members.map((m) => m.userId));
  const inRoster = new Set(roster.map((s) => s.googleId));
  const plan: SyncPlan = { create: [], enroll: [], present: 0, gone: [] };
  const seen = new Set<string>();
  for (const s of roster) {
    if (seen.has(s.googleId)) continue;
    seen.add(s.googleId);
    const owner = linked.get(s.googleId);
    // A teacher's own Google account in their Classroom class (as a co-teacher) is not a student.
    if (owner?.accountType === "educator") continue;
    if (!owner) plan.create.push(s);
    else if (inClass.has(owner.userId)) plan.present++;
    else plan.enroll.push({ student: s, userId: owner.userId });
  }
  for (const m of members) if (m.googleId && !inRoster.has(m.googleId)) plan.gone.push({ userId: m.userId, name: m.name });
  return plan;
}

/** "Share to Classroom": Google's own share page, which needs no key. */
export const shareToClassroomUrl = (url: string, title?: string) =>
  `https://classroom.google.com/share?url=${encodeURIComponent(url)}${title ? `&title=${encodeURIComponent(title)}` : ""}`;
