import { describe, expect, test } from "bun:test";
import { copyrightLine, midiWithCopyright, withCopyright } from "../../src/lib/copyright";
import { abcFileFor, midiFileFor } from "../../src/lib/exports";
import { abcToMusicXml } from "../../src/lib/musicxml";

const ABC = "X:1\nM:4/4\nL:1/8\nK:C\nCDEF GABc|c2B2 A4|]\n";
const day = new Date("2026-10-06T12:00:00Z");

describe("every exercise carries its copyright", () => {
  test("the line", () => {
    expect(copyrightLine(day)).toBe("© 2026 abcSightReading · abc-sightreading.com");
  });
  test("under the score: centred after the tune, and only once", () => {
    const once = withCopyright(ABC, { date: day });
    expect(once.endsWith("%%center © 2026 abcSightReading · abc-sightreading.com\n")).toBe(true);
    expect(withCopyright(once, { date: day })).toBe(once);
  });
  test("the ABC file", () => {
    expect(abcFileFor(ABC, 90)).toContain("%%center ©");
  });
  test("the MusicXML's rights", () => {
    expect(abcToMusicXml(ABC)).toMatch(/<rights>© \d{4} abcSightReading · abc-sightreading\.com<\/rights>/);
  });
  test("the MIDI file: a copyright notice opening track 1, and every chunk's length still adds up", () => {
    const file = midiFileFor(ABC, { bpm: 90 });
    const tag = (at: number) => String.fromCharCode(...file.subarray(at, at + 4));
    let at = 0, chunks = 0;
    while (at < file.length) {
      expect(["MThd", "MTrk"]).toContain(tag(at));
      at += 8 + new DataView(file.buffer, file.byteOffset + at + 4, 4).getUint32(0);
      chunks++;
    }
    expect(at).toBe(file.length);
    expect(chunks).toBeGreaterThan(1);
    const first = 8 + 6 + 8; // MThd (8 + 6), then MTrk's own 8
    expect([...file.subarray(first, first + 3)]).toEqual([0x00, 0xff, 0x02]);
    expect(new TextDecoder().decode(file)).toContain("abc-sightreading.com");
  });
  test("a file that is not MIDI is left as it was", () => {
    const junk = new Uint8Array([1, 2, 3]);
    expect(midiWithCopyright(junk)).toBe(junk);
  });
});
