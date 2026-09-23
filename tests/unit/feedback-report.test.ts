import { describe, expect, test } from "bun:test";
import { composeEmail, validateReport } from "../../src/lib/feedback-report";

/**
 * What /api/feedback accepts, and the email it builds.
 *
 * The endpoint is reachable by anyone with the URL, so the validator is the
 * only thing between a stranger and somebody else's mail provider. It is
 * tested here rather than over HTTP because the rules are the interesting part.
 */

const good = {
  kind: "bug",
  message: "The tenor line jumped a seventh in bar 3.",
  context: "Page: Choral\nKey: G",
  href: "https://abc-sightreading.com/choral-sightreading?key=G",
  userAgent: "Mozilla/5.0",
  screen: "1512x857",
};

describe("validateReport", () => {
  test("accepts a full report", () => {
    const out = validateReport(good);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.report.message).toBe(good.message);
  });

  test("accepts a report with only a kind and a message", () => {
    // Everything else is context the page collected, and an older page or a
    // blocked userAgent is not a reason to refuse somebody's report.
    const out = validateReport({ kind: "idea", message: "Add a metronome." });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.report.context).toBe("");
      expect(out.report.href).toBe("");
    }
  });

  test("refuses an unknown kind", () => {
    expect(validateReport({ ...good, kind: "complaint" }).ok).toBe(false);
    expect(validateReport({ ...good, kind: 7 }).ok).toBe(false);
  });

  test("refuses a report with nothing written in it", () => {
    for (const message of ["", "   ", "\n\t ", undefined, null, 42]) {
      expect(validateReport({ ...good, message }).ok).toBe(false);
    }
  });

  test("refuses anything that is not an object", () => {
    for (const body of [null, "a string", 5, undefined]) {
      expect(validateReport(body).ok).toBe(false);
    }
  });

  test("refuses a message past the cap, so this cannot carry bulk mail", () => {
    expect(validateReport({ ...good, message: "x".repeat(4001) }).ok).toBe(false);
    expect(validateReport({ ...good, message: "x".repeat(4000) }).ok).toBe(true);
  });

  test("truncates the collected context rather than refusing it", () => {
    // The reporter did not type these, so a long one is the page's fault and
    // should not cost them their report.
    const out = validateReport({ ...good, href: "https://x.com/?q=" + "y".repeat(5000) });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.report.href.length).toBe(2000);
  });

  test("trims what it keeps", () => {
    const out = validateReport({ ...good, message: "  spaced  ", screen: " 800x600 " });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.report.message).toBe("spaced");
      expect(out.report.screen).toBe("800x600");
    }
  });
});

describe("composeEmail", () => {
  test("names the kind in the subject", () => {
    expect(composeEmail({ ...good, kind: "bug" } as any).subject).toContain("something is wrong");
    expect(composeEmail({ ...good, kind: "idea" } as any).subject).toContain("an idea");
  });

  test("leads with what the reporter wrote", () => {
    const { text } = composeEmail(good as any);
    expect(text.startsWith(good.message)).toBe(true);
  });

  test("carries the settings, the link, the browser and the viewport", () => {
    const { text } = composeEmail(good as any);
    expect(text).toContain("Key: G");
    expect(text).toContain(`Link: ${good.href}`);
    expect(text).toContain("Browser: Mozilla/5.0");
    expect(text).toContain("Screen: 1512x857");
  });

  test("leaves out the divider when there is nothing to put under it", () => {
    const bare = { kind: "idea", message: "Add a metronome.", context: "", href: "", userAgent: "", screen: "" };
    expect(composeEmail(bare as any).text).toBe("Add a metronome.");
  });

  test("keeps a blank line between the report and the facts", () => {
    const { text } = composeEmail(good as any);
    expect(text).toContain(`${good.message}\n\n--- so this can be reproduced ---`);
  });
});
