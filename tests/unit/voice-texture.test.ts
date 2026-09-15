import { describe, expect, test } from "bun:test";
import {
  applyVoiceTexture,
  mergeRestsWithinMeasures,
  isVoiceTexture,
} from "../../src/lib/voice-texture";
import type { VoiceNote } from "../../src/lib/types";

/**
 * Silencing a voice must never change how long that voice lasts, or the ABC
 * assembler puts barlines in different places for different staves and the
 * score stops lining up. That failure is invisible in the data and obvious on
 * the page, which is exactly the kind worth pinning here.
 */

const TS = 32; // 4/4 in 32nd-note units

function note(pitchValue: number, length: number, order: number): VoiceNote {
  return { name: "x", degree: 1, pitchValue, length, rest: false, order } as VoiceNote;
}

/** Four index-aligned voices of `measures` measures, one quarter per beat. */
function satb(measures: number): VoiceNote[][] {
  // order 0 is the bass, matching the part definitions
  return [3, 2, 1, 0].map((order) =>
    Array.from({ length: measures * 4 }, () => note(20 + order * 3, 8, order))
  );
}

const totals = (voices: VoiceNote[][]) =>
  voices.map((v) => v.reduce((a, n) => a + n.length, 0));

function soundingAt(voices: VoiceNote[][], time: number): number {
  let count = 0;
  for (const v of voices) {
    let t = 0;
    for (const n of v) {
      if (time < t + n.length) {
        if (!n.rest) count++;
        break;
      }
      t += n.length;
    }
  }
  return count;
}

