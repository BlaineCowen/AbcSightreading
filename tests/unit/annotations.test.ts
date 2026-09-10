import { describe, expect, test } from "bun:test";
import { withoutAnnotations, hasAnnotations } from "../../src/lib/annotations";

/**
 * Hiding the teaching aids must leave the music untouched - and must not touch
 * the header, which carries `%%percmap`, `%%annotationfont` and the `V:`/`K:`
 * lines the staff is built from.
 */

const RHYTHM = [
  "X:1 ",
  "M:4/4",
  "L:1/32",
  "%%percmap B claves normal",
  "%%MIDI beat 127 127 127 1",
  "%%annotationfont Helvetica 10",
  "V:U",
  "K:C clef=perc stafflines=1 ",
  "%            End of header, start of tune body: ",
  '"_ta"B8 "_tu-u"B16 "_ti"B4"_ti"B4 |',
].join("\n");

const PITCHED = [
  "X:1 ",
  "M:4/4",
  "L:1/32",
  "%%score ",
  "V:U",
  "K: C clef=treble ",
  "%            End of header, start of tune body: ",
  "c16 f16 |G8 G4G4 c16 |",
  "w: do fa so so so do ",
].join("\n");

const CHORAL = [
  "X:1",
  "M:4/4",
  "L:1/32",
  "%%MIDI program 0",
  "%%score S B",
  'V:S clef=treble name="Soprano" snm="S"',
  'V:B clef=bass name="Bass" snm="B"',
  "K:C",
  "% End of header, start of tune body:",
  '[V:S] "^I"g\'8 "^V⁷"f\'8 |]',
  "w: do ti",
  "[V:B] C8 D8 |]",
  "w: do re",
].join("\n");

describe("hiding annotations", () => {
  test("rhythm syllables go, the notes stay", () => {
    const out = withoutAnnotations(RHYTHM);
    expect(out).not.toContain('"_ta"');
    expect(out).toContain("B8");
    expect(out).toContain("B4B4"); // the beam survives
  });

  test("solfège lyric lines go entirely, not just their contents", () => {
    // An emptied `w:` would still claim to be lyrics for the voice above it.
    const out = withoutAnnotations(PITCHED);
    expect(out).not.toContain("w:");
    expect(out).toContain("c16 f16");
  });

  test("chord symbols go and the voices survive", () => {
    const out = withoutAnnotations(CHORAL);
    expect(out).not.toContain('"^');
    expect(out).not.toContain("w:");
    expect(out).toContain("[V:S]");
    expect(out).toContain("g'8");
  });

  test("the header is never touched", () => {
    // percmap, annotationfont and the V:/K: lines build the staff itself - and
    // the choral V: headers contain quotes, which a careless strip would eat.
    for (const abc of [RHYTHM, PITCHED, CHORAL]) {
      const header = abc.split(/^%.*start of tune body:/m)[0];
      expect(withoutAnnotations(abc).startsWith(header)).toBe(true);
    }
    expect(withoutAnnotations(CHORAL)).toContain('name="Soprano"');
    expect(withoutAnnotations(RHYTHM)).toContain("%%percmap B claves normal");
  });

  test("running it twice changes nothing further", () => {
    const once = withoutAnnotations(CHORAL);
    expect(withoutAnnotations(once)).toBe(once);
  });

  test("a string with nothing to remove is returned unchanged", () => {
    const plain = withoutAnnotations(CHORAL);
    expect(hasAnnotations(plain)).toBe(false);
    expect(hasAnnotations(CHORAL)).toBe(true);
  });

  test("a string with no body marker is left alone rather than mangled", () => {
    const odd = 'X:1\nK:C\n"^I"c8 |';
    expect(withoutAnnotations(odd)).toBe(odd);
  });
});
