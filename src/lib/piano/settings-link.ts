/**
 * The piano page's settings in its address: the level, then only what
 * differs from it, so a level's own link is short (`?level=piano-05`) and an
 * edited one still opens as it was left.
 */
import {
  ALL_KEYS,
  ALL_LENGTHS,
  ALL_METERS,
  ALL_PATTERNS,
  PIANO_LEVELS,
  RHYTHM_CHOICES,
  pianoLevelById,
  settingsFor,
  type ChordChoice,
  type LeftHandPattern,
  type PianoSettings,
  type TuneHand,
} from "./levels";

const CHORDS: ChordChoice[] = ["I", "V", "IV", "V7", "ii", "vi"];
const KEYS = [...ALL_KEYS.major, ...ALL_KEYS.minor];
const RHYTHMS = RHYTHM_CHOICES.map((r) => r.name);

const list = (v: string[]) => v.join(",");
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function settingsQuery(levelId: string, s: PianoSettings): string {
  const base = settingsFor(levelId);
  const p = new URLSearchParams({ level: levelId });
  if (!same(s.keys, base.keys)) p.set("keys", list(s.keys));
  if (!same(s.meters, base.meters)) p.set("meters", list(s.meters));
  if (s.measures !== base.measures) p.set("bars", String(s.measures));
  if (!same(s.rhythms, base.rhythms)) p.set("rhythms", list(s.rhythms));
  if (s.maxSkip !== base.maxSkip) p.set("skip", String(s.maxSkip));
  if (s.reach !== base.reach) p.set("reach", String(s.reach));
  if (s.together !== base.together) p.set("hands", s.together ? "together" : "turns");
  if (s.tuneHand !== base.tuneHand) p.set("tune", s.tuneHand);
  if (!same(s.patterns, base.patterns)) p.set("lh", list(s.patterns));
  if (!same(s.chords, base.chords)) p.set("chords", list(s.chords));
  if (s.chromatic !== base.chromatic) p.set("chromatic", s.chromatic ? "1" : "0");
  if (s.doubleNotes !== base.doubleNotes) p.set("double", s.doubleNotes ? "1" : "0");
  if (s.dynamics !== base.dynamics) p.set("dyn", s.dynamics ? "1" : "0");
  if (s.bpm !== base.bpm) p.set("bpm", String(s.bpm));
  return p.toString();
}

/** A level and its settings from an address; anything unknown is left at the level's. */
export function settingsFromQuery(query: string): { levelId: string; settings: PianoSettings } {
  const p = new URLSearchParams(query);
  const levelId = pianoLevelById[p.get("level") ?? ""] ? p.get("level")! : PIANO_LEVELS[2].id;
  const s = settingsFor(levelId);
  const csv = (name: string, allowed: string[]) => {
    const v = p.get(name);
    if (v === null) return null;
    const got = v.split(",").filter((x) => allowed.includes(x));
    return got.length ? got : null;
  };
  s.keys = csv("keys", KEYS) ?? s.keys;
  s.meters = csv("meters", ALL_METERS) ?? s.meters;
  s.rhythms = csv("rhythms", RHYTHMS) ?? s.rhythms;
  s.patterns = (csv("lh", ALL_PATTERNS) as LeftHandPattern[] | null) ?? s.patterns;
  s.chords = (csv("chords", CHORDS) as ChordChoice[] | null) ?? s.chords;
  const bars = Number(p.get("bars"));
  if (ALL_LENGTHS.includes(bars)) s.measures = bars;
  const skip = Number(p.get("skip"));
  if (skip >= 1 && skip <= 7) s.maxSkip = skip;
  const reach = Number(p.get("reach"));
  if (reach >= 4 && reach <= 7) s.reach = reach;
  const hands = p.get("hands");
  if (hands === "together" || hands === "turns") s.together = hands === "together";
  const tune = p.get("tune");
  if (tune === "right" || tune === "left" || tune === "either") s.tuneHand = tune as TuneHand;
  for (const [name, field] of [["chromatic", "chromatic"], ["double", "doubleNotes"], ["dyn", "dynamics"]] as const) {
    const v = p.get(name);
    if (v === "1" || v === "0") s[field] = v === "1";
  }
  const bpm = Number(p.get("bpm"));
  if (bpm >= 30 && bpm <= 200) s.bpm = bpm;
  return { levelId, settings: s };
}
