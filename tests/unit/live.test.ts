import { describe, expect, test } from "bun:test";
import abcjs from "abcjs";
import { generateChoralExercise } from "../../src/lib/generateChoral";
import { joinSectionAbc } from "../../src/lib/sectional-form";
import { chords as fullChordSet } from "../../src/resources/chords";
import { rhythms as allRhythms } from "../../src/resources/rhythms";
import { isJoinCode } from "../../src/lib/join-code";
import {
  FULL_SCORE,
  LIVE_IDLE_MS,
  LIVE_MAX_MS,
  START_LEAD_MS,
  checkPublish,
  choosePart,
  clockOffset,
  deviceSummary,
  extractVoice,
  formatLiveCode,
  generateLiveCode,
  isDeviceKey,
  isLiveCode,
  isLiveOpen,
  liveCodeHint,
  liveEndsAt,
  liveEtag,
  normalizeLiveCode,
  playTiming,
  pollDelayMs,
  livePath,
  partKeys,
  rememberedPart,
  rateLimiter,
  shouldExtend,
  startPlay,
  voicesOf,
  withoutPartNames,
} from "../../src/lib/live";

/**
 * Live practice's rules (src/lib/live.ts). The part a student's device shows
 * is checked against the assembler itself: taking one voice out of the full
 * score must give exactly what the Choral page writes with the other voices
 * hidden, chord symbols lifted onto it included.
 */

describe("live codes", () => {
  test("three digits then three letters, never a class code", () => {
    for (let i = 0; i < 500; i++) {
      const code = generateLiveCode();
      expect(isLiveCode(code)).toBe(true);
      expect(isJoinCode(code)).toBe(false);
      expect(code).not.toMatch(/[01OIL]/);
    }
  });

  test("typed any way, read one way", () => {
    expect(normalizeLiveCode(" 482-ktz ")).toBe("482KTZ");
    expect(formatLiveCode("482KTZ")).toBe("482-KTZ");
    expect(isLiveCode("482KTZ")).toBe(true);
    expect(isLiveCode("KTZ482")).toBe(false);
  });

  test("the hint says what is wrong, and nothing while it may still be right", () => {
    expect(liveCodeHint("48")).toBeNull();
    expect(liveCodeHint("482-KTZ")).toBeNull();
    expect(liveCodeHint("KTZ-482")).toMatch(/class code/);
    expect(liveCodeHint("402-KTZ")).toMatch(/never use/);
    expect(liveCodeHint("48A")).toMatch(/three numbers/);
  });
});

describe("how long a session lasts", () => {
  const start = new Date("2026-10-07T08:00:00Z");

  test("idle time from now, never past the most from the start", () => {
    expect(liveEndsAt(start, start).getTime()).toBe(start.getTime() + LIVE_IDLE_MS);
    const late = new Date(start.getTime() + LIVE_MAX_MS - 1000);
    expect(liveEndsAt(start, late).getTime()).toBe(start.getTime() + LIVE_MAX_MS);
  });

  test("open until it ends or is ended", () => {
    const endsAt = new Date(start.getTime() + 1000);
    expect(isLiveOpen({ endsAt, endedAt: null }, start)).toBe(true);
    expect(isLiveOpen({ endsAt, endedAt: start }, start)).toBe(false);
    expect(isLiveOpen({ endsAt, endedAt: null }, endsAt)).toBe(false);
  });

  test("pushed back at most once a minute", () => {
    const endsAt = liveEndsAt(start, start);
    expect(shouldExtend(endsAt, start, new Date(start.getTime() + 30_000))).toBe(false);
    expect(shouldExtend(endsAt, start, new Date(start.getTime() + 61_000))).toBe(true);
    // At the cap there is nothing to push back.
    const capped = new Date(start.getTime() + LIVE_MAX_MS);
    expect(shouldExtend(capped, start, new Date(start.getTime() + LIVE_MAX_MS - 5_000))).toBe(false);
  });
});

