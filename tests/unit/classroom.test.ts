import { describe, expect, test } from "bun:test";
import { courseFrom, courseOf, courseWorkFor, gradePatches, hasClassroomScopes, hasGradeScope, planSync, rosterSourceFor, shareToClassroomUrl, studentFrom, CLASSROOM_SCOPES, GRADE_SCOPE } from "../../src/lib/classroom";
import { classlinkEmail, isStudentEmail } from "../../src/lib/roster";

const s = (googleId: string, first = "Ana", last = "Diaz") => ({ googleId, first, last, name: `${first} ${last}` });

describe("Google Classroom", () => {
  test("scopes: both are needed, in Better Auth's comma list or Google's spaces", () => {
    expect(hasClassroomScopes(CLASSROOM_SCOPES.join(","))).toBe(true);
    expect(hasClassroomScopes(`openid,email,${CLASSROOM_SCOPES.join(" ")}`)).toBe(true);
    expect(hasClassroomScopes(CLASSROOM_SCOPES[0])).toBe(false);
    expect(hasClassroomScopes(null)).toBe(false);
  });

  test("a class remembers its Classroom class", () => {
    expect(courseOf(rosterSourceFor("123"))).toBe("123");
    expect(courseOf(null)).toBeNull();
    expect(courseOf("classlink:9")).toBeNull();
  });

  test("courses and students from the API", () => {
    expect(courseFrom({ id: "1", name: "Choir", section: " Period 2 " })).toEqual({ id: "1", name: "Choir", section: "Period 2" });
    expect(courseFrom({ id: 1, name: "x" })).toBeNull();
    expect(studentFrom({ userId: "1077", profile: { name: { givenName: "Bao", familyName: "Nguyen", fullName: "Bao Nguyen" } } })).toEqual({ googleId: "1077", first: "Bao", last: "Nguyen", name: "Bao Nguyen" });
    // Only a full name: split it.
    expect(studentFrom({ userId: "5", profile: { name: { fullName: "Maria del Mar" } } })).toMatchObject({ first: "Maria", last: "del Mar" });
    expect(studentFrom({ userId: "5", profile: {} })?.first).toBe("Student");
    // Not a Google ID: refused.
    expect(studentFrom({ userId: "me" })).toBeNull();
  });

  test("a sync makes, adds, keeps, and only lists who left", () => {
    const linked = new Map([
      ["2", { userId: "u2", accountType: "student" }],
      ["3", { userId: "u3", accountType: "student" }],
      ["9", { userId: "t9", accountType: "educator" }],
    ]);
    const members = [
      { userId: "u3", name: "In class", googleId: "3" },
      { userId: "u4", name: "Left Classroom", googleId: "4" },
      { userId: "u5", name: "Code joiner", googleId: null },
    ];
    const plan = planSync([s("1"), s("2"), s("3"), s("9"), s("1")], linked, members);
    expect(plan.create.map((x) => x.googleId)).toEqual(["1"]);
    expect(plan.enroll.map((x) => x.userId)).toEqual(["u2"]);
    expect(plan.present).toBe(1);
    // A student who joined with a code is not "gone" for not being in Classroom.
    expect(plan.gone).toEqual([{ userId: "u4", name: "Left Classroom" }]);
  });

  test("share link", () => {
    expect(shareToClassroomUrl("https://x.com/a?assignment=1", "Bars 9 to 16")).toBe(
      "https://classroom.google.com/share?url=https%3A%2F%2Fx.com%2Fa%3Fassignment%3D1&title=Bars%209%20to%2016"
    );
  });

  test("ClassLink: a student's placeholder makes a student account, a teacher's does not", () => {
    expect(isStudentEmail(classlinkEmail("123", true))).toBe(true);
    expect(isStudentEmail(classlinkEmail("123", false))).toBe(false);
  });
});

describe("grades in Classroom", () => {
  test("the grades permission is on top of the roster ones", () => {
    expect(hasGradeScope([...CLASSROOM_SCOPES, GRADE_SCOPE].join(","))).toBe(true);
    expect(hasGradeScope(GRADE_SCOPE)).toBe(false);
    expect(hasGradeScope(CLASSROOM_SCOPES.join(","))).toBe(false);
  });
  test("coursework out of 100 with its link, due only while ahead", () => {
    const now = Date.UTC(2026, 9, 10);
    const ahead = courseWorkFor({ title: "Step 4", note: "On solfège", dueAt: Date.UTC(2026, 9, 12, 23, 59, 59) }, "https://x/a", now);
    expect(ahead.maxPoints).toBe(100);
    expect(ahead.materials).toEqual([{ link: { url: "https://x/a" } }]);
    expect(ahead.description.startsWith("On solfège")).toBe(true);
    expect(ahead.dueDate).toEqual({ year: 2026, month: 10, day: 12 });
    expect(ahead.dueTime).toEqual({ hours: 23, minutes: 59 });
    expect("dueDate" in courseWorkFor({ title: "t", note: "", dueAt: Date.UTC(2026, 9, 1) }, "u", now)).toBe(false);
  });
  test("a draft grade for each student with one, unchanged ones left alone", () => {
    const grades = new Map<string, number | null>([["111", 92], ["222", null], ["333", 70]]);
    const subs = [{ id: "a", userId: "111" }, { id: "b", userId: "222" }, { id: "c", userId: "333", draftGrade: 70 }, { id: "d", userId: "999" }];
    expect(gradePatches(subs, grades)).toEqual([{ id: "a", draftGrade: 92 }]);
  });
});
