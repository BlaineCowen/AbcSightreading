import { describe, expect, test } from "bun:test";
import {
  withoutAnnotations,
  withoutLyrics,
  withoutQuotedText,
  hasAnnotations,
} from "../../src/lib/annotations";

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

describe("the two kinds strip independently", () => {
  /**
   * They used to come off together behind one master switch, which meant the
   * two things a director actually wants apart - the harmony to talk about, the
   * syllables to sing from - could only be had together or not at all.
   */
  const lyricLines = (abc: string) => (abc.match(/^w:/gm) || []).length;
  const quoted = (abc: string) => {
    const body = abc.slice(abc.search(/^%.*start of tune body:/m));
    return (body.match(/"[^"]*"/g) || []).length;
  };

  test("removing lyrics leaves the chord symbols alone", () => {
    const out = withoutLyrics(CHORAL);
    expect(lyricLines(out)).toBe(0);
    expect(quoted(out)).toBe(quoted(CHORAL));
    expect(quoted(out)).toBeGreaterThan(0);
  });

  test("removing quoted text leaves the lyrics alone", () => {
    const out = withoutQuotedText(CHORAL);
    expect(quoted(out)).toBe(0);
    expect(lyricLines(out)).toBe(lyricLines(CHORAL));
    expect(lyricLines(out)).toBeGreaterThan(0);
  });

  test("either order gives the same result as removing both", () => {
    expect(withoutQuotedText(withoutLyrics(CHORAL))).toBe(
      withoutLyrics(withoutQuotedText(CHORAL))
    );
    expect(withoutQuotedText(withoutLyrics(CHORAL))).toBe(withoutAnnotations(CHORAL));
  });

  test("neither touches a note", () => {
    // The music has to be the same exercise however it is printed.
    const music = (abc: string) =>
      abc
        .slice(abc.search(/^%.*start of tune body:/m))
        .split("\n")
        .filter((l) => !l.startsWith("w:"))
        .map((l) => l.replace(/"[^"]*"/g, ""))
        .join("\n");
    const base = music(CHORAL);
    expect(music(withoutLyrics(CHORAL))).toBe(base);
    expect(music(withoutQuotedText(CHORAL))).toBe(base);
  });

  test("both are idempotent, and safe on a string that has neither", () => {
    const bare = withoutAnnotations(CHORAL);
    expect(withoutLyrics(bare)).toBe(bare);
    expect(withoutQuotedText(bare)).toBe(bare);
    expect(hasAnnotations(bare)).toBe(false);
  });

  test("the header survives both", () => {
    // %%percmap, %%annotationfont and the V:/K: lines live there.
    expect(withoutLyrics(CHORAL)).toContain('name="Soprano"');
    expect(withoutQuotedText(CHORAL)).toContain('name="Soprano"');
    expect(withoutQuotedText(RHYTHM)).toContain("%%percmap B claves normal");
  });
});
