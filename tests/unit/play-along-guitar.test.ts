import { describe, expect, test } from "bun:test";
import { existsSync } from "fs";
import {
  GUITAR_RENDER_KEYS,
  GUITAR_SLOTS,
  GUITAR_TEMPOS,
  guitarChord,
  guitarDouble,
  guitarFeel,
  guitarPart,
  nearestGuitarTempo,
  transposeKey,
  type GuitarSlot,
} from "../../src/lib/play-along/guitar";
import { PROGRESSIONS, EXTRA_CHORDS } from "../../src/lib/unison-progressions";
import manifest from "../../src/lib/play-along/guitar-manifest.json";

/**
 * The pitched play-along's guitar: the progression's chords as the guitar
 * plays them, a clip a bar, A and B patterns by phrase, an ending to finish.
 */

describe("chords in a key", () => {
  test("an exercise without a progression names inverted chords; the guitar strums their own chord (it was silent on them)", () => {
    // The older walk's chords (mi so la has no progression): chords.ts keeps an inversion's bass note in `root`.
    const ids = ["6-6", "1-64", "1-6", "5-7-42", "5/5-6", "4-64"].map((n) => guitarChord("G", n)?.id);
    expect(ids).toEqual(["Em", "G", "G", "D7", "A", "C"]);
    // Every one of them was rendered.
    for (const id of ids) expect((manifest as any).patterns["passengerA@90"].chords).toContain(id);
  });
  test("vii (diminished, never rendered) is strummed as V7", () => {
    expect(guitarChord("G", "7")?.id).toBe("D7");
    expect(guitarChord("F", "7")?.id).toBe("C7");
  });

  test("the progression's names become chords", () => {
    const inC = (name: string) => guitarChord("C", name)?.id;
    expect(inC("1")).toBe("C");
    expect(inC("6")).toBe("Am");
    expect(inC("2")).toBe("Dm");
    expect(inC("5/5")).toBe("D");
    expect(inC("5/6")).toBe("E");
    expect(inC("1-7")).toBe("C7");
    expect(inC("u_b7")).toBe("Bb");
    expect(inC("m4")).toBe("Fm");
    expect(inC("u_borrowed_i")).toBe("Cm");
    expect(guitarChord("Eb", "5")?.id).toBe("Bb");
    expect(guitarChord("E", "5/5")?.id).toBe("Gb"); // F sharp, named by its pitch class
  });
});

