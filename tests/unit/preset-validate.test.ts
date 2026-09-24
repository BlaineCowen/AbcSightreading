import { describe, expect, test } from "bun:test";
import {
  checkName,
  checkNewPreset,
  checkParams,
  isPresetStore,
  MAX_NAME_LENGTH,
  MAX_PARAMS_BYTES,
  presetsToImport,
} from "../../src/lib/preset-validate";

/**
 * What /api/presets accepts. The settings themselves are opaque - each page
 * loads old and partial presets already - so these are about which list, the
 * name, size, and never doubling a list when browser presets are imported.
 */

describe("isPresetStore", () => {
  test("accepts the choral and unison lists only", () => {
    expect(isPresetStore("abcsr_presets")).toBe(true);
    expect(isPresetStore("abcsr_unison_presets")).toBe(true);
    expect(isPresetStore("sr-theme")).toBe(false);
    expect(isPresetStore(null)).toBe(false);
  });
});

describe("checkName", () => {
  test("trims, and refuses empty or overlong names", () => {
    expect(checkName("  UIL 3  ")).toEqual({ ok: true, value: "UIL 3" });
    expect(checkName("   ").ok).toBe(false);
    expect(checkName(42).ok).toBe(false);
    expect(checkName("x".repeat(MAX_NAME_LENGTH)).ok).toBe(true);
    expect(checkName("x".repeat(MAX_NAME_LENGTH + 1)).ok).toBe(false);
  });
});

describe("checkParams", () => {
  test("wants a plain object under the size cap", () => {
    expect(checkParams({ key: "C" }).ok).toBe(true);
    expect(checkParams([1, 2]).ok).toBe(false);
    expect(checkParams("C").ok).toBe(false);
    expect(checkParams(null).ok).toBe(false);
    expect(checkParams({ big: "x".repeat(MAX_PARAMS_BYTES) }).ok).toBe(false);
  });
});

describe("checkNewPreset", () => {
  test("takes the list from the body, or from the caller when importing", () => {
    const body = { store: "abcsr_presets", name: "Warm-up", params: { bpm: 80 } };
    const own = checkNewPreset(body);
    expect(own.ok && own.value.store).toBe("abcsr_presets");
    const forced = checkNewPreset(body, "abcsr_unison_presets");
    expect(forced.ok && forced.value.store).toBe("abcsr_unison_presets");
    expect(checkNewPreset({ ...body, store: "elsewhere" }).ok).toBe(false);
  });

  test("keeps a real past creation time and drops anything else", () => {
    const base = { store: "abcsr_presets", name: "A", params: {} };
    const past = checkNewPreset({ ...base, createdAt: 1_700_000_000_000 });
    expect(past.ok && past.value.createdAt?.getTime()).toBe(1_700_000_000_000);
    const future = checkNewPreset({ ...base, createdAt: Date.now() + 86_400_000 });
    expect(future.ok && future.value.createdAt).toBeUndefined();
    const junk = checkNewPreset({ ...base, createdAt: "yesterday" });
    expect(junk.ok && junk.value.createdAt).toBeUndefined();
  });
});

describe("presetsToImport", () => {
  const at = (ms: number) => new Date(ms);
  const p = (name: string, ms: number) => ({
    store: "abcsr_presets" as const,
    name,
    params: {},
    createdAt: at(ms),
  });

  test("skips what the account already has, matched by name and time", () => {
    const fresh = presetsToImport([p("A", 1), p("B", 2), p("A", 3)], [{ name: "A", createdAt: at(1) }]);
    expect(fresh.map((x) => `${x.name}@${x.createdAt?.getTime()}`)).toEqual(["B@2", "A@3"]);
  });

  test("importing the same batch twice adds nothing the second time", () => {
    const batch = [p("A", 1), p("B", 2)];
    const first = presetsToImport(batch, []);
    const second = presetsToImport(
      batch,
      first.map((x) => ({ name: x.name, createdAt: x.createdAt! }))
    );
    expect(first).toHaveLength(2);
    expect(second).toHaveLength(0);
  });

  test("drops duplicates within one batch", () => {
    expect(presetsToImport([p("A", 1), p("A", 1)], [])).toHaveLength(1);
  });
});
