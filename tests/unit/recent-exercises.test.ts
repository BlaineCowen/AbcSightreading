import { describe, expect, test } from "bun:test";
import { checkRecent, MAX_LINK_LENGTH, sitePath, whenLabel } from "../../src/lib/recent-exercises";

const ok = { page: "unison", title: "Step 3 · Do, re, mi", detail: "F major · 4/4 · 8 bars", link: "/sightreading?key=F#ex=abc" };

describe("checkRecent", () => {
  test("takes a link to the page it names", () => {
    const r = checkRecent(ok);
    expect(r.ok).toBe(true);
    expect(checkRecent({ ...ok, page: "choral", link: "/choral-sightreading?voicing=SATB#ex=x" }).ok).toBe(true);
  });

  // The home page shows these as links: none may leave the site or open the other page.
  test("refuses links anywhere else", () => {
    for (const link of [
      "https://evil.example/sightreading",
      "//evil.example/sightreading",
      "/sightreading-evil",
      "/choral-sightreading?x=1",
      "javascript:alert(1)",
      "/sightreading?a=1 onclick=x",
      "",
    ]) expect(checkRecent({ ...ok, link }).ok).toBe(false);
    expect(checkRecent({ ...ok, page: "choral", link: "/sightreading?x" }).ok).toBe(false);
  });

  test("refuses an unknown page, no title, or a link too long", () => {
    expect(checkRecent({ ...ok, page: "bach" }).ok).toBe(false);
    expect(checkRecent({ ...ok, title: "   " }).ok).toBe(false);
    expect(checkRecent({ ...ok, link: "/sightreading?" + "a".repeat(MAX_LINK_LENGTH) }).ok).toBe(false);
    expect(checkRecent(null).ok).toBe(false);
  });

  test("trims and caps the text", () => {
    const r = checkRecent({ ...ok, title: "  " + "t".repeat(500), detail: 7 });
    expect(r.ok && r.value.title.length).toBe(120);
    expect(r.ok && r.value.detail).toBe("");
  });
});

test("sitePath keeps the path, query and fragment", () => {
  expect(sitePath("https://www.abc-sightreading.com/sightreading?key=F&bpm=80#ex=xyz")).toBe("/sightreading?key=F&bpm=80#ex=xyz");
});

test("whenLabel", () => {
  const now = Date.UTC(2026, 9, 8, 12);
  expect(whenLabel(now - 20_000, now)).toBe("just now");
  expect(whenLabel(now - 5 * 60_000, now)).toBe("5 min ago");
  expect(whenLabel(now - 3 * 3_600_000, now)).toBe("3 h ago");
  expect(whenLabel(now - 30 * 3_600_000, now)).toBe("yesterday");
  expect(whenLabel(now - 4 * 86_400_000, now)).toBe("4 days ago");
});
