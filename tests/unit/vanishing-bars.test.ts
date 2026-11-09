import { describe, expect, test } from "bun:test";
import { GONE, barOfClass, barOfElements, hideBar, makeVanisher, showAllBars } from "../../src/lib/vanishing-bars";

/** Just enough of the DOM: elements with classes, a root that finds them. */
function el(cls: string) {
  const set = new Set(cls.split(/\s+/).filter(Boolean));
  return {
    getAttribute: (n: string) => (n === "class" ? [...set].join(" ") : null),
    classList: { add: (c: string) => set.add(c), remove: (c: string) => set.delete(c), contains: (c: string) => set.has(c) },
  };
}
function root(els: ReturnType<typeof el>[]) {
  return {
    querySelectorAll: (sel: string) => els.filter((e) => e.classList.contains(sel.slice(1))),
  } as unknown as ParentNode;
}
const score = () => [
  el("abcjs-staff-extra abcjs-clef abcjs-l0 abcjs-m0 abcjs-mm0"),
  el("abcjs-note abcjs-l0 abcjs-m0 abcjs-mm0 abcjs-n0"),
  el("abcjs-lyric abcjs-l0 abcjs-m0 abcjs-mm0"),
  el("abcjs-beam-elem abcjs-mm0"),
  el("abcjs-bar abcjs-mm0"),
  el("abcjs-note abcjs-mm1"),
  el("abcjs-bar-number abcjs-mm1"),
  el("abcjs-note abcjs-mm10"),
];
const gone = (els: ReturnType<typeof el>[]) => els.map((e) => e.classList.contains(GONE));

describe("disappearing bars", () => {
  test("a bar is read from abcjs's classes, never mm1 from mm10", () => {
    expect(barOfClass("abcjs-note abcjs-mm12 abcjs-v0")).toBe(12);
    expect(barOfClass("abcjs-note abcjs-m3")).toBeNull();
    expect(barOfElements([el("abcjs-notehead"), el("abcjs-note abcjs-mm4")] as unknown as Element[])).toBe(4);
  });

  test("hiding a bar takes its music, not the clef, bar line or number", () => {
    const els = score();
    hideBar(root(els), 0);
    expect(gone(els)).toEqual([false, true, true, true, false, false, false, false]);
    hideBar(root(els), 1);
    expect(gone(els)).toEqual([false, true, true, true, false, true, false, false]);
    showAllBars(root(els));
    expect(gone(els).some(Boolean)).toBe(false);
  });

  test("going round again brings every bar back first", () => {
    const els = score();
    const v = makeVanisher(() => root(els));
    v.reach(0);
    v.reach(1);
    expect(gone(els)[1] && gone(els)[5]).toBe(true);
    v.reach(0); // a loop's next pass
    expect(gone(els)[5]).toBe(false);
    expect(gone(els)[1]).toBe(true);
    v.reset();
    expect(gone(els).some(Boolean)).toBe(false);
  });
});
