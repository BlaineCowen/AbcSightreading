import { describe, expect, test } from "bun:test";
import {
  formatJoinCode,
  generateJoinCode,
  isJoinCode,
  normalizeJoinCode,
} from "../../src/lib/join-code";
import {
  MAX_ROSTER_SIZE,
  checkUsername,
  generatePassword,
  isStudentEmail,
  parseRoster,
  studentEmail,
  studentLoginName,
  usernameFor,
} from "../../src/lib/roster";
import { INCLUDED_SEATS, seatsLeft, seatsUsed } from "../../src/lib/seats";
import { canManageStudent, checkJoinRequest, checkRosterRequest, removalFor } from "../../src/lib/educator-policy";

/**
 * Educator accounts and students (stage 1). Written before the code: these are
 * the rules a class's accounts live by. Students may be under 13, so none of
 * this asks for or makes up anything a child would not have - no email, no
 * full name beyond what the teacher types.
 */

/** A seeded random, so generated codes and passwords are reproducible. */
function seeded(seed = 1) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

describe("class join codes", () => {
  test("three letters and three digits, with nothing that reads two ways", () => {
    const random = seeded(7);
    for (let i = 0; i < 500; i++) {
      const code = generateJoinCode(random);
      expect(code).toMatch(/^[A-Z]{3}[2-9]{3}$/);
      // No O/0, I/1, L: a child copying from the board cannot confuse them.
      expect(code).not.toMatch(/[OIL01]/);
      expect(isJoinCode(code)).toBe(true);
    }
  });

  test("typed however a student types it", () => {
    expect(normalizeJoinCode("ktz 482")).toBe("KTZ482");
    expect(normalizeJoinCode(" KTZ-482 ")).toBe("KTZ482");
    expect(normalizeJoinCode("ktz482")).toBe("KTZ482");
    expect(isJoinCode(normalizeJoinCode("ktz-482"))).toBe(true);
    expect(isJoinCode("KTZ48")).toBe(false);
    expect(isJoinCode("KT0482")).toBe(false);
    expect(formatJoinCode("KTZ482")).toBe("KTZ-482");
  });
});

describe("parsing a roster", () => {
  test("one name per line, first then last", () => {
    expect(parseRoster("Maria Garcia\nJames O'Neil\n\n  Ana  \n")).toEqual({
      students: [
        { first: "Maria", last: "Garcia" },
        { first: "James", last: "O'Neil" },
        { first: "Ana", last: "" },
      ],
      errors: [],
    });
  });

  test("'Last, First', the way gradebooks export", () => {
    expect(parseRoster("Garcia, Maria\nNguyen, Bao").students).toEqual([
      { first: "Maria", last: "Garcia" },
      { first: "Bao", last: "Nguyen" },
    ]);
  });

  test("a CSV or spreadsheet paste with a header row", () => {
    const csv = 'First Name,Last Name,Grade\n"Maria",Garcia,7\nBao,Nguyen,8\n';
    expect(parseRoster(csv).students).toEqual([
      { first: "Maria", last: "Garcia" },
      { first: "Bao", last: "Nguyen" },
    ]);
    // Tab-separated, as a copy from Google Sheets or Excel arrives.
    expect(parseRoster("first\tlast\nMaria\tGarcia").students).toEqual([{ first: "Maria", last: "Garcia" }]);
    // OneRoster's column names (ClassLink exports use them).
    expect(parseRoster("sourcedId,givenName,familyName\n1,Maria,Garcia").students).toEqual([
      { first: "Maria", last: "Garcia" },
    ]);
  });

  test("a username and password column is kept when the teacher gives one", () => {
    const csv = "first,last,username,password\nMaria,Garcia,mgarcia,sunny-otter-31";
    expect(parseRoster(csv).students).toEqual([
      { first: "Maria", last: "Garcia", username: "mgarcia", password: "sunny-otter-31" },
    ]);
  });

  test("says what is wrong instead of guessing", () => {
    const tooMany = Array.from({ length: MAX_ROSTER_SIZE + 1 }, (_, i) => `Student ${i}`).join("\n");
    expect(parseRoster(tooMany).errors.length).toBeGreaterThan(0);
    expect(parseRoster("x".repeat(60)).errors[0]).toMatch(/line 1/i);
    expect(parseRoster("").students).toEqual([]);
    // The same student twice is listed once, and said so.
    const dup = parseRoster("Maria Garcia\nmaria garcia");
    expect(dup.students).toHaveLength(1);
    expect(dup.errors[0]).toMatch(/twice/i);
  });
});