describe("voice texture", () => {
  test("full leaves the voices exactly as they were", () => {
    const input = satb(8);
    expect(applyVoiceTexture(input, { texture: "full", measures: 8, tsPerMeasure: TS }))
      .toBe(input);
  });

  test("total duration per voice never changes", () => {
    for (let i = 0; i < 200; i++) {
      const input = satb(16);
      const before = totals(input);
      const out = applyVoiceTexture(input, { texture: "staggered", measures: 16, tsPerMeasure: TS });
      expect(totals(out)).toEqual(before);
      // silencing replaces notes, never adds or removes them
      expect(out.map((v) => v.length)).toEqual(input.map((v) => v.length));
    }
  });

  /** When a voice comes back after its first gap, or 0 if it never left. */
  const reEntry = (voice: VoiceNote[]) => {
    let t = 0;
    let gapSeen = false;
    for (const n of voice) {
      if (n.rest) gapSeen = true;
      else if (gapSeen) return t;
      t += n.length;
    }
    return 0;
  };

  test("every part sings the downbeat", () => {
    // The whole reason the entrance was once removed. On a sight-reading
    // exercise the opening sonority is the one thing that must not be
    // ambiguous - it is what tells the choir where home is - and a part resting
    // through it reads as a pickup, so the singer waits for a beat that never
    // comes.
    for (let i = 0; i < 50; i++) {
      const out = applyVoiceTexture(satb(16), {
        texture: "staggered",
        measures: 16,
        tsPerMeasure: TS,
      });
      for (const voice of out) expect(voice[0].rest).toBe(false);
    }
  });

  test("the upper parts then drop away and come back one at a time", () => {
    for (let i = 0; i < 50; i++) {
      const out = applyVoiceTexture(satb(16), {
        texture: "staggered",
        measures: 16,
        tsPerMeasure: TS,
      });
      // satb() builds voices in order 3,2,1,0 - so reversed is lowest first.
      const backAt = [...out].reverse().map(reEntry);
      expect(backAt[0]).toBe(0); // the lowest part never leaves
      for (let k = 1; k < backAt.length; k++) {
        expect(backAt[k]).toBeGreaterThanOrEqual(backAt[k - 1]);
      }
      // and somebody really does drop out, or this proves nothing
      expect(Math.max(...backAt)).toBeGreaterThan(0);
    }
  });

  test("nothing is silenced in the opening bar", () => {
    for (let i = 0; i < 50; i++) {
      const out = applyVoiceTexture(satb(16), {
        texture: "staggered",
        measures: 16,
        tsPerMeasure: TS,
      });
      for (const voice of out) {
        let t = 0;
        for (const n of voice) {
          if (t < TS) expect(n.rest).toBe(false);
          t += n.length;
        }
      }
    }
  });

  test("an exercise too short to hear an entrance does not get one", () => {
    // Under eight measures the parts would all be in before the effect reads as
    // anything, and a rest in the first bar of a four-bar exercise is just a
    // part that starts late.
    for (let i = 0; i < 50; i++) {
      const out = applyVoiceTexture(satb(4), {
        texture: "staggered",
        measures: 4,
        tsPerMeasure: TS,
      });
      for (const voice of out) expect(voice[0].rest).toBe(false);
    }
  });

  test("once a part is back, it stays", () => {
    // The entrance is all this texture does. The tacet spans and mid-piece
    // drop-outs that used to follow it belonged to "independent", which is gone,
    // so a part has exactly one gap.
    for (let i = 0; i < 100; i++) {
      const out = applyVoiceTexture(satb(16), {
        texture: "staggered",
        measures: 16,
        tsPerMeasure: TS,
      });
      for (const v of out) {
        let gaps = 0;
        let inGap = false;
        for (const n of v) {
          if (n.rest && !inGap) { gaps++; inGap = true; }
          else if (!n.rest) inGap = false;
        }
        expect(gaps).toBeLessThanOrEqual(1);
      }
    }
  });

  test("never drops below a duet once everyone has entered", () => {
    // Three voices, not four: with four, silencing one part still leaves three
    // sounding and the floor is never approached, so the test would pass with
    // the check removed entirely.
    for (let i = 0; i < 500; i++) {
      const measures = 16;
      const trio = satb(measures).slice(0, 3);
      const out = applyVoiceTexture(trio, {
        texture: "staggered",
        measures,
        tsPerMeasure: TS,
      });
      // Once the last part is back, the texture is full again; the thinned
      // passage before that is allowed to fall as far as a solo.
      const allIn = Math.max(...out.map(reEntry));
      for (let t = allIn; t < measures * TS; t += 8) {
        expect(soundingAt(out, t)).toBeGreaterThanOrEqual(2);
      }
    }
  });

  test("a cadence inside the entrance window keeps every part", () => {
    // The one guard in trySilence the entrance can still reach. A cadence is an
    // arrival, so a part cannot still be waiting to come in at one - the voices
    // whose entrance would cover it start on the downbeat instead.
    for (let i = 0; i < 100; i++) {
      const input = satb(16);
      const atEndOfSecondMeasure = 7; // inside the window the entrance spans
      for (const v of input) v[atEndOfSecondMeasure].isCadenceEnd = true;
      const out = applyVoiceTexture(input, {
        texture: "staggered",
        measures: 16,
        tsPerMeasure: TS,
      });
      for (const v of out) expect(v[atEndOfSecondMeasure].rest).toBe(false);
    }
  });

  test("never silences a cadence note or the final measure", () => {
    for (let i = 0; i < 100; i++) {
      const measures = 16;
      const input = satb(measures);
      // Mark an *interior* cadence, at the end of measure 4. Marking only the
      // final note would prove nothing: the final measure is protected by its
      // own rule, so the cadence guard would never be reached.
      const interior = 4 * 4 - 1;
      for (const v of input) {
        v[interior].isCadenceEnd = true;
        v[v.length - 1].isCadenceEnd = true;
      }
      const out = applyVoiceTexture(input, {
        texture: "staggered",
        measures,
        tsPerMeasure: TS,
      });
      for (const v of out) {
        let t = 0;
        for (const n of v) {
          if (n.isCadenceEnd) expect(n.rest).toBe(false);
          if (t >= (measures - 1) * TS) expect(n.rest).toBe(false);
          t += n.length;
        }
      }
    }
  });

  test("no voice is silent for the whole exercise", () => {
    for (let i = 0; i < 100; i++) {
      const out = applyVoiceTexture(satb(16), {
        texture: "staggered",
        measures: 16,
        tsPerMeasure: TS,
      });
      for (const v of out) expect(v.some((n) => !n.rest)).toBe(true);
    }
  });

  test("isVoiceTexture accepts only the two modes", () => {
    expect(isVoiceTexture("full")).toBe(true);
    expect(isVoiceTexture("staggered")).toBe(true);
    // A saved preset or shared link from when this existed falls back to full.
    expect(isVoiceTexture("independent")).toBe(false);
    expect(isVoiceTexture("sideways")).toBe(false);
    expect(isVoiceTexture(undefined)).toBe(false);
  });
});

