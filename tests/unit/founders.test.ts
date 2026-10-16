import { describe, expect, test } from "bun:test";
import { FOUNDERS_CLOSE_DEFAULT, checkApplication, endOfDay, founderDecision, founderEndsAt, foundersOpen, isSchoolEmail } from "../../src/lib/founders";

const teacher = { open: true, signedIn: true, accountType: "standard", emailVerified: true, disposable: false, already: false, proven: true };

describe("founderDecision", () => {
  test("a signed-in teacher with a confirmed email may join", () => {
    expect(founderDecision(teacher)).toEqual({ ok: true });
    expect(founderDecision({ ...teacher, accountType: "educator" })).toEqual({ ok: true });
  });
  test("one step in the way is named", () => {
    expect(founderDecision({ ...teacher, signedIn: false })).toMatchObject({ ok: false, step: "sign-in" });
    expect(founderDecision({ ...teacher, emailVerified: false })).toMatchObject({ ok: false, step: "confirm" });
  });
  test("never a student, never a throwaway address", () => {
    expect(founderDecision({ ...teacher, accountType: "student" }).ok).toBe(false);
    expect(founderDecision({ ...teacher, disposable: true }).ok).toBe(false);
  });
  test("a founder is told so, even after the offer closes", () => {
    expect(founderDecision({ ...teacher, already: true, open: false })).toMatchObject({ ok: false, step: "joined" });
    expect(founderDecision({ ...teacher, open: false })).toMatchObject({ ok: false });
  });
});

describe("dates", () => {
  test("Educator runs to the end of 31 May 2027 in Texas", () => {
    expect(founderEndsAt().toISOString()).toBe("2027-06-01T06:00:00.000Z");
  });
  test("the offer closes at the end of its closing day", () => {
    const end = endOfDay(FOUNDERS_CLOSE_DEFAULT);
    expect(foundersOpen(undefined, undefined, new Date(end.getTime() - 1))).toBe(true);
    expect(foundersOpen(undefined, undefined, end)).toBe(false);
    expect(foundersOpen("2026-12-01", undefined, new Date("2026-12-15T12:00:00Z"))).toBe(false);
    expect(foundersOpen(undefined, "0", new Date("2026-10-16T12:00:00Z"))).toBe(false);
    expect(foundersOpen("not a date", undefined, new Date("2026-10-16T12:00:00Z"))).toBe(true);
  });
});

describe("proving a teacher", () => {
  test("without a school email or ClassLink, they apply, then wait", () => {
    expect(founderDecision({ ...teacher, proven: false })).toMatchObject({ ok: false, step: "apply" });
    expect(founderDecision({ ...teacher, proven: false, application: "pending" })).toMatchObject({ ok: false, step: "pending" });
    expect(founderDecision({ ...teacher, proven: false, application: "declined" })).toMatchObject({ ok: false });
    expect(founderDecision({ ...teacher, proven: false, application: "declined" }).ok).toBe(false);
  });
  test("confirming the email comes before applying", () => {
    expect(founderDecision({ ...teacher, proven: false, emailVerified: false })).toMatchObject({ step: "confirm" });
  });
  test("one per person: another account behind the same address has joined", () => {
    expect(founderDecision({ ...teacher, personJoined: true }).ok).toBe(false);
  });
  test("district addresses are schools", () => {
    for (const e of ["t@austinisd.org", "t@katyisd.org", "t@fortbendisd.com", "t@lausd.net", "t@sfusd.edu", "t@ccsd.k12.nv.us",
      "t@k12.ca.us", "t@schools.nyc.gov", "t@jeffcoschools.us", "t@sd43.bc.ca", "t@cps.edu", "t@fcps.edu", "t@det.nsw.edu.au"])
      expect(isSchoolEmail(e)).toBe(true);
  });
  test("personal mail, universities and look-alikes are not", () => {
    for (const e of ["t@gmail.com", "t@outlook.com", "t@icloud.com", "t@utexas.edu", "t@mit.edu", "t@wisdomtree.com", "t@abc-sightreading.com", "nonsense"])
      expect(isSchoolEmail(e)).toBe(false);
  });
});

describe("checkApplication", () => {
  const good = { school: "Lamar MS", district: "Austin ISD", role: "Choir", proofUrl: "austinisd.org/staff", note: "" };
  test("a complete one passes, the link made a web address", () => {
    const r = checkApplication(good);
    expect(r.ok && r.value.proofUrl).toBe("https://austinisd.org/staff");
  });
  test("each field is asked for", () => {
    for (const k of ["school", "district", "role", "proofUrl"] as const) expect(checkApplication({ ...good, [k]: " " }).ok).toBe(false);
    expect(checkApplication({ ...good, proofUrl: "not a link" }).ok).toBe(false);
    expect(checkApplication(null).ok).toBe(false);
  });
});