describe("usernames", () => {
  test("first name and last initial, lower case, plain letters", () => {
    expect(usernameFor("Maria", "Garcia", new Set())).toBe("maria.g");
    expect(usernameFor("José", "Núñez", new Set())).toBe("jose.n");
    expect(usernameFor("Mary-Kate", "O'Neil", new Set())).toBe("marykate.o");
    expect(usernameFor("Ana", "", new Set())).toBe("ana");
  });

  test("never repeats one already taken in the class", () => {
    const taken = new Set(["maria.g"]);
    const second = usernameFor("Maria", "Gomez", taken);
    expect(second).not.toBe("maria.g");
    expect(checkUsername(second)).toBe(true);
    taken.add(second);
    const third = usernameFor("Maria", "Garza", taken);
    expect(taken.has(third)).toBe(false);
  });

  test("a name with no usable letters still gets a valid one", () => {
    const u = usernameFor("李", "", new Set());
    expect(checkUsername(u)).toBe(true);
  });

  test("the rules a typed username is held to", () => {
    expect(checkUsername("maria.g")).toBe(true);
    expect(checkUsername("m")).toBe(false);
    expect(checkUsername("maria g")).toBe(false);
    expect(checkUsername("1maria")).toBe(false);
    expect(checkUsername("x".repeat(21))).toBe(false);
  });
});

describe("passwords for students", () => {
  test("two short words and a number: easy to read off a card and type", () => {
    const random = seeded(3);
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const p = generatePassword(random);
      expect(p).toMatch(/^[a-z]+-[a-z]+-[1-9][0-9]$/);
      expect(p.length).toBeGreaterThanOrEqual(8);
      seen.add(p);
    }
    // Enough of them that a class does not share passwords.
    expect(seen.size).toBeGreaterThan(190);
  });
});

describe("student sign-in identity", () => {
  test("the class code keeps usernames separate between classes", () => {
    expect(studentLoginName("KTZ482", "maria.g")).toBe("ktz482.maria.g");
    expect(studentLoginName("PQR735", "maria.g")).not.toBe(studentLoginName("KTZ482", "maria.g"));
  });

  test("a student without email gets an address that can never receive mail", () => {
    const email = studentEmail("ktz482.maria.g");
    expect(email).toBe("ktz482.maria.g@students.abc-sightreading.invalid");
    expect(isStudentEmail(email)).toBe(true);
    expect(isStudentEmail("maria@gmail.com")).toBe(false);
    expect(isStudentEmail("x@students.abc-sightreading.invalid.evil.com")).toBe(false);
  });
});

describe("seats", () => {
  test("an educator plan includes 100", () => {
    expect(INCLUDED_SEATS).toBe(100);
  });

  test("a student in two of the teacher's classes uses one seat", () => {
    const enrollments = [
      { studentId: "a", classId: "c1" },
      { studentId: "a", classId: "c2" },
      { studentId: "b", classId: "c1" },
    ];
    expect(seatsUsed(enrollments)).toBe(2);
    expect(seatsLeft(enrollments, 100)).toBe(98);
    expect(seatsLeft(enrollments, 2)).toBe(0);
  });
});


