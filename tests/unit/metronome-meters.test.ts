import { describe, expect, test } from "bun:test";
import { Metronome } from "../../src/lib/tuner/metronome";
import { METERS, meterById, subdivisionLabel } from "../../src/lib/tuner/meters";

/**
 * The metronome's time signatures: what each clicks, and where the accents
 * fall. Run against a fake AudioContext that records every click's time and
 * pitch - the downbeat is 1600 Hz, a group start 1300, a beat 1000, a
 * subdivision 700.
 */

function clicksFor(meterId: string, subdivision: number, bpm = 60, bars = 1) {
  const clicks: { t: number; hz: number }[] = [];
  const param = () => ({ setValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const ctx: any = {
    currentTime: 0,
    destination: {},
    createOscillator: () => {
      const osc: any = {
        type: "",
        frequency: { setValueAtTime: (hz: number, t: number) => clicks.push({ t, hz }) },
        connect: (g: any) => g,
        start() {}, stop() {}, disconnect() {},
      };
      return osc;
    },
    createGain: () => ({ gain: param(), connect: (d: any) => d, disconnect() {} }),
  };
  const m = meterById(meterId);
  const met = new Metronome();
  met.configure({ bpm, beatsPerBar: m.beats, subdivision, accent: true, groupStarts: m.groupStarts });
  Object.assign(met as any, { ctx, nextBeatTime: 0, beat: 0 });
  // Schedule exactly `bars` bars: the scheduler looks 0.12 s ahead.
  ctx.currentTime = (bars * m.beats * 60) / bpm - 0.13;
  (met as any).schedule();
  return clicks.sort((a, b) => a.t - b.t).map((c) => [Math.round(c.t * 1000) / 1000, c.hz]);
}

describe("metronome meters", () => {
  test("6/8 is two dotted-quarter beats, each three eighths", () => {
    expect(clicksFor("6/8", 3)).toEqual([
      [0, 1600], [0.333, 700], [0.667, 700],
      [1, 1000], [1.333, 700], [1.667, 700],
    ]);
  });

  test("7/8 accents each group of 2+2+3", () => {
    expect(clicksFor("7/8", 1, 120).map(([, hz]) => hz)).toEqual([1600, 1000, 1300, 1000, 1300, 1000, 1000]);
  });

  test("4/4 in sixteenths, with the half-bar lightly accented", () => {
    const hz = clicksFor("4/4", 4).map(([, h]) => h);
    expect(hz).toHaveLength(16);
    expect(hz.filter((h) => h === 700)).toHaveLength(12);
    expect(hz[0]).toBe(1600);
    expect(hz[8]).toBe(1300);
  });

  test("every meter offers its default subdivision, and names it", () => {
    for (const m of METERS) {
      expect(m.subdivisions).toContain(m.defaultSubdivision);
      for (const n of m.subdivisions) expect(subdivisionLabel(m, n)).not.toMatch(/per beat/);
    }
    expect(subdivisionLabel(meterById("6/8"), 3)).toBe("Eighths");
    expect(subdivisionLabel(meterById("3/4"), 3)).toBe("Triplets");
    expect(subdivisionLabel(meterById("2/2"), 2)).toBe("Quarters");
  });
});

describe("choosing a meter", () => {
  test("keeps a subdivision that fits, and swaps one that does not", async () => {
    const { tuner } = await import("../../src/lib/tuner/store");
    tuner.setMeter("3/4");
    tuner.setSubdivision(3); // triplets
    tuner.setMeter("4/4");
    expect(tuner.get().subdivision).toBe(3); // still makes sense in 4/4
    tuner.setMeter("6/8");
    expect(tuner.get()).toMatchObject({ meter: "6/8", beatsPerBar: 2, subdivision: 3 }); // 3 = eighths here
    tuner.setSubdivision(6);
    tuner.setMeter("7/8");
    expect(tuner.get()).toMatchObject({ beatsPerBar: 7, subdivision: 1 }); // no sixteenths-of-an-eighth
  });
});

describe("click sounds", () => {
  test("every sound has a voice for every level, accents louder or higher", async () => {
    const { CLICK_SOUNDS, voiceFor } = await import("../../src/lib/tuner/click-sounds");
    for (const { id } of CLICK_SOUNDS) {
      if (id === "beep") {
        expect(voiceFor(id, "downbeat")).toBeNull();
        continue;
      }
      const [down, beat, sub] = (["downbeat", "beat", "sub"] as const).map((l) => voiceFor(id, l)!);
      // The downbeat stands out by sample, pitch or loudness; subdivisions sit under the beat.
      expect(down.sample !== beat.sample || down.rate > beat.rate || down.gain > beat.gain).toBe(true);
      expect(sub.gain).toBeLessThan(beat.gain);
    }
  });
});