describe("devices and polling", () => {
  const now = new Date("2026-10-07T09:00:00Z");
  const ago = (s: number) => new Date(now.getTime() - s * 1000);

  test("counts what was seen in the last 40 seconds, by part", () => {
    const summary = deviceSummary(
      [
        { seenAt: ago(5), part: "S" },
        { seenAt: ago(20), part: "S" },
        { seenAt: ago(39), part: "A" },
        { seenAt: ago(41), part: "T" },
        { seenAt: ago(2), part: null },
      ],
      now,
    );
    expect(summary.connected).toBe(4);
    expect(summary.parts).toEqual({ S: 2, A: 1, "": 1 });
  });

  test("device keys are plain random ids", () => {
    expect(isDeviceKey("a1B2c3D4e5F6g7")).toBe(true);
    expect(isDeviceKey("short")).toBe(false);
    expect(isDeviceKey("has space in it ok")).toBe(false);
    expect(isDeviceKey(42)).toBe(false);
  });

  test("polls fast while seen, slower hidden, backs off on errors", () => {
    expect(pollDelayMs({ hidden: false, failures: 0 })).toBe(1500);
    expect(pollDelayMs({ hidden: true, failures: 0 })).toBe(6000);
    expect(pollDelayMs({ hidden: false, failures: 1 })).toBe(3000);
    expect(pollDelayMs({ hidden: false, failures: 50 })).toBe(30000);
  });

  test("a rate limit per key and window", () => {
    const allow = rateLimiter(3, 1000);
    expect([allow("a", 0), allow("a", 10), allow("a", 20), allow("a", 30)]).toEqual([true, true, true, false]);
    expect(allow("b", 30)).toBe(true);
    expect(allow("a", 1000)).toBe(true);
    // Never more keys than it was given room for.
    const small = rateLimiter(1, 1000, 2);
    small("x", 0);
    small("y", 0);
    expect(small("z", 0)).toBe(true);
  });

  test("the ETag changes with the version, the start and the end", () => {
    const a = liveEtag({ version: 3, playId: null, open: true });
    expect(liveEtag({ version: 4, playId: null, open: true })).not.toBe(a);
    expect(liveEtag({ version: 3, playId: "p1", open: true })).not.toBe(a);
    expect(liveEtag({ version: 3, playId: null, open: false })).not.toBe(a);
    expect(liveEtag({ version: 3, playId: null, open: true })).toBe(a);
  });
});

describe("what the teacher publishes", () => {
  const abc = "X:1\nM:4/4\nL:1/32\nK:C\nC8 D8 E8 F8|]\n";

  test("a score and its settings, tidied", () => {
    const r = checkPublish({ abc, settings: { bpm: 999.4, title: "C major", rhythm: true } });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.settings).toEqual({ bpm: 300, title: "C major", rhythm: true });
  });

  test("nothing that is not a score", () => {
    expect(checkPublish({}).ok).toBe(false);
    expect(checkPublish({ abc: "hello" }).ok).toBe(false);
    expect(checkPublish({ abc: "X:1\nK:C\n" + "C".repeat(130_000) }).ok).toBe(false);
  });

  test("a start leaves every device time to hear of it", () => {
    const p = startPlay({ now: 1000, bpm: 72, version: 5, id: "x" });
    expect(p.at).toBe(1000 + START_LEAD_MS);
    expect(p.version).toBe(5);
  });
});

