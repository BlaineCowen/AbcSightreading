import { describe, expect, test } from "bun:test";
import { barChords, bassAbc, bassNote, harmonyNotes, progressionChords, type HarmonyChord, type HarmonyNote } from "../../src/lib/play-along/bass";
import { createNewSr } from "../../src/lib/generateUnison";
import { rhythms as allRhythms } from "../../src/resources/rhythms";
import { timeSignatureFor } from "../../src/lib/meter";

/**
 * The pitched play-along's bass: one chord a bar from the generator's
 * note-by-note chords, its root held, ending on a cadence.
 */

const I: HarmonyChord = { name: "1", root: 0, triadNotes: [0, 2, 4] };
const IV: HarmonyChord = { name: "4", root: 3, triadNotes: [3, 5, 0] };
const V: HarmonyChord = { name: "5", root: 4, triadNotes: [4, 6, 1] };
const ii: HarmonyChord = { name: "2", root: 1, triadNotes: [1, 3, 5] };
const q = (degree: number, chord: HarmonyChord, length = 8): HarmonyNote => ({ length, degree, chord });

describe("one chord a bar", () => {
  test("the chord that fits the bar's melody wins over one under a passing note", () => {
    // Bar 1: do mi so fa - mostly I, one note the generator put on IV.
    // Bar 2: fa la do la - IV. Then a cadence V, I.
    const notes = [q(0, I), q(2, I), q(4, I), q(3, IV), q(3, IV), q(5, IV), q(0, IV), q(5, IV), q(4, V, 16), q(6, V, 16), q(0, I, 32)];
    expect(barChords(notes, 32, 8).map((c) => c.name)).toEqual(["1", "4", "5", "1"]);
  });

  test("the downbeat counts most when the bar is split", () => {
    // re (ii) on the downbeat for a half, then do mi on I: ii's half note on beat 1 outweighs.
    const notes = [q(1, ii, 16), q(0, I), q(2, I), q(0, I, 32), q(0, I, 32)];
    expect(barChords(notes, 32, 8)[0].name).toBe("2");
  });

  test("it ends on the home chord, with the dominant before it when the melody allows", () => {
    const notes = [q(0, I, 32), q(3, IV, 32), q(1, ii, 32), q(2, I, 32)];
    const chords = barChords(notes, 32, 8);
    expect(chords.at(-1)!.root).toBe(0);
    // Bar 3 sings re, a tone of V: the dominant.
    expect(chords.at(-2)!.root).toBe(4);
  });

  test("no dominant where the melody before the end does not fit it", () => {
    // Bar 3 sings fa and la over IV: not a V tone among them.
    const notes = [q(0, I, 32), q(0, I, 32), q(3, IV, 16), q(5, IV, 16), q(0, I, 32)];
    expect(barChords(notes, 32, 8).at(-2)!.name).toBe("4");
  });

  test("a leading-tone chord takes the dominant's root; minor's own VII stays", () => {
    const vii: HarmonyChord = { name: "7", root: 6, triadNotes: [6, 1, 3] };
    const notes = [q(6, vii, 32), q(0, I, 32), q(0, I, 32), q(0, I, 32)];
    expect(barChords(notes, 32, 8)[0].root).toBe(4);
    // In minor the natural VII (a whole tone below the tonic) is its own chord...
    expect(barChords(notes, 32, 8, true)[0].root).toBe(6);
    // ...and the raised one (the leading tone) is the dominant's stand-in.
    const raisedVii: HarmonyChord = { ...vii, sharpScaleDegree: 6 };
    expect(barChords([q(6, raisedVii, 32), q(0, I, 32), q(0, I, 32), q(0, I, 32)], 32, 8, true)[0].root).toBe(4);
  });

  test("a bar of rests keeps the chord before it", () => {
    const rest: HarmonyNote = { length: 32, degree: 0, rest: true, chord: null };
    const notes = [q(3, IV, 32), rest, q(0, I, 32), q(0, I, 32), q(0, I, 32)];
    expect(barChords(notes, 32, 8)[1].name).toBe("4");
  });
});

