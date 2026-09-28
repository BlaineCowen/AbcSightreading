/**
 * The rules for educator accounts and their students, as pure functions the
 * API routes call - tested in tests/unit/students.test.ts without a database.
 */
import { isJoinCode, normalizeJoinCode } from "./join-code";
import { MAX_ROSTER_SIZE, checkUsername, type RosterStudent } from "./roster";

type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

/** Better Auth's own minimum; generated passwords ("blue-tiger-42") clear it. */
export const MIN_PASSWORD = 8;
const MAX_PASSWORD = 64;
const MAX_NAME = 40;

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export interface NewStudentJoin {
  code: string;
  first: string;
  last: string;
  username: string;
  password: string;
}

/**
 * A join request. Signed in, only the code: the account joins as it is.
 * Signed out, a new student account: first name, optional last name, a
 * username and a password - and nothing else, since the student may be under
 * 13. An email in the request is refused rather than quietly dropped.
 */
export function checkJoinRequest(
  body: unknown,
  { signedIn = false } = {}
): Checked<{ code: string } | NewStudentJoin> {
  if (typeof body !== "object" || body === null) return { ok: false, error: "Expected a class code." };
  const b = body as Record<string, unknown>;
  const code = normalizeJoinCode(str(b.code));
  if (!isJoinCode(code)) return { ok: false, error: "That is not a class code. It looks like KTZ-482." };
  if (signedIn) return { ok: true, value: { code } };
  if ("email" in b) return { ok: false, error: "Student accounts do not use an email address." };
  const first = str(b.first);
  const last = str(b.last);
  if (!first) return { ok: false, error: "Type your first name." };
  if (first.length > MAX_NAME || last.length > MAX_NAME) return { ok: false, error: "That name is too long." };
  const username = str(b.username).toLowerCase();
  if (!checkUsername(username)) {
    return { ok: false, error: "Usernames are 2-20 letters, numbers or dots, starting with a letter." };
  }
  const password = typeof b.password === "string" ? b.password : "";
  if (password.length < MIN_PASSWORD || password.length > MAX_PASSWORD) {
    return { ok: false, error: `Passwords are at least ${MIN_PASSWORD} characters.` };
  }
  return { ok: true, value: { code, first, last, username, password } };
}

/** Students to add to a class, as the roster page sends them. */
export function checkRosterRequest(body: unknown): Checked<RosterStudent[]> {
  const list = (body as { students?: unknown } | null)?.students;
  if (!Array.isArray(list) || list.length === 0) return { ok: false, error: "Add at least one student." };
  if (list.length > MAX_ROSTER_SIZE) return { ok: false, error: `Add up to ${MAX_ROSTER_SIZE} students at a time.` };
  const out: RosterStudent[] = [];
  for (const [i, raw] of list.entries()) {
    const r = (raw ?? {}) as Record<string, unknown>;
    const first = str(r.first);
    const last = str(r.last);
    if (!first) return { ok: false, error: `Student ${i + 1} has no first name.` };
    if (first.length > MAX_NAME || last.length > MAX_NAME) return { ok: false, error: `Student ${i + 1}'s name is too long.` };
    const s: RosterStudent = { first, last };
    if (r.username !== undefined && r.username !== "") {
      const u = str(r.username).toLowerCase();
      if (!checkUsername(u)) return { ok: false, error: `${first}'s username is not valid.` };
      s.username = u;
    }
    if (r.password !== undefined && r.password !== "") {
      const p = String(r.password);
      if (p.length < MIN_PASSWORD || p.length > MAX_PASSWORD) {
        return { ok: false, error: `${first}'s password needs at least ${MIN_PASSWORD} characters.` };
      }
      s.password = p;
    }
    out.push(s);
  }
  return { ok: true, value: out };
}

/**
 * A teacher manages a student's account - resets the password, deletes it -
 * only if it is in their class and they made it. A student who joined with
 * their own account keeps control of it; the teacher can only remove them
 * from the class.
 */
export const canManageStudent = (teacherId: string, e: { teacherId: string; managed: boolean }) =>
  e.teacherId === teacherId && e.managed;

/** What removing a student from a class does to their account. */
export const removalFor = (e: { managed: boolean; otherEnrollments: number }) =>
  e.managed && e.otherEnrollments === 0 ? "delete-account" : "leave-class";
