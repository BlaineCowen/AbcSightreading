import { describe, expect, test } from "bun:test";
import { looksLikeStudent } from "../../src/lib/student-guess";

describe("looksLikeStudent", () => {
  test("a student domain", () => {
    expect(looksLikeStudent("k1632767", "k1632767@students.katyisd.org")).toBe(true);
    expect(looksLikeStudent("Ana Ruiz", "ana.ruiz@stu.district.org")).toBe(true);
  });
  test("an address that is an ID", () => {
    expect(looksLikeStudent("Sam Lee", "s204518@district.org")).toBe(true);
  });
  test("a name in capitals, as school records write them", () => {
    expect(looksLikeStudent("KAMREN HENDERSON", "kamren.henderson@sscisd.net")).toBe(true);
  });
  test("a teacher's usual account", () => {
    expect(looksLikeStudent("Brooke Grabowski", "brooke.grabowski@sscisd.net")).toBe(false);
    expect(looksLikeStudent("Nicholas Likos", "nicholasjlikos@katyisd.org")).toBe(false);
    expect(looksLikeStudent("Casey LeVie", "casey.levie@southlakecarroll.edu")).toBe(false);
    expect(looksLikeStudent("Jo Smith", "jsmith2@district.org")).toBe(false);
  });
});
