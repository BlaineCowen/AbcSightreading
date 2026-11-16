/**
 * OneRoster 1.1 rosters as CSV files (the bulk format: orgs.csv, classes.csv,
 * users.csv, enrollments.csv and the rest, usually in one zip). Blaine's
 * Teacher Tools app exports its rosters this way (16 November 2026), and
 * districts' rostering (ClassLink, Clever, a SIS) can produce the same files,
 * so one importer serves both.
 *
 * Only names come in. Students may be under 13: a student account here holds a
 * first and last name and nothing else from the file (no emails, SIS ids,
 * grades or birth dates). Each student is remembered by the school's and the
 * file's ids together (`keyOf`), so importing a newer file again updates the
 * same accounts rather than making new ones.
 *
 * Server side: src/lib/server/oneroster.ts. Tests: tests/unit/oneroster.test.ts.
 */

export const ONEROSTER_PROVIDER = "oneroster";
export const rosterSourceFor = (classKey: string) => `oneroster:${classKey}`;
export const oneRosterClassOf = (source: string | null | undefined) => (source?.startsWith("oneroster:") ? source.slice(10) : null);
/** A student's or class's lasting id: its school's sourcedId and its own, as one sourcedId alone is only unique within a district. */
export const keyOf = (orgId: string, sourcedId: string) => `${orgId}/${sourcedId}`;

export type OneRosterStudent = { key: string; first: string; last: string; name: string };
export type OneRosterClass = { key: string; title: string; school: string; students: OneRosterStudent[] };
export type OneRoster = { classes: OneRosterClass[]; warnings: string[] };

/** The longest class the importer takes, and the most classes in one file. */
export const MAX_CLASS_SIZE = 200;
export const MAX_CLASSES = 60;

/** Parse CSV text: quoted cells may hold commas, quotes ("") and line breaks. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c !== "")) rows.push(row);
  return rows;
}

/** A CSV file as objects keyed by its header (case kept, cells trimmed). */
export function records(text: string | undefined): Record<string, string>[] {
  if (!text) return [];
  const [head, ...rest] = parseCsv(text);
  if (!head) return [];
  const keys = head.map((h) => h.trim());
  return rest.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()])));
}

const live = (r: Record<string, string>) => (r.status ?? "").toLowerCase() !== "tobedeleted";
const clip = (s: string, n: number) => s.replace(/\s+/g, " ").trim().slice(0, n);

/** Find a file by its OneRoster name, wherever the zip put it (a folder, other case). */
export function fileNamed(files: Record<string, string>, name: string): string | undefined {
  const want = name.toLowerCase();
  const path = Object.keys(files).find((p) => p.toLowerCase().split("/").pop() === want);
  return path === undefined ? undefined : files[path];
}

/**
 * The classes in a OneRoster file set and the students enrolled in each.
 * `files` maps a file name (or a path inside the zip) to its text.
 */
export function readOneRoster(files: Record<string, string>): OneRoster {
  const warnings: string[] = [];
  const classes = records(fileNamed(files, "classes.csv")).filter(live);
  const users = records(fileNamed(files, "users.csv")).filter(live);
  const enrollments = records(fileNamed(files, "enrollments.csv")).filter(live);
  const orgs = records(fileNamed(files, "orgs.csv")).filter(live);
  if (!classes.length || !users.length || !enrollments.length) {
    const missing = [["classes.csv", classes], ["users.csv", users], ["enrollments.csv", enrollments]].filter(([, r]) => !(r as unknown[]).length).map(([n]) => n);
    throw new Error(`That is not a OneRoster file: ${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} missing or empty.`);
  }
  const orgName = new Map(orgs.map((o) => [o.sourcedId, o.name]));

  const students = new Map<string, { first: string; last: string }>();
  for (const u of users) {
    if ((u.role ?? "").toLowerCase() !== "student" || !u.sourcedId) continue;
    if ((u.enabledUser ?? "").toLowerCase() === "false") continue;
    const first = clip(u.preferredGivenName || u.givenName || "", 40);
    const last = clip(u.preferredFamilyName || u.familyName || "", 40);
    if (!first && !last) continue;
    students.set(u.sourcedId, { first: first || "Student", last });
  }

  const byClass = new Map<string, Set<string>>();
  for (const e of enrollments) {
    if ((e.role ?? "").toLowerCase() !== "student" || !students.has(e.userSourcedId)) continue;
    if (!byClass.has(e.classSourcedId)) byClass.set(e.classSourcedId, new Set());
    byClass.get(e.classSourcedId)!.add(e.userSourcedId);
  }

  const out: OneRosterClass[] = [];
  for (const c of classes) {
    const ids = byClass.get(c.sourcedId);
    if (!c.sourcedId || !ids?.size) continue;
    const org = c.schoolSourcedId || "school";
    const title = clip(c.title || c.classCode || "Class", 60);
    const list = [...ids].map((id) => {
      const s = students.get(id)!;
      return { key: keyOf(org, id), first: s.first, last: s.last, name: s.last ? `${s.first} ${s.last}` : s.first };
    });
    list.sort((a, b) => a.last.localeCompare(b.last) || a.first.localeCompare(b.first));
    if (list.length > MAX_CLASS_SIZE) {
      warnings.push(`${title} has ${list.length} students; only the first ${MAX_CLASS_SIZE} come in.`);
      list.length = MAX_CLASS_SIZE;
    }
    out.push({ key: keyOf(org, c.sourcedId), title, school: orgName.get(org) ?? "", students: list });
  }
  out.sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }));
  if (out.length > MAX_CLASSES) {
    warnings.push(`The file has ${out.length} classes; the first ${MAX_CLASSES} are shown.`);
    out.length = MAX_CLASSES;
  }
  if (!out.length) warnings.push("No class in the file has students enrolled.");
  return { classes: out, warnings };
}

/** What the server takes for one class: checked, so a hand-made request cannot slip anything else in. */
export function checkOneRosterClass(raw: unknown): { ok: true; value: OneRosterClass } | { ok: false; error: string } {
  const c = raw as Partial<OneRosterClass> | null;
  const str = (v: unknown, n: number) => (typeof v === "string" && v.trim() && v.length <= n ? v.trim() : null);
  const key = str(c?.key, 300);
  const title = str(c?.title, 60);
  if (!key || !title || !Array.isArray(c?.students)) return { ok: false, error: "Which class?" };
  if (c.students.length > MAX_CLASS_SIZE) return { ok: false, error: `A class can bring in at most ${MAX_CLASS_SIZE} students.` };
  const students: OneRosterStudent[] = [];
  for (const s of c.students) {
    const k = str(s?.key, 300);
    const first = str(s?.first, 40) ?? (str(s?.last, 40) ? "Student" : null);
    const last = typeof s?.last === "string" ? s.last.trim().slice(0, 40) : "";
    if (!k || !first) return { ok: false, error: "A student in that class has no name." };
    students.push({ key: k, first, last, name: last ? `${first} ${last}` : first });
  }
  return { ok: true, value: { key, title, school: str(c.school, 120) ?? "", students } };
}
