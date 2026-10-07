import { describe, expect, test } from "bun:test";
import { bannerShows, daysLeft, noticeDue, noticeEmail, noticeKey } from "../../src/lib/plan-ending";

const now = new Date("2027-04-01T15:00:00Z");
const inDays = (d: number) => new Date(now.getTime() + d * 86_400_000);

describe("when a plan that will not renew is noticed", () => {
  test("nothing before 30 days; the 30-day email inside 30; the 7-day email inside 7", () => {
    expect(noticeDue(inDays(45), now, [])).toBe(null);
    expect(noticeDue(inDays(30), now, [])).toBe(30);
    expect(noticeDue(inDays(20), now, [30])).toBe(null);
    expect(noticeDue(inDays(6), now, [30])).toBe(7);
    expect(noticeDue(inDays(6), now, [30, 7])).toBe(null);
  });
  test("both windows passed unsent: only the nearer one, once", () => {
    expect(noticeDue(inDays(3), now, [])).toBe(7);
    expect(noticeDue(inDays(3), now, [7])).toBe(null);
  });
  test("an ended plan gets nothing", () => {
    expect(noticeDue(inDays(-1), now, [])).toBe(null);
    expect(bannerShows(inDays(-1), now)).toBe(false);
  });
  test("the banner shows for the last 30 days", () => {
    expect(bannerShows(inDays(31), now)).toBe(false);
    expect(bannerShows(inDays(29.5), now)).toBe(true);
  });
  test("a key per term and window, so next year's term is noticed afresh", () => {
    expect(noticeKey("sub:x", inDays(10), 7)).toBe("sub:x:2027-04-11:7");
    expect(noticeKey("sub:x", inDays(375), 7)).not.toBe(noticeKey("sub:x", inDays(10), 7));
  });
  test("the email says when, that it does not renew, and how to renew for each kind", () => {
    expect(daysLeft(inDays(6.2), now)).toBe(7);
    const card = noticeEmail({ plan: "pro", endsAt: inDays(7), kind: "card" }, now, "https://x/account");
    expect(card.subject).toContain("Pro plan ends");
    expect(card.text).toContain("does not renew by itself");
    expect(card.text).toContain("automatic renewal back on");
    expect(noticeEmail({ plan: "educator", endsAt: inDays(30), kind: "quote", quoteId: "q" }, now, "u").text).toContain("renewal quote");
  });
});

describe("the free month's ending", () => {
  test("only the last week: no email the day it starts", async () => {
    const { windowsFor, bannerDaysFor } = await import("../../src/lib/plan-ending");
    expect(noticeDue(inDays(29.9), now, [], windowsFor("trial"))).toBe(null);
    expect(noticeDue(inDays(6), now, [], windowsFor("trial"))).toBe(7);
    expect(bannerShows(inDays(20), now, bannerDaysFor("trial"))).toBe(false);
    expect(bannerShows(inDays(5), now, bannerDaysFor("trial"))).toBe(true);
  });
  test("its email says nothing is charged and how to keep Pro", () => {
    const e = noticeEmail({ plan: "pro", endsAt: inDays(6), kind: "trial" }, now, "u");
    expect(e.subject).toContain("free month");
    expect(e.text).toContain("Nothing is charged");
    expect(e.text).toContain("$19.99");
  });
});
