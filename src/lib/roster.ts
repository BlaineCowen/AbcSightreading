/**
 * Class rosters: turning what a teacher pastes into student accounts.
 *
 * Students may be under 13, so a student account holds only what the teacher
 * types - a first name and (usually) a last name - plus a username and a
 * password. No email: the account's address is made up on a reserved domain
 * that cannot receive mail (studentEmail), because the auth library needs one.
 */

export const MAX_ROSTER_SIZE = 200;
const MAX_NAME = 40;

export interface RosterStudent {
  first: string;
  last: string;
  username?: string;
  password?: string;
}

// ── Parsing ────────────────────────────────────────────────────────────────

/** Split one CSV or TSV line, honouring double quotes. */
function splitRow(line: string, sep: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === sep && !quoted) {
      cells.push(cell);
      cell = "";
    } else cell += ch;
  }
  cells.push(cell);
  return cells.map((c) => c.trim());
}

const HEADER_NAMES = {
  first: ["first", "firstname", "first name", "givenname", "given name", "given"],
  last: ["last", "lastname", "last name", "familyname", "family name", "surname", "family"],
  username: ["username", "user name", "login"],
  password: ["password"],
};
const headerIndex = (cells: string[], names: string[]) =>
  cells.findIndex((c) => names.includes(c.toLowerCase().replace(/[_-]/g, " ").replace(/\s+/g, " ").trim()) ||
    names.includes(c.toLowerCase().replace(/[\s_-]/g, "")));

/**
 * What a teacher pasted, as students: one name per line ("Maria Garcia" or
 * "Garcia, Maria"), or a CSV/TSV with a header row naming first and last name
 * columns (OneRoster's givenName/familyName included), optionally a username
 * and password. Problems are reported by line rather than guessed at.
 */
export function parseRoster(text: string): { students: RosterStudent[]; errors: string[] } {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const nonEmpty = lines.map((l, i) => ({ l, n: i + 1 })).filter((x) => x.l);
  const errors: string[] = [];
  const students: RosterStudent[] = [];
  if (!nonEmpty.length) return { students, errors };

  const sep = nonEmpty[0].l.includes("\t") ? "\t" : ",";
  const head = splitRow(nonEmpty[0].l, sep);
  const cols = {
    first: headerIndex(head, HEADER_NAMES.first),
    last: headerIndex(head, HEADER_NAMES.last),
    username: headerIndex(head, HEADER_NAMES.username),
    password: headerIndex(head, HEADER_NAMES.password),
  };
  const tabular = cols.first >= 0;
  const rows = tabular ? nonEmpty.slice(1) : nonEmpty;

  if (rows.length > MAX_ROSTER_SIZE) {
    errors.push(`That is ${rows.length} students; a roster can add up to ${MAX_ROSTER_SIZE} at a time.`);
    return { students, errors };
  }

  const seen = new Set<string>();
  for (const { l, n } of rows) {
    let s: RosterStudent;
    if (tabular) {
      const cells = splitRow(l, sep);
      s = { first: cells[cols.first] ?? "", last: cols.last >= 0 ? cells[cols.last] ?? "" : "" };
      if (cols.username >= 0 && cells[cols.username]) s.username = cells[cols.username];
      if (cols.password >= 0 && cells[cols.password]) s.password = cells[cols.password];
    } else if (l.includes(",")) {
      const [last, first] = l.split(",").map((x) => x.trim());
      s = { first: first ?? "", last: last ?? "" };
    } else {
      const parts = l.split(/\s+/);
      s = { first: parts[0], last: parts.slice(1).join(" ") };
    }
    s.first = s.first.replace(/^"|"$/g, "").trim();
    s.last = s.last.replace(/^"|"$/g, "").trim();
    if (!s.first) {
      errors.push(`Line ${n} has no first name.`);
      continue;
    }
    if (s.first.length > MAX_NAME || s.last.length > MAX_NAME) {
      errors.push(`Line ${n}: names are at most ${MAX_NAME} characters.`);
      continue;
    }
    const key = `${s.first} ${s.last}`.toLowerCase();
    if (seen.has(key)) {
      errors.push(`${s.first} ${s.last} is listed twice; added once.`);
      continue;
    }
    seen.add(key);
    students.push(s);
  }
  return { students, errors };
}

// ── Usernames and passwords ────────────────────────────────────────────────

/** Lower case, accents dropped, letters only: "José" -> "jose". */
const plain = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");

/** Letters, digits and dots; starting with a letter; 2-20 long. */
export const checkUsername = (u: string) => /^[a-z][a-z0-9.]{1,19}$/.test(u);

/**
 * "maria.g", unique within the class: then "maria.ga", "maria.gar"..., then
 * "maria.g2", "maria.g3". A name with no plain letters becomes "student".
 */
export function usernameFor(first: string, last: string, taken: Set<string>): string {
  const f = plain(first).slice(0, 12) || "student";
  const l = plain(last);
  const candidates: string[] = [];
  if (!l) candidates.push(f);
  for (let n = 1; n <= Math.min(l.length, 6); n++) candidates.push(`${f}.${l.slice(0, n)}`);
  const base = candidates[0] ?? f;
  for (const c of candidates) if (checkUsername(c) && !taken.has(c)) return c;
  for (let i = 2; ; i++) {
    const c = `${base.slice(0, 17)}${i}`;
    if (checkUsername(c) && !taken.has(c)) return c;
  }
}

// Short, friendly, easy to spell - and nothing a child would snigger at.
const COLORS = ["red", "blue", "green", "gold", "pink", "teal", "navy", "lime", "plum", "rose", "ruby", "jade", "sky", "sand", "mint", "coral"];
const ANIMALS = ["otter", "tiger", "panda", "koala", "eagle", "whale", "zebra", "llama", "robin", "moose", "gecko", "bison", "heron", "lemur", "finch", "camel", "puffin", "beaver", "falcon", "turtle"];

/** "blue-tiger-42": readable off a printed card, typeable by a fourth grader. */
export function generatePassword(random: () => number = Math.random): string {
  const pick = <T>(xs: T[]) => xs[Math.floor(random() * xs.length)];
  return `${pick(COLORS)}-${pick(ANIMALS)}-${10 + Math.floor(random() * 90)}`;
}

// ── Sign-in identity ────────────────────────────────────────────────────────

const STUDENT_DOMAIN = "students.abc-sightreading.invalid";

/** The username the auth library stores: class code and username, so two classes can both have a "maria.g". */
export const studentLoginName = (joinCode: string, username: string) =>
  `${joinCode.toLowerCase()}.${username}`;

/** The address a student account carries in place of an email - `.invalid` is reserved and never delivers. */
export const studentEmail = (loginName: string) => `${loginName}@${STUDENT_DOMAIN}`;

export const isStudentEmail = (email: string) => email.toLowerCase().endsWith(`@${STUDENT_DOMAIN}`);

/**
 * The placeholder for an account made by ClassLink sign-in: a student's is a
 * student address (no mailbox, a student account); a teacher without an email
 * at the district gets one that is not.
 */
export const classlinkEmail = (userId: string, student: boolean) =>
  student ? `classlink.${userId}@${STUDENT_DOMAIN}` : `classlink.${userId}@classlink.abc-sightreading.invalid`;
