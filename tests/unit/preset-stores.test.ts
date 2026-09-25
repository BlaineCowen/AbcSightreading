import { beforeEach, describe, expect, test } from "bun:test";
import {
  getPresets,
  savePreset,
  deletePreset,
  renamePreset,
  updatePreset,
  UNISON_PRESET_STORE,
} from "../../src/lib/preset-storage";

/**
 * Unison presets live in their own list. A choral preset has a voicing and no
 * clef; a unison one the reverse - offered in each other's dropdown, either
 * would apply half its settings and silently leave the rest.
 */

// A minimal localStorage for bun, which has none.
const memory = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (memory.has(k) ? memory.get(k)! : null),
  setItem: (k: string, v: string) => void memory.set(k, v),
  removeItem: (k: string) => void memory.delete(k),
  clear: () => memory.clear(),
};

beforeEach(() => memory.clear());

describe("preset stores", () => {
  test("a unison preset is not in choral's list, and the reverse", () => {
    savePreset("Unison drill", { selectedClef: "bass", measures: 4 }, UNISON_PRESET_STORE);
    savePreset("Choral drill", { voicing: "4 Part Mixed" } as any);
    expect(getPresets(UNISON_PRESET_STORE).map((p) => p.name)).toEqual(["Unison drill"]);
    expect(getPresets().map((p) => p.name)).toEqual(["Choral drill"]);
  });

  test("the settings come back as they were saved", () => {
    const params = { selectedClef: "bass", selectedKey: "D", measures: 4, lyricSystem: "fixed" };
    savePreset("D bass", params, UNISON_PRESET_STORE);
    expect(getPresets<typeof params>(UNISON_PRESET_STORE)[0].params).toEqual(params);
  });

  test("deleting and renaming only touch the list they are given", () => {
    const u = savePreset("Same name", { measures: 4 }, UNISON_PRESET_STORE);
    const c = savePreset("Same name", { voicing: "3 Part Treble" } as any);
    expect(deletePreset(c.id, UNISON_PRESET_STORE)).toBe(false);
    expect(renamePreset(u.id, "Renamed", UNISON_PRESET_STORE)).toBe(true);
    expect(getPresets().map((p) => p.name)).toEqual(["Same name"]);
    expect(deletePreset(u.id, UNISON_PRESET_STORE)).toBe(true);
    expect(getPresets(UNISON_PRESET_STORE)).toEqual([]);
    expect(getPresets()).toHaveLength(1);
  });

  test("saving over a preset keeps its id, name, place and creation time", () => {
    const a = savePreset("First", { bpm: 60 } as any);
    const b = savePreset("Second", { bpm: 70 } as any);
    const updated = updatePreset(a.id, { params: { bpm: 90 } as any });
    expect(updated).toEqual({ ...a, params: { bpm: 90 } as any });
    expect(getPresets().map((p) => [p.id, p.name, (p.params as any).bpm])).toEqual([
      [a.id, "First", 90],
      [b.id, "Second", 70],
    ]);
    expect(updatePreset("missing", { name: "x" })).toBeNull();
  });

  test("choral's existing presets are still read from where they always were", () => {
    memory.set("abcsr_presets", JSON.stringify([{ id: "1", name: "Old", createdAt: 0, params: {} }]));
    expect(getPresets().map((p) => p.name)).toEqual(["Old"]);
  });
});
