import { describe, expect, test } from "bun:test";
import { safeNext } from "../../src/lib/safe-next";

describe("safeNext", () => {
  test("keeps a path on this site", () => {
    expect(safeNext("/sightreading?key=G")).toBe("/sightreading?key=G");
  });
  test("refuses anything that leaves the site", () => {
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "", null]) {
      expect(safeNext(bad, "/")).toBe("/");
    }
  });
});
