import { describe, expect, test } from "bun:test";
import { chords } from "../../src/resources/chords";

/**
 * The chord graph as data.
 *
 * Nothing here renders or generates - these are properties of the table itself,
 * and every one of them failed silently before it was checked. `vii°` in minor
 * was defined, offered in the picker, and listed by no chord as a successor, so
 * ticking it changed nothing and no error said so. Minor carried one inversion
 * against major's eight, which is why a minor bass ran out of legal notes and
 * fell through to the deadlock escape - the escape then improvised the inversion
 * with none of the approach or resolution rules attached, and that is where the
 * unapproached bass accidentals came from.
 */

const byName = new Map(chords.map((c) => [c.name, c]));
const minor = chords.filter((c) => c.mode === "minor");

describe("chord graph", () => {
  test("every successor names a chord that exists", () => {
    for (const c of chords) {
      for (const n of c.nextChordPossibilities ?? []) {
        expect(byName.has(n.name)).toBe(true);
      }
    }
  });

  test("every chord is reachable from some other chord", () => {
    // An unreachable chord is a chord that silently never appears.
    const reached = new Set<string>();
    for (const c of chords) {
      for (const n of c.nextChordPossibilities ?? []) reached.add(n.name);
    }
    for (const c of chords) expect(reached.has(c.name)).toBe(true);
  });

  test("no chord is a dead end", () => {
    for (const c of chords) {
      expect((c.nextChordPossibilities ?? []).length).toBeGreaterThan(0);
    }
  });

  test("every weight is positive", () => {
    for (const c of chords) {
      for (const n of c.nextChordPossibilities ?? []) {
        expect(n.weight).toBeGreaterThan(0);
      }
    }
  });

  test("no chord lists the same successor twice", () => {
    // A duplicate is not an error to the walker - it just doubles the weight
    // invisibly, which is not what whoever wrote the second entry meant.
    for (const c of chords) {
      const names = (c.nextChordPossibilities ?? []).map((n) => n.name);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  test("a chord's bass note is one of its own notes", () => {
    // `root` is the degree that belongs in the bass, not the root of the triad -
    // that is what makes an inversion entry an inversion. Either way it has to
    // be a note the chord actually contains.
    for (const c of chords) {
      expect(c.triadNotes).toContain(c.root);
    }
  });

  test("minor has the inversions its bass needs", () => {
    // The count is the point: with one inversion the bass search runs out of
    // legal notes and the deadlock escape improvises the rest.
    const inversions = minor.filter((c) => c.root !== c.triadNotes[0]);
    expect(inversions.length).toBeGreaterThanOrEqual(7);
    for (const name of ["m_iid6", "m_iv6", "m_V6", "m_V64", "m_VI6", "m_viid6"]) {
      expect(byName.has(name)).toBe(true);
    }
  });

  test("V⁶ in minor is a chromatic-bass chord, not an accident", () => {
    // root === sharpScaleDegree is the marker findValidBassNote reads to mean
    // "the altered note belongs in the bass here" - it then demands a stepwise
    // approach and arms the resolution. Break this equality and V⁶ becomes an
    // ordinary chord whose bass accidental nothing governs.
    const v6 = byName.get("m_V6")!;
    expect(v6.root).toBe(v6.sharpScaleDegree!);
    expect(v6.triadNotes).toEqual([4, 6, 1]);
  });

  test("the minor six-fours resolve where a six-four has to", () => {
    // A six-four is not a free chord: it is a decoration of what follows.
    expect(byName.get("m_i64")!.nextChordPossibilities.map((n) => n.name)).toEqual(["m_V"]);
    for (const n of byName.get("m_iv64")!.nextChordPossibilities) {
      expect(n.name).toMatch(/^m_i6?$/); // pedal six-four over the tonic
    }
  });

  test("V⁶ resolves to the tonic, because its bass is the leading tone", () => {
    for (const n of byName.get("m_V6")!.nextChordPossibilities) {
      expect(n.name).toBe("m_i");
    }
  });

  test("minor V⁶ is used, but not more than major's", () => {
    // Guards the tuning from both sides. Weighted too low it never relieves
    // root-position V, whose third is barred from the bass as the raised
    // leading tone; weighted too high it flatters the accidental metric by
    // adding well-behaved accidentals while the badly-approached ones stay put.
    const share = (from: string, to: string) => {
      const c = byName.get(from)!;
      const total = c.nextChordPossibilities.reduce((a, b) => a + b.weight, 0);
      const e = c.nextChordPossibilities.find((n) => n.name === to)!;
      return e.weight / total;
    };
    const minorShare = share("m_i", "m_V6");
    expect(minorShare).toBeGreaterThan(share("1", "5-6"));
    expect(minorShare).toBeLessThan(0.12);
  });
});