describe("spelling the bass", () => {
  test("roots sit between E2 and D3, in the key", () => {
    expect(bassNote("C", { root: 0, shift: null, name: "1" })).toBe("C");
    expect(bassNote("C", { root: 4, shift: null, name: "5" })).toBe("G,");
    expect(bassNote("F", { root: 3, shift: null, name: "4" })).toBe("B,"); // B flat, from the key signature
    expect(bassNote("D", { root: 0, shift: null, name: "1" })).toBe("D");
    expect(bassNote("A", { root: 0, shift: null, name: "1" })).toBe("A,");
  });

  test("a chromatic root gets the accidental it needs against the key", () => {
    // vii of V in C: F sharp.
    expect(bassNote("C", { root: 3, shift: "up", name: "7/5" })).toBe("^F,");
    // In F major degree 3 is B flat: raised, it is B natural.
    expect(bassNote("F", { root: 3, shift: "up", name: "7/5" })).toBe("=B,");
  });

  test("one note a bar, tied where a bar has no single note (9/8)", () => {
    const chords = [{ root: 0, shift: null, name: "1" }, { root: 4, shift: null, name: "5" }] as const;
    const abc44 = bassAbc([...chords], { key: "C", meter: "4/4", barUnits: 32 });
    expect(abc44).toContain("K:C clef=bass");
    expect(abc44).toContain("C32 |G,32 |]");
    const abc98 = bassAbc([...chords], { key: "C", meter: "9/8", barUnits: 36 });
    expect(abc98).toContain("C24-C12 |G,24-G,12 |]");
  });
});

describe("over a progression", () => {
  test("the bass plays the progression's roots, splitting a bar where it splits", () => {
    const bars = progressionChords([["1"], ["6", "4"], ["5"], ["1"]]);
    expect(bassAbc(bars, { key: "C", meter: "4/4", barUnits: 32 })).toContain("C32 |A,16 F,16 |G,32 |C32 |]");
    // 3/4: two beats and one.
    expect(bassAbc(progressionChords([["4", "5"]]), { key: "G", meter: "3/4", barUnits: 24 })).toContain("C16 D8 |]");
    // Chromatic chords: the flat seventh chord's root is B flat; V/V's is D.
    expect(bassAbc(progressionChords([["u_b7"], ["5/5"]]), { key: "C", meter: "4/4", barUnits: 32 })).toContain("_B,32 |D32 |]");
  });
});

describe("on real exercises", () => {
  const names = ["quarter", "half", "eighthEighth", "dotHalf"];
  const generate = (key: string, meter: string, measures: number) => {
    const out: any = createNewSr({
      bpm: 80, tempo: 80, clef: "treble", selectedClef: "treble", timeSig: timeSignatureFor(meter), selectedTimeSignature: meter,
      measures, maxSkip: 4, range: { min: 14, max: 21 }, selectedRhythms: names, rhythms: allRhythms.filter((r) => names.includes(r.name)),
      scaleDegrees: new Set([1, 2, 3, 4, 5, 6, 7]), key, chords: ["1", "2", "3", "4", "5", "6", "7"], showSolfege: true, rhythmOnly: false,
      showRhythmSyllables: true, syllableSystemId: "kodaly", allowTiesAcrossBarline: false,
      partsObject: { numofParts: 1, parts: { Unison: { chordNoteObject: [], order: 0, smallName: "U", selectedRange: [14, 21] } } },
    } as any);
    return out[2];
  };

  for (const [key, meter] of [["F", "4/4"], ["G", "3/4"], ["D", "2/4"], ["Bb", "4/4"]] as const) {
    test(`${key} ${meter}: a chord a bar, ending home, fitting most of the melody`, () => {
      // Random melodies vary, so the fit is held on average over ten (measured
      // about 73%), with a floor for any one exercise.
      const fits: number[] = [];
      for (let run = 0; run < 10; run++) {
        const score = generate(key, meter, 24);
        const notes = harmonyNotes(score.partsObject.parts.Unison.chordNoteObject);
        const bar = score.timeSig.tsPerMeasure;
        const chords = barChords(notes, bar, 8);
        expect(chords.length).toBe(24);
        expect(chords.at(-1)!.root).toBe(0);
        // No bar holds the leading tone in the bass (these keys are all major).
        expect(chords.some((c) => c.root === 6 && c.shift === null)).toBe(false);
        // Most of the sung time sits on a tone of its bar's chord.
        let on = 0, total = 0, pos = 0;
        for (const n of notes) {
          const c = chords[Math.floor(pos / bar)];
          pos += n.length;
          if (n.rest) continue;
          total += n.length;
          const tones = [c.root, c.root + 2, c.root + 4].map((d) => d % 7);
          if (tones.includes(((n.degree % 7) + 7) % 7)) on += n.length;
        }
        fits.push(on / total);
        expect(on / total).toBeGreaterThan(0.45);
        // And the bass is written for every bar, in the key.
        const abc = bassAbc(chords, { key, meter, barUnits: bar });
        expect(abc.split("|").length - 1).toBe(24);
      }
      expect(fits.reduce((a, b) => a + b, 0) / fits.length).toBeGreaterThan(0.62);
    });
  }
});
