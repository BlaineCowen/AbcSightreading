import { describe, expect, test } from "bun:test";
import { readFeedbackEmail } from "../../src/lib/feedback-email";

/**
 * Which address the Feedback button is wired to, and when there is no button.
 *
 * The runtime environment wins over the build, because the build is the half
 * that failed: a variable set on the project but absent from the build
 * environment inlined as `undefined` and removed the button from every page
 * without a word. See readFeedbackEmail.
 */

const ADDRESS = "feedback@abc-sightreading.com";

describe("readFeedbackEmail", () => {
  test("takes the runtime value", () => {
    expect(readFeedbackEmail({ PUBLIC_FEEDBACK_EMAIL: ADDRESS }, undefined)).toBe(ADDRESS);
  });

  test("falls back to the build-time value, which is all dev has", () => {
    // astro dev loads .env into import.meta.env and not into process.env, so
    // this is the ordinary local path rather than an edge case.
    expect(readFeedbackEmail({}, ADDRESS)).toBe(ADDRESS);
  });

  test("runtime wins when both are set", () => {
    expect(readFeedbackEmail({ PUBLIC_FEEDBACK_EMAIL: ADDRESS }, "stale@example.com")).toBe(
      ADDRESS
    );
  });

  test("neither set means no button", () => {
    expect(readFeedbackEmail({}, undefined)).toBe(null);
  });

  test("an empty or blank value means no button, not an empty mailto", () => {
    expect(readFeedbackEmail({ PUBLIC_FEEDBACK_EMAIL: "" }, undefined)).toBe(null);
    expect(readFeedbackEmail({ PUBLIC_FEEDBACK_EMAIL: "   " }, undefined)).toBe(null);
  });

  test("surrounding whitespace is trimmed, not passed into the mailto", () => {
    // A value pasted into a dashboard field arrives this way often enough, and
    // `mailto: feedback@...` with a leading space is refused by mail clients.
    expect(readFeedbackEmail({ PUBLIC_FEEDBACK_EMAIL: `  ${ADDRESS}\n` }, undefined)).toBe(
      ADDRESS
    );
  });

  test("something that is not an address hides the button rather than breaking it", () => {
    for (const bad of ["feedback", "feedback@localhost", "a b@c.com", "@abc.com"]) {
      expect(readFeedbackEmail({ PUBLIC_FEEDBACK_EMAIL: bad }, undefined)).toBe(null);
    }
  });
});
