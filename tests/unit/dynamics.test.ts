import { describe, expect, test } from "bun:test";
import abcjs from "abcjs";
import {
  drawDynamics, dynamicsSetFrom, phraseStarts, readPlacedDynamics, toggleDynamic,
} from "../../src/lib/dynamics";
import { assembleUnisonAbc, createNewSr, withDynamics } from "../../src/lib/generateUnison";
import { timeSignatureFor } from "../../src/lib/meter";
import { selectableCompoundRhythms, selectableRhythms } from "../../src/lib/selectable-rhythms";

const q = (rest = false) => ({ noteLength: 8, rhythm: { rest } });
const quiet = () => {};

function exercise(rhythms: string[], dynamics?: string[], extra: Record<string, unknown> = {}) {
  const saved = { log: console.log, warn: console.warn, error: console.error };
  Object.assign(console, { log: quiet, warn: quiet, error: quiet });
  try {
    return createNewSr({
      bpm: 72, tempo: 72, clef: "treble", selectedClef: "treble",
      timeSig: timeSignatureFor("4/4"), selectedTimeSignature: "4/4",
      measures: 8, maxSkip: 2, range: { min: 14, max: 21 },
      rhythms: selectableRhythms.filter((r) => rhythms.includes(r.name)), selectedRhythms: rhythms,
      scaleDegrees: [1, 2, 3, 4, 5], selectedSharpDegrees: [], selectedFlatDegrees: [], key: "C",
      showSolfege: true, lyricSystem: "movable", rhythmOnly: false, showRhythmSyllables: true,
      syllableSystemId: "kodaly", moveOnEighthNotes: false, accidentalsFollowStep: true,
      ...(dynamics ? { dynamics } : {}),
      ...extra,
      partsObject: { numofParts: 1, parts: { Unison: { order: 0, smallName: "U" } } },
    } as any) as any;
  } finally {
    Object.assign(console, saved);
  }
}

describe("where dynamics go", () => {
  test("the first sung note of each 4-bar phrase", () => {
    expect(phraseStarts(Array.from({ length: 32 }, () => q()), 32)).toEqual([0, 16]);
    // A phrase that opens with a rest marks its first sung note.
    expect(phraseStarts([q(true), ...Array.from({ length: 15 }, () => q()), q(true), q()], 32)).toEqual([1, 17]);
    expect(phraseStarts(Array.from({ length: 24 }, () => q()), 24, 4)).toEqual([0, 12]);
  });

  test("a set of one prints once; a repeat of the last mark is not printed again", () => {
    expect(drawDynamics([0, 16, 32], ["mf"])).toEqual([{ at: 0, mark: "mf" }]);
    const rolls = [0.1, 0.1, 0.9];
    expect(drawDynamics([0, 16, 32], ["p", "f"], () => rolls.shift()!)).toEqual([
      { at: 0, mark: "p" }, { at: 32, mark: "f" },
    ]);
    expect(drawDynamics([0, 16], [])).toEqual([]);
  });
});

describe("the set", () => {
  test("Off is empty; a set is kept soft to loud; nonsense is dropped", () => {
    expect(dynamicsSetFrom(undefined)).toEqual([]);
    expect(dynamicsSetFrom("mf,p,x")).toEqual(["p", "mf"]);
    expect(dynamicsSetFrom(["f", "mp"])).toEqual(["mp", "f"]);
  });
  test("a toggle adds in order and can empty the set (Off)", () => {
    expect(toggleDynamic(["mf"], "p")).toEqual(["p", "mf"]);
    expect(toggleDynamic(["mf"], "mf")).toEqual([]);
  });
  test("a link's dynamics are checked", () => {
    expect(readPlacedDynamics([[0, "mf"], [16, "p"]], 32)).toEqual([{ at: 0, mark: "mf" }, { at: 16, mark: "p" }]);
    expect(readPlacedDynamics([[40, "mf"]], 32)).toBeNull();
    expect(readPlacedDynamics([[0, "ff"]], 32)).toBeNull();
    expect(readPlacedDynamics([[16, "p"], [0, "mf"]], 32)).toBeNull();
  });
});

describe("dynamics in the exercise", () => {
  test("off by default: no decoration, no dynamics on the score", () => {
    const [abc, , score] = exercise(["quarter", "half"]);
    expect(abc).not.toMatch(/![a-z]+!/);
    expect(score.dynamics).toBeUndefined();
  });

  test("Off draws no random numbers", () => {
    const real = Math.random;
    let calls = 0;
    const [, , score] = exercise(["quarter"]);
    Math.random = () => { calls++; return real(); };
    try { withDynamics(score, []); } finally { Math.random = real; }
    expect(calls).toBe(0);
  });

  test("mf prints once, on the first sung note, as an ABC decoration", () => {
    const [abc, , score] = exercise(["quarter", "half", "quarterRest"], ["mf"]);
    const notes = score.partsObject.parts.Unison.chordNoteObject;
    const first = notes.findIndex((n: any) => !n.rhythm?.rest);
    expect(score.dynamics).toEqual([{ at: first, mark: "mf" }]);
    expect(abc.match(/!mf!/g)).toHaveLength(1);
    expect(abc).toMatch(/!mf![_^=]*[A-Ga-g]/); // right before a note, not a rest
  });

  test("the lyric line keeps one slot per note with dynamics on", () => {
    const [plain, , score] = exercise(["quarter", "half", "eighthEighth"]);
    const display = {
      showSolfege: true, lyricSystem: "movable" as const,
      showRhythmSyllables: true, syllableSystemId: "kodaly",
    };
    const marked = assembleUnisonAbc(
      { ...score, dynamics: [{ at: 0, mark: "p" }, { at: 12, mark: "f" }] }, display);
    const lyric = (s: string) => s.match(/^w: .*$/m)?.[0];
    expect(lyric(marked)).toBeDefined();
    expect(lyric(marked)).toBe(lyric(plain));
    expect(marked.replace(/!(p|f)!/g, "")).toBe(assembleUnisonAbc(score, display));
  });

  test("compound meter takes them too", () => {
    const core = selectableCompoundRhythms.filter((r) => r.pickerGroup === "Core");
    const [abc] = exercise([], ["mf"], {
      timeSig: timeSignatureFor("6/8"), selectedTimeSignature: "6/8",
      rhythms: core, selectedRhythms: core.map((r) => r.name),
    });
    expect(abc.match(/!mf!/g)).toHaveLength(1);
  });

  test("the rhythm staff never carries dynamics", () => {
    const [, , score] = exercise(["quarter"]);
    expect(withDynamics({ ...score, staff: "rhythm" }, ["mf"]).dynamics).toBeUndefined();
  });

  test("playback follows them: abcjs plays p softer than f", () => {
    const [, , score] = exercise(["quarter"]);
    const volumes = (s: any) => {
      const [tune] = (abcjs as any).parseOnly(assembleUnisonAbc(s, { showSolfege: false }));
      return tune.setUpAudio({ qpm: 72 }).tracks.flat().filter((e: any) => e.cmd === "note").map((e: any) => e.volume);
    };
    const plain = volumes(score);
    expect(plain[0]).toBe(105); // abcjs's level with no marking
    const shaped = volumes({ ...score, dynamics: [{ at: 0, mark: "p" }, { at: 16, mark: "f" }] });
    expect(shaped).toHaveLength(32);
    expect(shaped[0]).toBe(60);
    expect(shaped[16]).toBe(105);
    expect(Math.max(...shaped.slice(0, 16))).toBeLessThan(Math.min(...shaped.slice(16)));
  });
});
