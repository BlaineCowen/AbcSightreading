import { describe, expect, test } from "bun:test";
import { TAKE_ALIGN_MS, noteAt, takeOffset } from "../../src/lib/grade-playback";

describe("hearing your take: which note is sounding", () => {
  const spans = [{ from: 1000, to: 2000 }, { from: 2000, to: 2500 }, { from: 2500, to: 4000 }];
  test("none before the first note, then each as its span begins", () => {
    expect(noteAt(spans, 900)).toBe(-1);
    expect(noteAt(spans, 1000)).toBe(0);
    expect(noteAt(spans, 1999)).toBe(0);
    expect(noteAt(spans, 2000)).toBe(1);
    expect(noteAt(spans, 3999)).toBe(2);
  });
  test("after the last note it stays on the last", () => {
    expect(noteAt(spans, 9000)).toBe(2);
  });
  test("Note by note: uneven spans, with gaps between them (the waits)", () => {
    const waited = [{ from: 1000, to: 1300 }, { from: 5000, to: 5200 }];
    expect(noteAt(waited, 3000)).toBe(0);
    expect(noteAt(waited, 5100)).toBe(1);
  });
});

describe("hearing your take: the page's clock against the recording's", () => {
  test("a moment of the run is that far into the recording", () => {
    expect(takeOffset(12_500, 10_000)).toBeCloseTo(2.5 + TAKE_ALIGN_MS / 1000, 6);
  });
});