describe("joining a class", () => {
  test("a new student account: code, first name, username, password", () => {
    expect(checkJoinRequest({ code: "ktz-482", first: " Maria ", username: "maria.g", password: "blue-tiger-42" })).toEqual({
      ok: true,
      value: { code: "KTZ482", first: "Maria", last: "", username: "maria.g", password: "blue-tiger-42" },
    });
  });

  test("an existing account joining needs only the code", () => {
    expect(checkJoinRequest({ code: "KTZ482" }, { signedIn: true })).toEqual({ ok: true, value: { code: "KTZ482" } });
  });

  test("refuses what would make a bad account", () => {
    const base = { code: "KTZ482", first: "Maria", username: "maria.g", password: "blue-tiger-42" };
    expect(checkJoinRequest({ ...base, code: "KT0482" }).ok).toBe(false);
    expect(checkJoinRequest({ ...base, first: "" }).ok).toBe(false);
    expect(checkJoinRequest({ ...base, username: "Maria G" }).ok).toBe(false);
    expect(checkJoinRequest({ ...base, password: "short" }).ok).toBe(false);
    // Nothing that would identify a child beyond a first name and a last name.
    expect(checkJoinRequest({ ...base, email: "kid@example.com" }).ok).toBe(false);
  });
});

describe("adding a roster", () => {
  test("names, with any usernames and passwords the teacher chose", () => {
    const r = checkRosterRequest({ students: [{ first: "Maria", last: "Garcia" }, { first: "Bao", last: "Nguyen", username: "bao.n", password: "gold-panda-17" }] });
    expect(r.ok).toBe(true);
  });

  test("refuses an empty, oversized or malformed roster", () => {
    expect(checkRosterRequest({ students: [] }).ok).toBe(false);
    expect(checkRosterRequest({ students: Array(201).fill({ first: "A", last: "B" }) }).ok).toBe(false);
    expect(checkRosterRequest({ students: [{ first: "", last: "B" }] }).ok).toBe(false);
    expect(checkRosterRequest({ students: [{ first: "A", last: "B", username: "Bad Name" }] }).ok).toBe(false);
    expect(checkRosterRequest({ students: [{ first: "A", last: "B", password: "short" }] }).ok).toBe(false);
    expect(checkRosterRequest(null).ok).toBe(false);
  });
});

describe("who may manage a student", () => {
  const enrollment = { teacherId: "t1", managed: true };
  test("only the teacher of the class, and only accounts that teacher made", () => {
    expect(canManageStudent("t1", enrollment)).toBe(true);
    expect(canManageStudent("t2", enrollment)).toBe(false);
    // A student who joined with their own account manages it themselves.
    expect(canManageStudent("t1", { teacherId: "t1", managed: false })).toBe(false);
  });

  test("removing a student: a teacher-made account with no other class is deleted, anything else only leaves the class", () => {
    expect(removalFor({ managed: true, otherEnrollments: 0 })).toBe("delete-account");
    expect(removalFor({ managed: true, otherEnrollments: 1 })).toBe("leave-class");
    expect(removalFor({ managed: false, otherEnrollments: 0 })).toBe("leave-class");
  });
});

describe("the join form's hint for a mistyped code", async () => {
  const { joinCodeHint } = await import("../../src/lib/join-code");
  test("nothing while it may still become a code, or once it is one", () => {
    expect(joinCodeHint("")).toBeNull();
    expect(joinCodeHint("KT")).toBeNull();
    expect(joinCodeHint("KTZ-4")).toBeNull();
    expect(joinCodeHint("ktz 482")).toBeNull();
  });
  test("the characters codes never use, said plainly", () => {
    expect(joinCodeHint("ABC-100")).toMatch(/never use O, 0, I, L or 1/);
    expect(joinCodeHint("KOZ")).toMatch(/never use/);
  });
  test("the wrong shape", () => {
    expect(joinCodeHint("KT4")).toMatch(/three letters, then three numbers/);
    expect(joinCodeHint("KTZX")).toMatch(/three letters, then three numbers/);
  });
});
