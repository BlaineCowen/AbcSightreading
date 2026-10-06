import { describe, expect, test } from "bun:test";
import { BACKING_TRACKS, guideTranspose } from "../../src/lib/play-along/backing-tracks";

describe("a pitched rhythm guide plays on the track's tonic", () => {
  test("each song's tonic, the nearest to the staff's B4 (F4 to E5)", () => {
    const at = (id: string) => 71 + guideTranspose(BACKING_TRACKS.find((t) => t.id === id));
    expect(at("soul-4-4-80")).toBe(70); // B flat 4
    expect(at("trap-4-4-70")).toBe(69); // A4
    expect(at("cumbia-4-4-100")).toBe(65); // F4
    expect(at("cumbia-2-4-100")).toBe(65);
    expect(at("reggaeton-4-4-108")).toBe(67); // G4
  });
  test("a drum loop has no key: C", () => {
    expect(71 + guideTranspose(BACKING_TRACKS.find((t) => t.id.startsWith("drums-")))).toBe(72);
    expect(guideTranspose(null)).toBe(1);
  });
  test("every song (not a drum loop) has a tonic", () => {
    for (const t of BACKING_TRACKS) if (!t.id.startsWith("drums-")) expect(t.tonic, t.id).toBeNumber();
  });
});
