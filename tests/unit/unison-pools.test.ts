import { describe, expect, test } from "bun:test";
import {
  drawFromPool, meterPoolClick, parsePool, parseSpan, poolFrom, sameKindPool, setupSnapshot, spanFrom, togglePoolMember,
} from "../../src/lib/unison-pools";
import { rangeForSpan } from "../../src/lib/ladder";

const KEYS = ["Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E"];

describe("key and meter pools", () => {
  test("a link names one key (old) or several", () => {
    expect(parsePool("F", KEYS)).toEqual(["F"]);
    expect(parsePool("C,F,Q,C", KEYS)).toEqual(["C", "F"]);
    expect(parsePool(null, KEYS)).toEqual([]);
  });

  test("a saved pool wins; an old preset's single key becomes a pool of one", () => {
    expect(poolFrom(["C", "F"], "G", KEYS, "F")).toEqual(["C", "F"]);
    expect(poolFrom(undefined, "G", KEYS, "F")).toEqual(["G"]);
    expect(poolFrom(["nope"], undefined, KEYS, "F")).toEqual(["F"]);
  });

  test("a click adds or removes, and the last one stays", () => {
    expect(togglePoolMember(["C"], "F")).toEqual(["C", "F"]);
    expect(togglePoolMember(["C", "F"], "C")).toEqual(["F"]);
    expect(togglePoolMember(["C"], "C")).toEqual(["C"]);
  });

  test("a pool of one never draws; a bigger one draws by the random number", () => {
    expect(drawFromPool(["F"], () => 0.99)).toBe("F");
    expect(drawFromPool(["C", "F", "G"], () => 0.5)).toBe("F");
    expect(drawFromPool(["C", "F", "G"], () => 0)).toBe("C");
    expect(drawFromPool(["C", "F", "G"], () => 0.999)).toBe("G");
    expect(() => drawFromPool([])).toThrow();
  });
});

describe("a meter pool holds one kind", () => {
  test("a meter of the pool's kind goes in or out; the other kind replaces the pool", () => {
    expect(meterPoolClick(["4/4"], "2/4")).toEqual(["4/4", "2/4"]);
    expect(meterPoolClick(["4/4", "2/4"], "4/4")).toEqual(["2/4"]);
    expect(meterPoolClick(["4/4"], "4/4")).toEqual(["4/4"]);
    expect(meterPoolClick(["4/4", "3/4"], "6/8")).toEqual(["6/8"]);
    expect(meterPoolClick(["6/8"], "9/8")).toEqual(["6/8", "9/8"]);
    expect(meterPoolClick(["6/8", "9/8"], "2/4")).toEqual(["2/4"]);
  });

  test("a link or saved pool that mixes kinds keeps the first meter's kind", () => {
    expect(sameKindPool(["4/4", "6/8", "3/4"])).toEqual(["4/4", "3/4"]);
    expect(sameKindPool(["12/8", "2/4", "6/8"])).toEqual(["12/8", "6/8"]);
    expect(sameKindPool(["2/4"])).toEqual(["2/4"]);
    expect(sameKindPool([])).toEqual([]);
  });
});

describe("a range that follows the key", () => {
  test("spans parse and are checked", () => {
    expect(parseSpan("-3,5")).toEqual([-3, 5]);
    expect(spanFrom([0, 4])).toEqual([0, 4]);
    expect(spanFrom([2, 4])).toBeNull(); // must include do
    expect(spanFrom([0, 15])).toBeNull(); // over two octaves
    expect(parseSpan("x")).toBeNull();
    expect(parseSpan(null)).toBeNull();
  });

  test("the saved setup is the pool's, not the key drawn - a draw is not an edit", () => {
    const s = { keys: ["C", "F"], meters: ["4/4", "2/4"], span: [0, 4] as [number, number], anchor: 14, range: { min: 17, max: 21 } };
    // range {17,21} is F's placement - what the page holds after drawing F.
    const expected = {
      selectedKeys: ["C", "F"], selectedKey: "C",
      selectedTimeSignatures: ["4/4", "2/4"], selectedTimeSignature: "4/4",
      selectedRange: { min: 14, max: 18 }, // C4-G4, placed for the pool's first key
      rangeSpan: [0, 4], rangeAnchor: 14,
    };
    expect(setupSnapshot(s)).toEqual(expected);
    // Every key the pool can draw, placed from the same anchor, saves the same setup.
    for (const key of ["C", "F", "C", "F"]) {
      const range = rangeForSpan(s.span, key, s.anchor)!;
      expect(JSON.stringify(setupSnapshot({ ...s, range }))).toBe(JSON.stringify(expected));
    }
  });

  test("without a span the range is the teacher's, and no span fields are saved", () => {
    expect(setupSnapshot({ keys: ["F"], meters: ["4/4"], span: null, anchor: 14, range: { min: 14, max: 21 } })).toEqual({
      selectedKeys: ["F"], selectedKey: "F", selectedTimeSignatures: ["4/4"], selectedTimeSignature: "4/4",
      selectedRange: { min: 14, max: 21 },
    });
  });
});
