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
      for (const texture of ["staggered", "independent"] as const) {
        const out = applyVoiceTexture(input, { texture, measures: 16, tsPerMeasure: TS });
        expect(totals(out)).toEqual(before);
        // silencing replaces notes, never adds or removes them
        expect(out.map((v) => v.length)).toEqual(input.map((v) => v.length));
      }
    }
  });

  test("parts enter lowest first", () => {
    // The voice arrays are S, A, T, B but `order` runs 3, 2, 1, 0 - so anything
    // that reads array position instead of `order` staggers them upside down.
    let checked = 0;
    for (let i = 0; i < 50; i++) {
      const out = applyVoiceTexture(satb(16), {
        texture: "staggered",
        measures: 16,
        tsPerMeasure: TS,
      });
      const entersAt = out.map((v) => {
        let t = 0;
        for (const n of v) {
          if (!n.rest) return t;
          t += n.length;
        }
        return Infinity;
      });
      const byOrder = out
        .map((v, idx) => ({ order: v[0].order!, at: entersAt[idx] }))
        .sort((a, b) => a.order - b.order);
      for (let k = 1; k < byOrder.length; k++) {
        expect(byOrder[k].at).toBeGreaterThanOrEqual(byOrder[k - 1].at);
      }
      expect(byOrder[0].at).toBe(0); // the bass is there from the start
      checked++;
    }
    expect(checked).toBe(50);
  });

  test("never drops below a duet once everyone has entered", () => {
    // Three voices, not four: with four, silencing one part still leaves three
    // sounding and the floor is never approached, so the test would pass with
    // the check removed entirely.
    for (let i = 0; i < 500; i++) {
      const measures = 16;
      const trio = satb(measures).slice(0, 3);
      const out = applyVoiceTexture(trio, {
        texture: "independent",
        measures,
        tsPerMeasure: TS,
      });
      // where the last voice enters; before that a solo is intended
      const allIn = Math.max(
        ...out.map((v) => {
          let t = 0;
          for (const n of v) {
            if (!n.rest) return t;
            t += n.length;
          }
          return 0;
        })
      );
      for (let t = allIn; t < measures * TS; t += 8) {
        expect(soundingAt(out, t)).toBeGreaterThanOrEqual(2);
      }
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
        texture: "independent",
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
        texture: "independent",
        measures: 16,
        tsPerMeasure: TS,
      });
      for (const v of out) expect(v.some((n) => !n.rest)).toBe(true);
    }
  });

  test("short exercises get the entrance and nothing else", () => {
    // A part dropping out mid-piece needs room to read as scoring rather than
    // as a mistake, so on a short exercise nothing drops out after entering.
    for (let i = 0; i < 50; i++) {
      const measures = 8;
      const out = applyVoiceTexture(satb(measures), {
        texture: "independent",
        measures,
        tsPerMeasure: TS,
      });
      // after the entrance, every voice sings to the end
      for (const v of out) {
        let seenPitch = false;
        for (const n of v) {
          if (!n.rest) seenPitch = true;
          else if (seenPitch) throw new Error("a voice dropped out mid-piece");
        }
      }
    }
  });

  test("isVoiceTexture accepts only the three modes", () => {
    expect(isVoiceTexture("full")).toBe(true);
    expect(isVoiceTexture("independent")).toBe(true);
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