describe("the clock", () => {
  test("the offset from the quickest round trip, to half its length", () => {
    // This device is 500 ms behind the server.
    const r = clockOffset([
      { sent: 0, server: 700, received: 400 }, // slow: 400 ms there and back
      { sent: 1000, server: 1540, received: 1080 }, // quick: 80 ms
      { sent: 2000, server: 2600, received: 2300 },
    ]);
    expect(r).not.toBeNull();
    expect(r!.offset).toBe(500);
    expect(r!.error).toBe(40);
  });

  test("nothing to go on is nothing", () => {
    expect(clockOffset([])).toBeNull();
    expect(clockOffset([{ sent: 10, server: 5, received: 9 }])).toBeNull();
  });

  test("a start, on this device's clock", () => {
    const play = { id: "p", at: 10_000, bpm: 60, version: 1 };
    // Server is 500 ms ahead: the count-in begins at 9,500 here.
    const t = playTiming(play, 500, 9_000, 4);
    expect(t.untilCountIn).toBe(500);
    expect(t.countInAt).toBe(9_500);
    expect(t.musicAt).toBe(13_500);
    expect(t.beatMs).toBe(1000);
  });
});

// ── One part out of the score ────────────────────────────────────────────

const FOUR_PARTS = {
  numofParts: 4,
  parts: {
    Soprano: { order: 3, smallName: "S", clef: "treble", range: [25, 32], currentRange: [25, 32] },
    Alto: { order: 2, smallName: "A", clef: "treble", range: [21, 28], currentRange: [21, 28] },
    Tenor: { order: 1, smallName: "T", clef: "treble-8", range: [14, 23], currentRange: [14, 23] },
    Bass: { order: 0, smallName: "B", clef: "bass", range: [9, 18], currentRange: [9, 18] },
  },
} as any;

function generate() {
  const selectedRhythms = allRhythms.filter((r) => ["whole", "half", "quarter", "eighthEighth"].includes(r.name));
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const out = generateChoralExercise({
        key: "F",
        timeSig: { name: "4/4", tsPerMeasure: 32 },
        partsObject: FOUR_PARTS,
        measures: 4,
        maxSkip: 4,
        bpm: 72,
        selectedRhythms,
        chords: fullChordSet,
        accidentalsByStep: true,
        nctProbability: 0.4,
      } as any);
      if (out?.abcString) return out;
    } catch {
      /* a randomised generator: draw again */
    }
  }
  throw new Error("could not generate a choral exercise in 40 attempts");
}

