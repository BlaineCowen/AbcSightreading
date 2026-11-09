import { describe, expect, test } from "bun:test";
import { GONE, barOfClass, barOfElements, hideBar, chunksOf, makeChunkVanisher, makeVanisher, parseAhead, showAllBars } from "../../src/lib/vanishing-bars";

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

describe("disappearing in chunks of beats", () => {
  // One bar of 4/4 at 60: quarter, quarter, two eighths, quarter; then bar 2.
  const make = () => {
    const n = [100, 200, 300, 350, 400].map((x) => el("abcjs-note abcjs-mm0", x));
    const lyric = el("abcjs-lyric abcjs-mm0", 198);
    const beam = el("abcjs-beam-elem abcjs-mm0", 305);
    const bar = el("abcjs-bar abcjs-mm0", 480);
    const next = el("abcjs-note abcjs-mm1", 520);
    const els = [...n, lyric, beam, bar, next];
    const ms = [1000, 2000, 3000, 3500, 4000];
    const timings = [
      ...n.map((e, i) => ({ milliseconds: ms[i], type: "event", elements: [[e]] })),
      { milliseconds: 5000, type: "event", elements: [[next]] },
    ] as unknown as { milliseconds: number; type: string; elements: Element[][] }[];
    return { n, lyric, beam, bar, next, els, timings };
  };

  test("a bar is cut into chunks from its first note", () => {
    const { timings } = make();
    const c = chunksOf(timings, 2000);
    expect(timings.map((t) => c.keyOf.get(t))).toEqual(["0:0", "0:0", "0:1", "0:1", "0:1", "1:0"]);
  });

  test("a whole chunk goes when the music reaches it, and no sooner", () => {
    const { els, timings } = make();
    const v = makeChunkVanisher(() => root(els));
    v.reach(timings, timings[0], 2000); // beat 1: beats 1 and 2 go
    expect(gone(els)).toEqual([true, true, false, false, false, true, false, false, false]);
    v.reach(timings, timings[1], 2000); // beat 2: same chunk, nothing more
    expect(gone(els).filter(Boolean).length).toBe(3);
    v.reach(timings, timings[2], 2000); // beat 3: beats 3 and 4 (the eighths, their beam, the last quarter)
    expect(gone(els)).toEqual([true, true, true, true, true, true, true, false, false]);
    v.reach(timings, timings[0], 2000); // round again: only the first chunk (two notes and the lyric under beat 2)
    expect(gone(els).filter(Boolean).length).toBe(3);
    v.reset();
    expect(gone(els).some(Boolean)).toBe(false);
  });

  test("the choice reads back as a bar or 1 to 4 beats", () => {
    expect([null, "bar", "1", "4", "5", "x"].map(parseAhead)).toEqual(["bar", "bar", 1, 4, "bar", "bar"]);
  });
});