describe("the part", () => {
  const harmony = [["1"], ["4"], ["5"], ["1"], ["1"], ["4", "5/5"], ["5"], ["1"]];

  test("A for the first phrase, B for the second, an ending last", () => {
    const part = guitarPart(harmony, { key: "C", meter: "4/4", style: "passenger", splitAt: 0.5 });
    expect(part.slice(0, 4).map((p) => p.slot)).toEqual(["passengerA", "passengerA", "passengerA", "passengerA"]);
    expect(part.filter((p) => p.at >= 4 && !p.ending).every((p) => p.slot === "passengerC")).toBe(true);
    const last = part.at(-1)!;
    expect(last).toMatchObject({ at: 7, chord: "C", ending: true });
  });

  test("a split bar plays the first chord to the split and the second from it", () => {
    const part = guitarPart(harmony, { key: "C", meter: "4/4", style: "campfire", splitAt: 0.5 });
    const bar6 = part.filter((p) => p.at >= 5 && p.at < 6);
    expect(bar6).toEqual([
      { at: 5, chord: "F", slot: "campfireB", from: 0, to: 0.5 },
      { at: 5.5, chord: "D", slot: "campfireB", from: 0.5, to: 1 },
    ]);
  });

  test("2/4 takes the 4/4 bar's halves in turn; 6/8 half a triplet bar, 9/8 three quarters", () => {
    const two = guitarPart([["1"], ["4"], ["5"], ["1"]], { key: "G", meter: "2/4", style: "passenger", splitAt: 0.5 });
    expect(two.slice(0, 3).map((p) => [p.from, p.to])).toEqual([[0, 0.5], [0.5, 1], [0, 0.5]]);
    expect(guitarFeel("6/8")).toEqual({ feel: "triplet", share: 0.5 });
    expect(guitarFeel("9/8")).toEqual({ feel: "triplet", share: 0.75 });
    expect(guitarFeel("12/8")).toEqual({ feel: "triplet", share: 1 });
    expect(guitarFeel("3/4")).toEqual({ feel: "waltz", share: 1 });
    const six = guitarPart([["1"], ["1"]], { key: "D", meter: "6/8", style: "passenger", splitAt: 0.5 });
    expect(six[0]).toMatchObject({ slot: "irishA", from: 0, to: 0.5 });
  });

  test("the count-in strums the home chord in the A pattern", () => {
    const part = guitarPart(harmony, { key: "F", meter: "4/4", style: "passenger", splitAt: 0.5, countInBars: 2 });
    expect(part.slice(0, 2)).toEqual([
      { at: -2, chord: "F", slot: "passengerA", from: 0, to: 1 },
      { at: -1, chord: "F", slot: "passengerA", from: 0, to: 1 },
    ]);
    expect(part[2]).toMatchObject({ at: 0, chord: "F" });
    // 2/4: the halves keep alternating through the count-in into the music.
    const two = guitarPart([["1"], ["5"], ["1"]], { key: "C", meter: "2/4", style: "passenger", splitAt: 0.5, countInBars: 1 });
    expect(two.slice(0, 2).map((p) => [p.at, p.from])).toEqual([[-1, 0.5], [0, 0]]);
  });

  test("the page's playback transpose moves the guitar with the rest of the band", () => {
    expect(transposeKey("G", -2)).toBe("F");
    expect(transposeKey("C", 1)).toBe("Db");
    expect(transposeKey("E", 7)).toBe("B");
    expect(transposeKey("F", -12)).toBe("F");
    const up = guitarPart(harmony, { key: "C", meter: "4/4", style: "passenger", splitAt: 0.5, countInBars: 1, transpose: 2 });
    expect(up.map((p) => p.chord).slice(0, 5)).toEqual(["D", "D", "G", "A", "D"]);
    expect(up.at(-1)).toMatchObject({ chord: "D", ending: true });
    // A transpose of 0 changes nothing.
    expect(guitarPart(harmony, { key: "C", meter: "4/4", style: "passenger", splitAt: 0.5, transpose: 0 })).toEqual(
      guitarPart(harmony, { key: "C", meter: "4/4", style: "passenger", splitAt: 0.5 }),
    );
  });

  test("it warps from the nearest rendered tempo", () => {
    expect(nearestGuitarTempo("straight", 68)).toBe(75);
    expect(nearestGuitarTempo("straight", 98)).toBe(90); // by ratio: 100 is nearer 110
    expect(nearestGuitarTempo("straight", 105)).toBe(110);
    expect(nearestGuitarTempo("straight", 128)).toBe(130);
    expect(nearestGuitarTempo("triplet", 74)).toBe(80);
  });

  test("no tempo warps a clip more than about 11%, double time included", () => {
    for (const meter of ["4/4", "3/4", "2/4", "6/8", "9/8", "12/8"]) {
      // Dotted-quarter beats past 125 are outside anything a choir reads.
      for (let bpm = 40; bpm <= (meter.endsWith("/8") ? 125 : 140); bpm++) {
        const played = guitarDouble(meter, bpm) ? 2 * bpm : bpm;
        const feel = meter.endsWith("/8") ? "triplet" : meter === "3/4" ? "waltz" : "straight";
        const ratio = played / nearestGuitarTempo(feel, played);
        expect(Math.abs(Math.log(ratio))).toBeLessThan(Math.log(1.12));
      }
    }
  });

  test("slow, the guitar plays in double time: two rendered bars to a bar of music", () => {
    expect(guitarDouble("4/4", 60)).toBe(true);
    expect(guitarDouble("4/4", 72)).toBe(false);
    expect(guitarDouble("6/8", 55)).toBe(true);
    const part = guitarPart(harmony, { key: "C", meter: "4/4", style: "passenger", splitAt: 0.5, countInBars: 1, double: true });
    // The count-in bar: two rendered bars of the home chord.
    expect(part.slice(0, 2)).toEqual([
      { at: -1, chord: "C", slot: "passengerA", from: 0, to: 1 },
      { at: -0.5, chord: "C", slot: "passengerA", from: 0, to: 1 },
    ]);
    expect(part.filter((p) => p.at >= 0 && p.at < 1).map((p) => [p.at, p.chord, p.from, p.to])).toEqual([[0, "C", 0, 1], [0.5, "C", 0, 1]]);
    // A split bar: each chord its own rendered bar.
    expect(part.filter((p) => p.at >= 5 && p.at < 6).map((p) => [p.at, p.chord])).toEqual([[5, "F"], [5.5, "D"]]);
    expect(part.at(-1)).toMatchObject({ at: 7, chord: "C", ending: true });
    // 2/4 in double time: one whole rendered bar a bar.
    const two = guitarPart([["1"], ["5"], ["1"]], { key: "C", meter: "2/4", style: "passenger", splitAt: 0.5, double: true });
    expect(two.slice(0, 2).map((p) => [p.at, p.from, p.to])).toEqual([[0, 0, 1], [1, 0, 1]]);
    expect(nearestGuitarTempo("triplet", 40)).toBe(65);
  });
});

describe("the rendered files", () => {
  const names = new Set<string>(PROGRESSIONS.filter((p) => p.mode === "major").flatMap((p) => p.bars.flat()));
  for (const n of ["5/5", "5/6", "5/2", "1-7", "u_b7", "m4", "u_borrowed_i"]) names.add(n);
  const feelOf = (slot: string) => (slot.startsWith("waltz") ? "waltz" : slot.startsWith("irish") ? "triplet" : "straight");

  test("every chord any progression uses, in all twelve keys (any transpose), is in every pattern file", () => {
    for (const slot of Object.keys(GUITAR_SLOTS) as GuitarSlot[]) {
      for (const bpm of GUITAR_TEMPOS[feelOf(slot)]) {
        const f = (manifest.patterns as Record<string, { file: string; chords: string[] }>)[`${slot}@${bpm}`];
        expect(f).toBeDefined();
        expect(existsSync(`public${f.file}`)).toBe(true);
        for (const key of GUITAR_RENDER_KEYS) for (const n of names) expect(f.chords).toContain(guitarChord(key, n)!.id);
      }
    }
  });

  test("every key's home chord has an ending in each style", () => {
    for (const slot of ["passengerA", "campfireA", "waltzA", "irishA"]) {
      for (const bpm of GUITAR_TEMPOS[feelOf(slot)]) {
        const f = (manifest.endings as Record<string, { file: string; chords: string[] }>)[`${slot}@${bpm}`];
        expect(existsSync(`public${f.file}`)).toBe(true);
        for (const key of GUITAR_RENDER_KEYS) expect(f.chords).toContain(guitarChord(key, "1")!.id);
      }
    }
  });

  test("the chords chromatic progressions add in major are all known to the guitar", () => {
    // The Neapolitan is minor's (its le is the key's own there); the page has no minor keys.
    for (const c of EXTRA_CHORDS.filter((c) => c.name !== "u_N")) expect(guitarChord("C", c.name)).not.toBeNull();
  });
});
