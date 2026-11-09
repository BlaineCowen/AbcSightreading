import { describe, expect, test } from "bun:test";
import { GONE, barOfClass, barOfElements, hideBar, makeAheadVanisher, makeVanisher, parseAhead, showAllBars } from "../../src/lib/vanishing-bars";

/** Just enough of the DOM: elements with classes, a root that finds them. */
function el(cls: string, left = 0) {
  const set = new Set(cls.split(/\s+/).filter(Boolean));
  return {
    getBoundingClientRect: () => ({ left, right: left + 10 }),
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

describe("disappearing a few beats ahead", () => {
  test("each note goes the chosen time before it sounds, with what is drawn up to it", () => {
    const n1 = el("abcjs-note abcjs-mm0", 100);
    const lyric1 = el("abcjs-lyric abcjs-mm0", 98);
    const beam = el("abcjs-beam-elem abcjs-mm0", 105);
    const n2 = el("abcjs-note abcjs-mm0", 200);
    const lyric2 = el("abcjs-lyric abcjs-mm0", 198);
    const bar = el("abcjs-bar abcjs-mm0", 300);
    const n3 = el("abcjs-note abcjs-mm1", 320);
    const els = [n1, lyric1, beam, n2, lyric2, bar, n3];
    const timings = [
      { milliseconds: 2000, type: "event", elements: [[n1]] },
      { milliseconds: 2500, type: "event", elements: [[n2]] },
      { milliseconds: 3000, type: "event", elements: [[n3]] },
    ] as unknown as { milliseconds: number; type: string; elements: Element[][] }[];
    const v = makeAheadVanisher(() => root(els));
    v.tick(timings, 900, 1000); // a beat at 60 ahead: nothing yet
    expect(gone(els).some(Boolean)).toBe(false);
    v.tick(timings, 1000, 1000); // the first note's beat ahead
    expect(gone(els)).toEqual([true, true, true, false, false, false, false]);
    v.tick(timings, 2100, 1000);
    expect(gone(els)).toEqual([true, true, true, true, true, false, true]);
    v.tick(timings, 100, 1000); // round again
    expect(gone(els).some(Boolean)).toBe(false);
  });

  test("the choice reads back as a bar or 1 to 4 beats", () => {
    expect([null, "bar", "1", "4", "5", "x"].map(parseAhead)).toEqual(["bar", "bar", 1, 4, "bar", "bar"]);
  });
});
