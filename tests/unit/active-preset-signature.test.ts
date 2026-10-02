import { describe, expect, test } from "bun:test";
import { restoredSignature } from "../../src/lib/active-preset";

describe("restoredSignature", () => {
  const current = { key: "F", maxSkip: 4, exactOn: false, patterns: [] as string[] };

  test("a signature with the same fields is kept as it was", () => {
    const sig = JSON.stringify({ ...current, key: "G" });
    expect(restoredSignature(sig, current)).toBe(sig);
  });

  test("a signature from before new fields takes them from the page, keeping its own edits", () => {
    const old = JSON.stringify({ key: "F", maxSkip: 4 });
    expect(restoredSignature(old, current)).toBe(JSON.stringify(current));
    const edited = JSON.stringify({ key: "G", maxSkip: 4 });
    expect(restoredSignature(edited, current)).toBe(JSON.stringify({ ...current, key: "G" }));
  });

  test("a field the page no longer has is dropped", () => {
    const old = JSON.stringify({ key: "F", maxSkip: 4, skipMode: "max", exactOn: false, patterns: [] });
    expect(restoredSignature(old, current)).toBe(JSON.stringify(current));
  });

  test("missing or unreadable: the page's own settings", () => {
    expect(restoredSignature(undefined, current)).toBe(JSON.stringify(current));
    expect(restoredSignature("{not json", current)).toBe(JSON.stringify(current));
    expect(restoredSignature("[1,2]", current)).toBe(JSON.stringify(current));
  });
});
