import { describe, expect, test } from "bun:test";
import { chordOnsets, varyVoiceRhythms } from "../../src/lib/voice-rhythm";
import type { VoiceNote } from "../../src/lib/types";

/**
 * One voice's rhythm, adjusted after the parts are written. Written before the
 * code.
 *
 * A dotted quarter and an eighth take exactly the time of two quarters, so a
 * voice can trade one for the other without touching any pitch or any other
 * voice:
 * - where a voice's dotted-quarter-eighth breaks "eighths move by step", it
 *   sings two quarters instead (the bass in Blaine's screenshot: C dotted,
 *   C eighth, leaping to F);
 * - where the level allows the dotted figure, one voice now and then sings it
 *   against quarters in the others, which choral music does all the time and
 *   ours almost never did.
 */

// noteArray indices count scale steps: C4 = 21 in this project's array is not
// needed here - only the differences matter.
const n = (pitchValue: number, length: number, extra: Partial<VoiceNote> = {}): VoiceNote =>
  ({ name: String(pitchValue), degree: 1, pitchValue, length, rest: false, ...extra }) as VoiceNote;
const lengths = (v: VoiceNote[]) => v.map((x) => x.length);
const total = (v: VoiceNote[]) => v.reduce((s, x) => s + x.length, 0);

// One 4/4 bar in 32nds: quarter = 8, eighth = 4, dotted quarter = 12.
// G chord on beat 1, C chord from beat 2 (a dotted-quarter-eighth pattern),
// F chord on beat 4 (two eighths).
const rhythmSteps = [
  { totalValue: 8, rest: false, isPatternNote: false },
  { totalValue: 12, rest: false, isPatternNote: true, isPatternStart: true },
  { totalValue: 4, rest: false, isPatternNote: true, isPatternStart: false },
  { totalValue: 4, rest: false, isPatternNote: true, isPatternStart: true },
  { totalValue: 4, rest: false, isPatternNote: true, isPatternStart: false },
];

describe("where the chords change", () => {
  test("every step that takes a chord, and none that continue a pattern", () => {
    expect([...chordOnsets(rhythmSteps as any)]).toEqual([0, 8, 24]);
  });

  test("a rest takes no chord", () => {
    expect([...chordOnsets([{ totalValue: 8, rest: true }, { totalValue: 8, rest: false }] as any)]).toEqual([8]);
  });
});

describe("repairing a dotted figure that breaks the step rule", () => {
  const bass = () => [n(4, 8), n(0, 12), n(0, 4), n(3, 4), n(3, 4)]; // G, C., C, F F
  const soprano = () => [n(11, 8), n(9, 12), n(9, 4), n(8, 4), n(8, 4)];

  test("the bass sings quarter, quarter, quarter, eighth, eighth - the other parts keep theirs", () => {
    const [b, s] = varyVoiceRhythms([bass(), soprano()], {
      onsets: chordOnsets(rhythmSteps as any), tsPerMeasure: 32, stepwiseEighths: true, dottedAllowed: false,
    });
    expect(lengths(b)).toEqual([8, 8, 8, 4, 4]);
    expect(b.map((x) => x.pitchValue)).toEqual([4, 0, 0, 3, 3]);
    expect(lengths(s)).toEqual([8, 12, 4, 4, 4]); // steps out by step: nothing to repair
  });

  test("not when the rule is off", () => {
    const [b] = varyVoiceRhythms([bass()], {
      onsets: chordOnsets(rhythmSteps as any), tsPerMeasure: 32, stepwiseEighths: false, dottedAllowed: false,
    });
    expect(lengths(b)).toEqual([8, 12, 4, 4, 4]);
  });

  test("not when the eighth is a decoration - a passing tone must stay off the beat", () => {
    const v = [n(4, 8), n(0, 12), n(1, 4, { ornament: true }), n(5, 4), n(5, 4)];
    const [b] = varyVoiceRhythms([v], {
      onsets: chordOnsets(rhythmSteps as any), tsPerMeasure: 32, stepwiseEighths: true, dottedAllowed: false,
    });
    expect(lengths(b)).toEqual([8, 12, 4, 4, 4]);
  });

  test("not across a chord change - the moved note would sound against the wrong chord", () => {
    const steps = [
      { totalValue: 8, rest: false, isPatternNote: false },
      { totalValue: 8, rest: false, isPatternNote: false },
      { totalValue: 8, rest: false, isPatternNote: false },
      { totalValue: 8, rest: false, isPatternNote: false },
    ];
    const v = [n(4, 8), n(0, 12), n(0, 4), n(4, 8)];
    const [b] = varyVoiceRhythms([v], { onsets: chordOnsets(steps as any), tsPerMeasure: 32, stepwiseEighths: true, dottedAllowed: false });
    expect(lengths(b)).toEqual([8, 12, 4, 8]);
  });
});

