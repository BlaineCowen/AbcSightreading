import { describe, expect, test } from "bun:test";
import { readFeedbackEmail } from "../../src/lib/feedback-email";

/**
 * Where feedback is sent, and when there is no button at all.
 *
 * Server-side only now: the address never reaches the browser, because the
 * panel posts to /api/feedback and the route decides where it goes. FEEDBACK_TO
 * is the name to use; PUBLIC_FEEDBACK_EMAIL is still honoured so an
 * environment carrying only the old name keeps working. Runtime beats the
 * build, because a variable the build cannot see inlines as `undefined` and
 * would take the button off every page without a word.
 */

const ADDRESS = "feedback@abc-sightreading.com";

describe("readFeedbackEmail", () => {
  test("takes the runtime value", () => {
    expect(readFeedbackEmail({ FEEDBACK_TO: ADDRESS }, undefined)).toBe(ADDRESS);
  });

  test("still honours the old PUBLIC_ name", () => {
    expect(readFeedbackEmail({ PUBLIC_FEEDBACK_EMAIL: ADDRESS }, undefined)).toBe(ADDRESS);
  });

  test("prefers FEEDBACK_TO over the old name", () => {
    expect(
      readFeedbackEmail(
        { FEEDBACK_TO: ADDRESS, PUBLIC_FEEDBACK_EMAIL: "old@example.com" },
        undefined
      )
    ).toBe(ADDRESS);
  });

  test("falls back to the build-time value, which is all dev has", () => {
    // astro dev loads .env into import.meta.env and not into process.env, so
    // this is the ordinary local path rather than an edge case.
    expect(readFeedbackEmail({}, ADDRESS)).toBe(ADDRESS);
  });

  test("runtime wins over the build when both are set", () => {
    expect(readFeedbackEmail({ FEEDBACK_TO: ADDRESS }, "stale@example.com")).toBe(ADDRESS);
  });

  test("neither set means no button", () => {
    expect(readFeedbackEmail({}, undefined)).toBe(null);
  });

  test("an empty or blank value means no button, not an empty mailto", () => {
    expect(readFeedbackEmail({ FEEDBACK_TO: "" }, undefined)).toBe(null);
    expect(readFeedbackEmail({ FEEDBACK_TO: "   " }, undefined)).toBe(null);
  });

  test("surrounding whitespace is trimmed, not passed into the mailto", () => {
    // A value pasted into a dashboard field arrives this way often enough, and
    // `mailto: feedback@...` with a leading space is refused by mail clients.
    expect(readFeedbackEmail({ FEEDBACK_TO: `  ${ADDRESS}\n` }, undefined)).toBe(
      ADDRESS
    );
  });

  test("something that is not an address hides the button rather than breaking it", () => {
    for (const bad of ["feedback", "feedback@localhost", "a b@c.com", "@abc.com"]) {
      expect(readFeedbackEmail({ FEEDBACK_TO: bad }, undefined)).toBe(null);
    }
  });
});
