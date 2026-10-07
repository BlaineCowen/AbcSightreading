import { describe, expect, test } from "bun:test";
import { OWN_COURSE, LEVEL_ITEMS, classItems, courseItems, hiddenItems, isCourse, itemForKey, listOps, nextItem } from "../../src/lib/class-course";
import { STEP_BY_STEP, UIL_CHOIR } from "../../src/lib/curriculum/catalogue";
import { checkCourseSteps, parsePresetKey } from "../../src/lib/class-validate";
import { ladder } from "../../src/lib/ladder";

describe("courses", () => {
  test("abcStepByStep, instrument courses and one's own are courses; UIL and NYSSMA are levels, not courses", () => {
    expect(isCourse(STEP_BY_STEP)).toBe(true);
    expect(isCourse("band-trumpet")).toBe(true);
    expect(isCourse(OWN_COURSE)).toBe(true);
    expect(isCourse(UIL_CHOIR)).toBe(false);
    expect(isCourse("nyssma-voice")).toBe(false);
    expect(isCourse("constructor")).toBe(false);
  });

  test("abcStepByStep lists every ladder step in order, each a valid key with a link", () => {
    const items = courseItems(STEP_BY_STEP);
    expect(items.map((i) => i.key)).toEqual(ladder.map((s) => `step:${s.id}`));
    for (const i of items) {
      expect(parsePresetKey(i.key)).not.toBeNull();
      expect(i.href.startsWith("/")).toBe(true);
    }
  });

  test("an instrument course lists its steps' halves; notes only where a step has them", () => {
    const items = courseItems("band-trumpet");
    expect(items[0].key).toBe("track:band-trumpet-01:rhythm");
    expect(items.every((i) => parsePresetKey(i.key))).toBe(true);
  });

  test("UIL and NYSSMA levels can be added to a checklist", () => {
    expect(LEVEL_ITEMS.some((i) => i.key === "uil:UIL 3" && i.href === "/choral-sightreading?uil=UIL%203")).toBe(true);
    expect(LEVEL_ITEMS.some((i) => i.key.startsWith("nyssma:") && i.href.startsWith("/sightreading?nyssma="))).toBe(true);
    expect(LEVEL_ITEMS.every((i) => parsePresetKey(i.key))).toBe(true);
  });
});

describe("a class's own list", () => {
  const own = [{ id: "p1", name: "Region warm-up", page: "unison" as const }];
  const cls = { course: STEP_BY_STEP, courseSteps: null };

  test("without one, the course as written", () => {
    expect(classItems(cls, own).length).toBe(ladder.length);
    expect(hiddenItems(cls)).toEqual([]);
  });

  test("hide, move and add, then read back; a deleted preset drops out quietly", () => {
    let keys = listOps.start(cls);
    const [a, b] = keys;
    keys = listOps.hide(keys, a);
    keys = listOps.add(keys, "saved:p1", b);
    keys = listOps.add(keys, "uil:UIL 3", null);
    keys = listOps.move(keys, "uil:UIL 3", -1);
    const mine = { course: STEP_BY_STEP, courseSteps: keys };
    const items = classItems(mine, own);
    expect(items[0].key).toBe(b);
    expect(items[1]).toMatchObject({ key: "saved:p1", label: "Region warm-up", href: "/sightreading?preset=p1" });
    expect(items.at(-2)!.key).toBe("uil:UIL 3");
    expect(hiddenItems(mine).map((i) => i.key)).toEqual([a]);
    expect(classItems(mine, []).some((i) => i.key === "saved:p1")).toBe(false);
    expect(checkCourseSteps(keys).ok).toBe(true);
  });

  test("adding twice does nothing; moving past the ends does nothing", () => {
    const keys = ["uil:UIL 1", "uil:UIL 2"];
    expect(listOps.add(keys, "uil:UIL 1", null)).toEqual(keys);
    expect(listOps.move(keys, "uil:UIL 1", -1)).toEqual(keys);
    expect(listOps.move(keys, "uil:UIL 2", 1)).toEqual(keys);
  });

  test("next is the first step not passed", () => {
    const items = courseItems(STEP_BY_STEP);
    expect(nextItem(items, {})?.key).toBe(items[0].key);
    expect(nextItem(items, { [items[0].key]: 1 })?.key).toBe(items[1].key);
    expect(nextItem(items, Object.fromEntries(items.map((i) => [i.key, 1])))).toBeNull();
  });

  test("checkCourseSteps refuses repeats and unknown steps", () => {
    expect(checkCourseSteps(["uil:UIL 1", "uil:UIL 1"]).ok).toBe(false);
    expect(checkCourseSteps(["nope"]).ok).toBe(false);
    expect(checkCourseSteps(null)).toEqual({ ok: true, value: null });
  });

  test("itemForKey names NYSSMA levels", () => {
    expect(itemForKey("nyssma:nyssma-voice-3", [])?.label).toBe("NYSSMA Voice Level III");
  });
});