describe("a dotted figure in one part against quarters in the others", () => {
  // Beats 1-2 are one chord (a half-note's worth), then a new chord on beat 3.
  const steps = [
    { totalValue: 16, rest: false, isPatternNote: false },
    { totalValue: 16, rest: false, isPatternNote: false },
  ];
  const opts = { onsets: chordOnsets(steps as any), tsPerMeasure: 32, stepwiseEighths: true, dottedAllowed: true, probability: 1, random: () => 0 };

  test("two quarters on one chord become dotted quarter and eighth, when the eighth moves by step", () => {
    const alto = [n(7, 8), n(7, 8), n(8, 16)]; // repeat, then step up
    const [a] = varyVoiceRhythms([alto], opts);
    expect(lengths(a)).toEqual([12, 4, 16]);
    expect(a.map((x) => x.pitchValue)).toEqual([7, 7, 8]);
  });

  test("only one part at a time takes it", () => {
    const voices = [
      [n(7, 8), n(7, 8), n(8, 16)],
      [n(3, 8), n(3, 8), n(4, 16)],
      [n(0, 8), n(0, 8), n(1, 16)],
    ];
    const out = varyVoiceRhythms(voices, opts);
    expect(out.filter((v) => v[0].length === 12)).toHaveLength(1);
  });

  test("never where the eighth would leap", () => {
    const leapsOut = [n(7, 8), n(7, 8), n(10, 16)];
    const leapsIn = [n(7, 8), n(9, 8), n(9, 16)];
    expect(lengths(varyVoiceRhythms([leapsOut], opts)[0])).toEqual([8, 8, 16]);
    expect(lengths(varyVoiceRhythms([leapsIn], opts)[0])).toEqual([8, 8, 16]);
  });

  test("never across a chord change, off the beat, or into a cadence", () => {
    const crossing = varyVoiceRhythms([[n(7, 8), n(7, 8), n(8, 16)]], {
      ...opts, onsets: new Set([0, 8, 16]),
    });
    expect(lengths(crossing[0])).toEqual([8, 8, 16]);
    const cadence = varyVoiceRhythms([[n(7, 8), n(7, 8, { isCadenceEnd: true }), n(8, 16)]], opts);
    expect(lengths(cadence[0])).toEqual([8, 8, 16]);
  });

  test("not when the level has no dotted figure, or by chance", () => {
    const v = () => [[n(7, 8), n(7, 8), n(8, 16)]];
    expect(lengths(varyVoiceRhythms(v(), { ...opts, dottedAllowed: false })[0])).toEqual([8, 8, 16]);
    expect(lengths(varyVoiceRhythms(v(), { ...opts, random: () => 0.99, probability: 0.3 })[0])).toEqual([8, 8, 16]);
  });

  test("a voice never takes two overlapping figures", () => {
    // Three quarters on one chord: the figure fits at beat 1 or beat 2, not both.
    const v = [[n(7, 8), n(7, 8), n(7, 8), n(8, 8)]];
    const out = varyVoiceRhythms(v, { ...opts, onsets: new Set([0, 24]) });
    expect(lengths(out[0])).toEqual([12, 4, 8, 8]);
    expect(total(out[0])).toBe(32);
  });

  test("every voice keeps its length, bar by bar", () => {
    const voices = [
      [n(7, 8), n(7, 8), n(8, 16), n(8, 8), n(8, 8), n(9, 16)],
      [n(3, 8), n(3, 8), n(4, 16), n(4, 8), n(4, 8), n(5, 16)],
    ];
    const out = varyVoiceRhythms(voices, { ...opts, onsets: new Set([0, 16, 32, 48]) });
    for (const v of out) expect(total(v)).toBe(64);
  });
});