describe("rest merging", () => {
  const rest = (length: number): VoiceNote =>
    ({ name: "z", degree: 0, pitchValue: 0, length, rest: true } as VoiceNote);

  test("a silent measure becomes one whole rest", () => {
    const out = mergeRestsWithinMeasures([rest(8), rest(8), rest(8), rest(8)], TS);
    expect(out.map((n) => n.length)).toEqual([32]);
  });

  test("never merges across a barline", () => {
    // Two quarter rests either side of a barline stay two rests, or every
    // later barline in that voice moves.
    const out = mergeRestsWithinMeasures(
      [note(20, 8, 0), note(20, 8, 0), note(20, 8, 0), rest(8), rest(8), rest(8)],
      TS
    );
    const lengths = out.map((n) => n.length);
    expect(lengths).toEqual([8, 8, 8, 8, 16]);
    expect(lengths.reduce((a, b) => a + b, 0)).toBe(48);
  });

  test("rests are re-notated on their beats, not just added up", () => {
    // Beats 2-4 of 4/4 is a quarter then a half, never a dotted half.
    const out = mergeRestsWithinMeasures(
      [note(20, 8, 0), rest(8), rest(8), rest(8)],
      TS
    );
    expect(out.map((n) => n.length)).toEqual([8, 8, 16]);
  });

  test("beats 1-3 of 4/4 are a half then a quarter", () => {
    const out = mergeRestsWithinMeasures([rest(8), rest(8), rest(8), note(20, 8, 0)], TS);
    expect(out.map((n) => n.length)).toEqual([16, 8, 8]);
  });

  test("a full measure of 3/4 is one rest", () => {
    const out = mergeRestsWithinMeasures([rest(8), rest(8), rest(8)], 24);
    expect(out.map((n) => n.length)).toEqual([24]);
  });

  test("total duration is preserved, and merging twice changes nothing", () => {
    for (let i = 0; i < 300; i++) {
      const voice: VoiceNote[] = [];
      for (let k = 0; k < 12; k++) {
        const len = [4, 8, 16][Math.floor(Math.random() * 3)];
        voice.push(Math.random() < 0.5 ? rest(len) : note(20, len, 0));
      }
      const before = voice.reduce((a, n) => a + n.length, 0);
      const once = mergeRestsWithinMeasures(voice, TS);
      expect(once.reduce((a, n) => a + n.length, 0)).toBe(before);
      const twice = mergeRestsWithinMeasures(once, TS);
      expect(twice.map((n) => n.length)).toEqual(once.map((n) => n.length));
    }
  });

  test("a rest longer than its measure passes through and terminates", () => {
    // The run collector cannot regroup this one; if it did not emit it verbatim
    // the loop would never advance and the tab would hang.
    const out = mergeRestsWithinMeasures([note(20, 16, 0), rest(32)], TS);
    expect(out.map((n) => n.length)).toEqual([16, 32]);
  });
});

describe("a silent bar reads as one rest", () => {
  const restAt = (length: number, chordSymbol?: string): VoiceNote =>
    ({ name: "z", degree: 0, pitchValue: 0, length, rest: true, ...(chordSymbol ? { chordSymbol } : {}) } as VoiceNote);

  test("four quarter rests in a bar become one whole rest", () => {
    const out = mergeRestsWithinMeasures([restAt(8), restAt(8), restAt(8), restAt(8)], TS);
    expect(out.length).toBe(1);
    expect(out[0].length).toBe(32);
  });

  test("chord symbols do not break the rest up", () => {
    // They used to, and always - symbols are attached to the top voice whether
    // or not they are being shown, so a soprano resting through the opening of
    // a staggered entrance came out as a scatter of quarter and half rests.
    // Measured over 12 exercises: 80 quarters and 30 halves before, 36 whole
    // rests and nothing else after.
    const out = mergeRestsWithinMeasures(
      [restAt(8, "I"), restAt(8, "I"), restAt(8, "V"), restAt(8, "V")],
      TS
    );
    expect(out.length).toBe(1);
    expect(out[0].length).toBe(32);
  });

  test("the first symbol rides the merged rest, and is not repeated", () => {
    const out = mergeRestsWithinMeasures(
      [restAt(16, "I"), restAt(8, "V"), restAt(8, "V")],
      TS
    );
    expect(out[0].chordSymbol).toBe("I");
    expect(out.slice(1).every((n) => !n.chordSymbol)).toBe(true);
  });

  test("a cadence note still stops a run, symbol or not", () => {
    const cadence = { ...restAt(8), isCadenceEnd: true } as VoiceNote;
    const out = mergeRestsWithinMeasures([restAt(8), cadence, restAt(8), restAt(8)], TS);
    expect(out.length).toBeGreaterThan(1);
    expect(out.some((n) => n.isCadenceEnd)).toBe(true);
  });

  test("sounding notes are never merged into a rest", () => {
    const sung = { name: "c", degree: 0, pitchValue: 20, length: 8, rest: false } as VoiceNote;
    const out = mergeRestsWithinMeasures([restAt(8), sung, restAt(8), restAt(8)], TS);
    expect(out.filter((n) => !n.rest).length).toBe(1);
    expect(out.reduce((n, x) => n + x.length, 0)).toBe(32);
  });
});
