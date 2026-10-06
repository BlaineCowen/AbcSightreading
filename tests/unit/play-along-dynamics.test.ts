import { describe, expect, test } from "bun:test";
import { extractDynamics } from "../../src/lib/play-along/bar-images";

/**
 * The play-along video draws dynamics itself (scene.ts) rather than in the
 * bars' pictures, where they made every bar's frame taller and the music
 * smaller: the exercise is drawn without them, and each is kept with its bar
 * and note.
 */
const tune = (body: string) => `X:1\nM:4/4\nL:1/32\nK:C clef=treble\n${body}\nw: do re mi\n`;

describe("dynamics, taken out of the exercise", () => {
  test("each kept with its bar and its note; the rest of the ABC untouched", () => {
    const { abc, marks } = extractDynamics(tune('"_ta"!mf!G8 "_tu-u"G16 "_ta"G8 |"_ta"A8 "_ta"!p!A8 z16 |'));
    expect(marks).toEqual([
      { bar: 0, note: 0, text: "mf" },
      { bar: 1, note: 1, text: "p" },
    ]);
    expect(abc).toContain('"_ta"G8 "_tu-u"G16 "_ta"G8 |"_ta"A8 "_ta"A8 z16 |');
    expect(abc).not.toContain("!mf!");
    expect(abc).toContain("w: do re mi");
  });

  test("letters inside quoted syllables and other decorations are not notes or dynamics", () => {
    const { abc, marks } = extractDynamics(tune('"_Go"!fermata!C8 "_ga"!f!D8 E16 |'));
    expect(marks).toEqual([{ bar: 0, note: 1, text: "f" }]);
    expect(abc).toContain("!fermata!C8");
  });

  test("bars across lines, and a line opening with a barline, count once", () => {
    const { marks } = extractDynamics(tune("C8 D8 E16 |\n|F8 !pp!G8 A16 |"));
    expect(marks).toEqual([{ bar: 1, note: 1, text: "pp" }]);
  });

  test("an exercise without dynamics comes back unchanged", () => {
    const t = tune("C8 D8 E16 | F32 |");
    expect(extractDynamics(t)).toEqual({ abc: t, marks: [] });
  });
});
