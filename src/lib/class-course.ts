/**
 * A class's course: the one sequence of learning it works through
 * (abcStepByStep, an instrument course, or one the teacher builds from their
 * own presets), and its checklist - the course's steps in order, unless the
 * teacher has customized it for that class (hidden, reordered, or presets
 * added: `Class.courseSteps`, a list of preset keys). UIL and NYSSMA levels
 * are not courses - they are levels by grade, presets - but any level can be
 * added to a class's checklist like one of the teacher's own presets.
 *
 * Every item is a preset key (class-validate.ts), the same key a pass is
 * stored under, so customizing never touches what a class has passed.
 * Pure: tests/unit/class-course.test.ts.
 */
import { ladder, stepHref, stepTitle } from "./ladder";
import { uilPresets } from "./uil-presets";
import { nyssmaById, nyssmaVoiceLevels } from "./nyssma-presets";
import { tmeaById, tmeaVoiceLevels } from "./tmea-presets";
import { STEP_BY_STEP } from "./curriculum/catalogue";
import { stepOfKey, trackById, trackHref, trackStepLabel } from "./curriculum/tracks";
import { presetHref, type PresetPage } from "./preset-link";
import { presetKeyOf } from "./class-validate";

/** A course built only from the teacher's own presets, for one class. */
export const OWN_COURSE = "own";

export type CourseItem = {
  /** The preset key: what a pass is stored under. */
  key: string;
  label: string;
  /** What it brings in, when the course says. */
  detail?: string;
  /** Where Practice opens it. */
  href: string;
};

/** A saved preset as the checklist needs it. */
export type OwnPreset = { id: string; name: string; page: PresetPage };

export const isCourse = (id: unknown): id is string =>
  typeof id === "string" && (id === OWN_COURSE || id === STEP_BY_STEP || Object.hasOwn(trackById, id));

export function courseName(id: string | null | undefined): string {
  if (!id) return "No course";
  if (id === OWN_COURSE) return "My own course";
  if (id === STEP_BY_STEP) return "abcStepByStep";
  return trackById[id]?.name ?? "Unknown course";
}

export const uilHref = (levelKey: string) => `/choral-sightreading?uil=${encodeURIComponent(levelKey)}`;
export const nyssmaHref = (id: string) => `/sightreading?nyssma=${encodeURIComponent(id)}`;
export const tmeaHref = (id: string) => `/sightreading?tmea=${encodeURIComponent(id)}`;

/** The course's own steps, in its order. */
export function courseItems(courseId: string | null | undefined): CourseItem[] {
  if (courseId === STEP_BY_STEP)
    return ladder.map((s) => ({ key: presetKeyOf.step(s.id), label: `${s.number}. ${stepTitle(s)}`, detail: s.newThing, href: stepHref(s) }));
  const track = courseId ? trackById[courseId] : undefined;
  if (track)
    return track.steps.flatMap((step) =>
      (["rhythm", "notes"] as const)
        .filter((part) => part === "rhythm" || step.notes)
        .map((part) => ({ key: presetKeyOf.track(step.id, part), label: trackStepLabel(track, step, part), href: trackHref(step.id, part) })),
    );
  return [];
}

/** Any one preset key as a checklist item: a course's step, or one of the teacher's presets. */
export function itemForKey(key: string, own: OwnPreset[]): CourseItem | null {
  const colon = key.indexOf(":");
  const kind = key.slice(0, colon);
  const rest = key.slice(colon + 1);
  if (kind === "saved") {
    const p = own.find((o) => o.id === rest);
    return p ? { key, label: p.name, detail: p.page === "choral" ? "My preset · Choral" : "My preset · Unison", href: presetHref(p.page, p.id) } : null;
  }
  if (kind === "step") {
    const s = ladder.find((x) => x.id === rest);
    return s ? { key, label: `${s.number}. ${stepTitle(s)}`, detail: s.newThing, href: stepHref(s) } : null;
  }
  if (kind === "uil") return uilPresets[rest] ? { key, label: uilPresets[rest].label, href: uilHref(rest) } : null;
  if (kind === "nyssma") return nyssmaById[rest] ? { key, label: nyssmaById[rest].label, href: nyssmaHref(rest) } : null;
  if (kind === "tmea") return tmeaById[rest] ? { key, label: tmeaById[rest].label, href: tmeaHref(rest) } : null;
  if (kind === "track") {
    const found = stepOfKey(key);
    return found ? { key, label: trackStepLabel(found.track, found.step, found.part), href: trackHref(found.step.id, found.part) } : null;
  }
  return null;
}

/**
 * A class's checklist: its own list where it has one (anything that no longer
 * resolves, a deleted preset say, quietly left out), else the course's.
 */
export function classItems(cls: { course: string | null; courseSteps: string[] | null }, own: OwnPreset[]): CourseItem[] {
  if (cls.courseSteps) return cls.courseSteps.map((k) => itemForKey(k, own)).filter((i): i is CourseItem => !!i);
  return courseItems(cls.course);
}

/** The course's steps the class's list leaves out, for putting back. */
export function hiddenItems(cls: { course: string | null; courseSteps: string[] | null }): CourseItem[] {
  if (!cls.courseSteps) return [];
  const shown = new Set(cls.courseSteps);
  return courseItems(cls.course).filter((i) => !shown.has(i.key));
}

/** Levels a teacher may add to a checklist alongside their own presets: UIL and NYSSMA. */
export const LEVEL_ITEMS: CourseItem[] = [
  ...Object.entries(uilPresets).map(([k, p]) => ({ key: presetKeyOf.uil(k), label: p.label, href: uilHref(k) })),
  ...nyssmaVoiceLevels.map((l) => ({ key: presetKeyOf.nyssma(l.id), label: l.label, href: nyssmaHref(l.id) })),
  ...tmeaVoiceLevels.map((l) => ({ key: presetKeyOf.tmea(l.id), label: l.label, href: tmeaHref(l.id) })),
];

/** The first item not yet passed: what Practice opens next. */
export const nextItem = (items: CourseItem[], passed: Record<string, number>) => items.find((i) => !passed[i.key]) ?? null;

/** Edits to a class's list, each returning the new list of keys. */
export const listOps = {
  start: (cls: { course: string | null; courseSteps: string[] | null }) => cls.courseSteps ?? courseItems(cls.course).map((i) => i.key),
  hide: (keys: string[], key: string) => keys.filter((k) => k !== key),
  move: (keys: string[], key: string, by: -1 | 1) => {
    const i = keys.indexOf(key);
    const j = i + by;
    if (i < 0 || j < 0 || j >= keys.length) return keys;
    const out = [...keys];
    [out[i], out[j]] = [out[j], out[i]];
    return out;
  },
  /** Put an item in after `after` (at the end when null), never twice. */
  add: (keys: string[], key: string, after: string | null) => {
    if (keys.includes(key)) return keys;
    const at = after === null ? keys.length : keys.indexOf(after) + 1;
    return [...keys.slice(0, at), key, ...keys.slice(at)];
  },
};