describe("one part out of a choral score", () => {
  const out = generate();
  const names = ["Soprano", "Alto", "Tenor", "Bass"];
  const ids = ["S", "A", "T", "B"];
  const displays = [{}, { lyrics: "movable" }, { chordSymbols: true }, { chordSymbols: true, lyrics: "movable" }] as const;

  test("the voices, in order, with the names they print", () => {
    expect(voicesOf(out.render({}))).toEqual(ids.map((id, i) => ({ id, name: names[i] })));
  });

  for (const display of displays) {
    test(`is what the page writes with the others hidden: ${JSON.stringify(display)}`, () => {
      const full = out.render(display as any);
      ids.forEach((id, i) => {
        const others = names.filter((_, j) => j !== i);
        expect(extractVoice(full, id)).toBe(out.render({ ...(display as any), hiddenVoices: others }));
      });
    });
  }

  test("and abcjs reads it as one staff", () => {
    const one = extractVoice(out.render({ lyrics: "movable" }), "T");
    const [tune] = abcjs.parseOnly(one) as any[];
    expect(tune.lines[0].staff.length).toBe(1);
    expect(tune.getMeterFraction()).toEqual({ num: 4, den: 4 });
  });

  test("a full-length piece too", () => {
    const sections = [{ abc: out.render({ chordSymbols: true }) }, { abc: out.render({ chordSymbols: true }) }] as any;
    const joined = joinSectionAbc(sections)!;
    const alto = extractVoice(joined, "A");
    expect(voicesOf(alto)).toEqual([{ id: "A", name: "Alto" }]);
    expect(alto.match(/^\[V:/gm)?.length).toBe(1);
    // Every chord symbol on the soprano that falls on an alto attack is there.
    expect(alto).toContain('"^');
  });

  test("drawn without the part's name down the side, clef and all else kept", () => {
    const tenor = withoutPartNames(extractVoice(out.render({}), "T"));
    expect(tenor).toMatch(/^V:T clef=treble-8$/m);
    expect(tenor).not.toContain("name=");
  });

  test("an unknown voice, or a one-line score, comes back as it was", () => {
    const full = out.render({});
    expect(extractVoice(full, "Q")).toBe(full);
    const unison = "X:1 \nM:4/4\nL:1/32\n%%score \nV:S\nK: F clef=treble \nF8 G8 A8 B8 |]\n";
    expect(extractVoice(unison, "S")).toBe(unison);
    expect(voicesOf(unison)).toEqual([{ id: "S", name: "S" }]);
  });
});

describe("the part a device reads", () => {
  const voices = [{ id: "S", name: "Soprano" }, { id: "A", name: "Alto" }];
  test("the one it read before, while it is still there", () => {
    expect(choosePart("A", voices)).toBe("A");
    expect(choosePart(FULL_SCORE, voices)).toBe(FULL_SCORE);
    expect(choosePart("T", voices)).toBeNull();
    expect(choosePart(null, voices)).toBeNull();
  });
  test("a one-line score has nothing to choose", () => {
    expect(choosePart(null, [{ id: "S", name: "S" }])).toBe(FULL_SCORE);
  });
});

describe("a director's room", () => {
  test("its address is the code, the same every day", () => {
    expect(livePath("482KTZ")).toBe("/live/482KTZ");
  });

  test("a device waiting for Live to come on checks slowly", () => {
    expect(pollDelayMs({ hidden: false, failures: 0, waiting: true })).toBe(4000);
    expect(pollDelayMs({ hidden: true, failures: 0, waiting: true })).toBe(20000);
    // On air it is as quick as ever.
    expect(pollDelayMs({ hidden: false, failures: 0, waiting: false })).toBe(1500);
  });
});

describe("the part a device keeps in a room", () => {
  const SATB = [{ id: "S", name: "Soprano" }, { id: "A", name: "Alto" }, { id: "T", name: "Tenor" }, { id: "B", name: "Bass" }];
  const SA = [{ id: "S", name: "Soprano" }, { id: "A", name: "Alto" }];
  const memory = () => {
    const kept = new Map<string, string>();
    return {
      get: (k: string) => kept.get(k) ?? null,
      pick: (code: string, voices: typeof SATB, id: string) => partKeys(code, voices).forEach((k) => kept.set(k, id)),
    };
  };

  test("a bass gets the bass part again tomorrow, after an SA exercise in between", () => {
    const m = memory();
    m.pick("482KTZ", SATB, "B");
    expect(rememberedPart(m.get, "482KTZ", SATB)).toBe("B");
    // SA has no bass: asked (or the last pick, if it fits)...
    expect(rememberedPart(m.get, "482KTZ", SA)).toBeNull();
    m.pick("482KTZ", SA, "A");
    // ...and the alto they took for SA does not replace their SATB part.
    expect(rememberedPart(m.get, "482KTZ", SATB)).toBe("B");
    expect(rememberedPart(m.get, "482KTZ", SA)).toBe("A");
  });

  test("a new set of voices takes the last part picked when it has it", () => {
    const m = memory();
    m.pick("482KTZ", SATB, "S");
    const SAB = [{ id: "S", name: "Soprano" }, { id: "A", name: "Alto" }, { id: "B", name: "Bass" }];
    expect(rememberedPart(m.get, "482KTZ", SAB)).toBe("S");
  });

  test("each room keeps its own, and a one-line score needs no choice", () => {
    const m = memory();
    m.pick("482KTZ", SATB, "T");
    expect(rememberedPart(m.get, "593BCD", SATB)).toBeNull();
    expect(rememberedPart(m.get, "593BCD", [{ id: "S", name: "S" }])).toBe(FULL_SCORE);
  });
});
