import { describe, expect, test } from "bun:test";
import { courseFrom, courseOf, hasClassroomScopes, planSync, rosterSourceFor, shareToClassroomUrl, studentFrom, CLASSROOM_SCOPES } from "../../src/lib/classroom";
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
