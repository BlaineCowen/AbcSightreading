import { expect, test } from "bun:test";
import { READERS, readerById, readerForTmeaPart, readerForTrack, sectionAllowed, stepOnReader, tracksFor } from "../../src/lib/readers";
import { TRACKS, trackById } from "../../src/lib/curriculum/tracks";
import { tmeaVoiceLevels } from "../../src/lib/tmea-presets";

test("every reader has a usable clef and range, and ids are unique", () => {
  expect(new Set(READERS.map((r) => r.id)).size).toBe(READERS.length);
  for (const r of READERS) {
    expect(["treble", "treble-8", "bass", "alto", "tenor"]).toContain(r.clef);
    expect(r.range.max).toBeGreaterThan(r.range.min);
    expect(r.anchor).toBeGreaterThanOrEqual(r.range.min - 7);
  }
});

test("every instrument course has its reader, with the course's clef, range and transposition", () => {
  for (const t of TRACKS) {
    const r = readerForTrack(t.id)!;
    expect(r).toBeDefined();
    expect(r.clef).toBe(t.clef);
    expect(r.range).toEqual(t.range);
    expect(r.transposeSemitones).toBe(t.transposeSemitones);
    expect(r.instrumentProgram).toBe(t.instrumentProgram);
  }
});

test("the four voice parts are TMEA's, with its Level I-II range and clef", () => {
  for (const part of ["Soprano", "Alto", "Tenor", "Bass"]) {
    const r = readerForTmeaPart(part)!;
    const level = tmeaVoiceLevels.find((l) => l.level === 1 && l.part === part)!;
    expect(r.family).toBe("voice");
    expect(r.clef).toBe(level.clef);
    expect(r.range).toEqual(level.range);
  }
});

test("a voice sees the sung levels, a player only its own course", () => {
  const soprano = readerById["soprano"];
  const trumpet = readerById["band-trumpet"];
  for (const s of ["steps", "nyssma", "tmea", "uil"] as const) {
    expect(sectionAllowed(soprano, s)).toBe(true);
    expect(sectionAllowed(trumpet, s)).toBe(false);
  }
  expect(sectionAllowed(soprano, "tracks")).toBe(false);
  expect(sectionAllowed(trumpet, "tracks")).toBe(true);
  expect(sectionAllowed(null, "tracks")).toBe(true);
  const subscribed = [trackById["band-trumpet"], trackById["band-clarinet"], trackById["orch-violin"]];
  expect(tracksFor(trumpet, subscribed).map((t) => t.id)).toEqual(["band-trumpet"]);
  expect(tracksFor(soprano, subscribed)).toEqual([]);
  expect(tracksFor(null, subscribed)).toEqual(subscribed);
});

test("a course step moves to the same step on another instrument of its family, never across", () => {
  expect(stepOnReader("band-trumpet-03", "band-trumpet", readerById["band-clarinet"])).toBe("band-clarinet-03");
  expect(stepOnReader("orch-violin-12", "orch-violin", readerById["orch-cello"])).toBe("orch-cello-12");
  expect(stepOnReader("band-trumpet-03", "band-trumpet", readerById["orch-cello"])).toBeNull();
  expect(stepOnReader("band-trumpet-03", "band-trumpet", readerById["tenor"])).toBeNull();
  // Every moved step exists.
  const moved = stepOnReader("band-alto-sax-07", "band-alto-sax", readerById["band-tuba"])!;
  expect(trackById["band-tuba"].steps.some((s) => s.id === moved)).toBe(true);
});
