import { describe, expect, test } from "bun:test";
import { createNewSr } from "../../src/lib/generateUnison";
import { timeSignatureFor } from "../../src/lib/meter";
import { selectableRhythms } from "../../src/lib/selectable-rhythms";
import { minorSyllable } from "../../src/resources/solfege";
import { MINOR_KEYS, minorScaleName } from "../../src/lib/minor-degrees";

/**
 * Minor keys on the Unison page: the generator writes them from the shared key
 * table, counts degrees from the minor tonic, and sings them la- or do-based.
 */
const quiet = () => {};
const RHYTHMS = ["quarter", "half", "eighthEighth"];

function minor(key: string, extra: Record<string, unknown> = {}) {
  const saved = { log: console.log, warn: console.warn, error: console.error };
  Object.assign(console, { log: quiet, warn: quiet, error: quiet });
  try {
    const out = createNewSr({
      bpm: 72, tempo: 72, clef: "treble", selectedClef: "treble",
      timeSig: timeSignatureFor("4/4"), selectedTimeSignature: "4/4",
      measures: 8, maxSkip: 4, range: { min: 14, max: 24 },
      rhythms: selectableRhythms.filter((r) => RHYTHMS.includes(r.name)), selectedRhythms: RHYTHMS,
      scaleDegrees: [1, 2, 3, 4, 5, 6, 7], selectedSharpDegrees: [], selectedFlatDegrees: [], key,
      showSolfege: true, lyricSystem: "movable", rhythmOnly: false, showRhythmSyllables: false,
      syllableSystemId: "kodaly", moveOnEighthNotes: true, accidentalsFollowStep: true,
      progressions: true,
      ...extra,
      partsObject: { numofParts: 1, parts: { Unison: { order: 0, smallName: "U" } } },
    } as any) as any;
    return out?.[0] as string | undefined;
  } finally {
    Object.assign(console, saved);
  }
}

const body = (abc: string) => abc.split("\n").find((l) => l.includes("|") && !l.startsWith("w:")) ?? "";
const words = (abc: string) => (abc.split("\n").find((l) => l.startsWith("w:")) ?? "").slice(2).trim().split(/\s+/);

describe("minor syllables", () => {
  test("la-based: the tonic is la, raised 6 and 7 fi and si, lowered 2 te", () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((d) => minorSyllable(d, null, "la"))).toEqual(["la", "ti", "do", "re", "mi", "fa", "so"]);
    expect(minorSyllable(5, "sharp", "la")).toBe("fi");
    expect(minorSyllable(6, "sharp", "la")).toBe("si");
    expect(minorSyllable(1, "flat", "la")).toBe("te");
  });
  test("do-based: do re me fa so le te, raised 6 and 7 la and ti, lowered 2 ra", () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((d) => minorSyllable(d, null, "do"))).toEqual(["do", "re", "me", "fa", "so", "le", "te"]);
    expect(minorSyllable(5, "sharp", "do")).toBe("la");
    expect(minorSyllable(6, "sharp", "do")).toBe("ti");
    expect(minorSyllable(1, "flat", "do")).toBe("ra");
  });
  test("the scale the raised notes make", () => {
    expect(minorScaleName([], "la")).toBe("Natural minor");
    expect(minorScaleName([7], "la")).toBe("Harmonic minor (si)");
    expect(minorScaleName([6, 7], "do")).toBe("Melodic minor (la, ti)");
  });
});

describe("minor exercises", () => {
  test("every minor key writes, starting and ending on its tonic triad", () => {
    for (const key of MINOR_KEYS) {
      for (let r = 0; r < 3; r++) {
        const abc = minor(key);
        expect(abc).toBeTruthy();
        const w = words(abc!);
        // La-based: the tonic triad is la do mi, and the line ends home on la.
        expect(["la", "do", "mi"]).toContain(w[0]);
        expect(w[w.length - 1]).toBe("la");
      }
    }
  }, 60000);

  test("do-based minor ends on do", () => {
    for (let r = 0; r < 3; r++) {
      const w = words(minor("Am", { minorSolfege: "do" })!);
      expect(["do", "me", "so"]).toContain(w[0]);
      expect(w[w.length - 1]).toBe("do");
      expect(w).not.toContain("la");
    }
  });

  test("raised 7 is written, as si resolving up to la (G sharp in A, B natural in C minor)", () => {
    for (const [key, raised, home] of [["Am", "^G", "A"], ["Cm", "=B", "c"]] as const) {
      let found = 0;
      for (let r = 0; r < 4; r++) {
        const abc = minor(key, { selectedSharpDegrees: [7] })!;
        // Sung notes only (a rest has no syllable), beamed or not.
        const notes = body(abc).match(/[_^=]*[A-Ga-g][,']*\d*/g) ?? [];
        const w = words(abc);
        notes.forEach((n, i) => {
          if (!n.startsWith(raised)) return;
          found++;
          expect(w[i]).toBe("si");
          expect(notes[i + 1]?.replace(/\d+/g, "")).toBe(home);
        });
      }
      expect(found).toBeGreaterThan(0);
    }
  }, 60000);
});

describe("the practice tools in minor", () => {
  test("the tonic is the minor tonic; do moves with the minor solfège", async () => {
    const { exerciseInfo } = await import("../../src/lib/tools/context");
    const abc = "X:1\nM:4/4\nL:1/4\nK:Am\nA c e A|]\n";
    const la = exerciseInfo(abc)!;
    expect([la.tonicLabel, la.tonicSyllable, la.doLabel]).toEqual(["A", "la", "C"]);
    const dob = exerciseInfo(abc, "do")!;
    expect([dob.tonicLabel, dob.tonicSyllable, dob.doLabel]).toEqual(["A", "do", "A"]);
    const major = exerciseInfo("X:1\nM:4/4\nL:1/4\nK:Bb\nB d f B|]\n")!;
    expect([major.tonicLabel, major.doLabel, major.tonicSyllable]).toEqual(["B♭", "B♭", "do"]);
  });
});
