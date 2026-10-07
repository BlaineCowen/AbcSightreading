import { describe, expect, test } from "bun:test";
import { BAND_TRACKS, RHYTHM_LEAD, RHYTHM_THREAD, writtenKey } from "../../src/lib/curriculum/band";
import { TRACKS, findStep, trackPresetKey } from "../../src/lib/curriculum/tracks";
import { rangeForSpan } from "../../src/lib/ladder";
import { selectableRhythms, selectableCompoundRhythms } from "../../src/lib/selectable-rhythms";
import { MAJOR_KEYS } from "../../src/lib/minor-degrees";

const introducedBy = (n: number) => new Set(RHYTHM_THREAD.slice(0, n).flatMap((s) => s.add));
const offered = new Set([...selectableRhythms, ...selectableCompoundRhythms].map((r) => r.name));

describe("beginner band tracks", () => {
  test("the band in score order and the orchestra, each the full sequence", () => {
    expect(BAND_TRACKS.map((t) => t.id)).toEqual([
      "band-flute", "band-oboe", "band-clarinet", "band-bassoon", "band-alto-sax", "band-tenor-sax", "band-bari-sax",
      "band-trumpet", "band-horn", "band-trombone", "band-euphonium", "band-tuba",
    ]);
    expect(TRACKS.filter((t) => t.family === "strings").map((t) => t.id)).toEqual(["orch-violin", "orch-viola", "orch-cello", "orch-bass"]);
    for (const t of TRACKS) expect(t.steps.length).toBe(RHYTHM_THREAD.length);
  });

  test("each instrument reads the concert key in its own written key", () => {
    expect(["Bb", "Eb", "F", "C"].map((k) => writtenKey(k, -2))).toEqual(["C", "F", "G", "D"]); // B♭ clarinet, trumpet
    expect(["Bb", "Eb", "F", "C"].map((k) => writtenKey(k, -14))).toEqual(["C", "F", "G", "D"]); // tenor sax
    expect(["Bb", "Eb", "F", "C"].map((k) => writtenKey(k, -9))).toEqual(["G", "C", "D", "A"]); // alto sax
    expect(["Bb", "Eb", "F", "C"].map((k) => writtenKey(k, -21))).toEqual(["G", "C", "D", "A"]); // bari sax
    expect(["Bb", "Eb", "F", "C"].map((k) => writtenKey(k, -7))).toEqual(["F", "Bb", "C", "G"]); // horn in F
    expect(writtenKey("D", -12)).toBe("D"); // string bass
  });

  test("the orchestra starts in D, then G, then A, at pitch", () => {
    const v = TRACKS.find((t) => t.id === "orch-violin")!;
    expect([3, 6, 9].map((n) => v.steps[n - 1].notes!.keys)).toEqual([["D"], ["G"], ["A"]]);
    expect(TRACKS.find((t) => t.id === "orch-viola")!.clef).toBe("alto");
    expect(TRACKS.find((t) => t.id === "orch-bass")!.transposeSemitones).toBe(-12);
  });

  test("ids are unique across every track, and a step is found by its id", () => {
    const ids = TRACKS.flatMap((t) => t.steps.map((s) => s.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(findStep("band-trumpet-03")?.step.number).toBe(3);
    expect(trackPresetKey("band-tuba-05", "notes")).toBe("track:band-tuba-05:notes");
  });

  test("the rhythm runs two steps ahead: every note exercise uses only rhythms learned RHYTHM_LEAD or more steps before", () => {
    for (const t of TRACKS) {
      for (const s of t.steps) {
        if (!s.notes) continue;
        const known = introducedBy(s.number - RHYTHM_LEAD);
        for (const r of s.notes.rhythms) expect({ track: t.id, step: s.number, r, known: known.has(r) }).toMatchObject({ known: true });
      }
    }
  });

  test("no notes before there are rhythms to put them on", () => {
    for (const t of TRACKS) {
      for (const s of t.steps) expect(!!s.notes).toBe(s.number > RHYTHM_LEAD);
    }
  });

  test("each rhythm drill brings in one new figure (or a meter, or ties), never more than the thread's step", () => {
    for (let i = 1; i < RHYTHM_THREAD.length; i++) {
      const before = introducedBy(i), now = introducedBy(i + 1);
      const added = [...now].filter((r) => !before.has(r));
      expect(added).toEqual(RHYTHM_THREAD[i].add);
    }
  });

  test("every rhythm named is one the picker offers, in a meter of its kind", () => {
    for (const t of TRACKS) for (const s of t.steps) for (const p of [s.rhythm, s.notes].filter(Boolean)) {
      for (const r of p!.rhythms) expect({ r, ok: offered.has(r) }).toEqual({ r, ok: true });
      expect(p!.rhythms.length).toBeGreaterThan(0);
    }
  });

  test("written keys are the page's, and every key's do sits inside the instrument's first-year range", () => {
    for (const t of TRACKS) for (const s of t.steps) {
      if (!s.notes) continue;
      for (const k of s.notes.keys!) {
        expect(MAJOR_KEYS).toContain(k);
        const placed = rangeForSpan([0, 0], k, t.anchor)!;
        expect({ track: t.id, step: s.number, key: k, do: placed.min, inRange: placed.min >= t.range.min && placed.min <= t.range.max })
          .toMatchObject({ inRange: true });
      }
    }
  });

  test("trumpet and clarinet sound a step lower than written; tuba reads concert pitch in bass clef", () => {
    const by = Object.fromEntries(BAND_TRACKS.map((t) => [t.id, t]));
    expect(by["band-trumpet"].transposeSemitones).toBe(-2);
    expect(by["band-clarinet"].transposeSemitones).toBe(-2);
    expect(by["band-tuba"]).toMatchObject({ transposeSemitones: 0, clef: "bass" });
    // Concert B♭ first: written C for B♭ instruments, B♭ for tuba.
    expect(by["band-trumpet"].steps[2].notes!.keys).toEqual(["C"]);
    expect(by["band-tuba"].steps[2].notes!.keys).toEqual(["Bb"]);
  });
});

import { trackStepOptions } from "../../src/lib/curriculum/options";
import { trackById } from "../../src/lib/curriculum/tracks";

describe("a step as the Unison page's options", () => {
  test("trumpet step 3 notes: treble, written C, quarters only, plays on trumpet a step down", () => {
    const t = trackById["band-trumpet"];
    const o = trackStepOptions(t, t.steps[2], "notes");
    expect(o).toMatchObject({
      selectedClef: "treble", selectedKey: "C", rhythmOnly: false,
      selectedRhythms: ["quarter", "quarterRest"], instrumentProgram: 56, transposeSemitones: -2,
      selectedScaleDegrees: [1, 2, 3],
    });
    expect(o.selectedRange).toEqual({ min: 14, max: 16 }); // C4 to E4
  });

  test("tuba is bass clef at concert pitch; a rhythm drill is rhythm only with Counting", () => {
    const t = trackById["band-tuba"];
    expect(trackStepOptions(t, t.steps[2], "notes")).toMatchObject({ selectedClef: "bass", selectedKey: "Bb", transposeSemitones: 0, instrumentProgram: 58 });
    expect(trackStepOptions(t, t.steps[0], "rhythm")).toMatchObject({ rhythmOnly: true, showRhythmSyllables: true, syllableSystemId: "counting" });
  });

  test("every step's range sits inside its instrument's", () => {
    for (const t of TRACKS) for (const s of t.steps) for (const k of ["rhythm", "notes"] as const) {
      const r = trackStepOptions(t, s, k).selectedRange as { min: number; max: number };
      expect(r.min >= t.range.min && r.max <= t.range.max && r.max > r.min).toBe(true);
    }
  });
});
