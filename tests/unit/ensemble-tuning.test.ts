import { describe, expect, it } from "bun:test";
import {
  a4Offset, assignParts, combineReadings, curveTracks, heldPitch, leanWords, partNames, planWindows, summarise, tuningOf,
  type MeasuredNote,
} from "../../src/lib/ensemble-tuning/tuning";
import { harmonicPitch } from "../../src/lib/ensemble-tuning/harmonic-pitch";
import { mixNotes } from "../../src/lib/ensemble-tuning/player";

const note = (start: number, end: number, midi: number, a440Cents = 0, sure = true): MeasuredNote => ({
  start, end, midi, velocity: 0.5, a440Cents, measured: true, sure,
});

describe("tuningOf", () => {
  it("judges against equal temperament at the tuner's A", () => {
    expect(tuningOf({ midi: 69, a440Cents: 0 }, 440).cents).toBeCloseTo(0);
    // A note in tune at A440 is flat of A442.
    expect(tuningOf({ midi: 69, a440Cents: 0 }, 442).cents).toBeCloseTo(-a4Offset(442));
    expect(a4Offset(442)).toBeCloseTo(7.85, 1);
  });

  it("reads a note more than half a semitone off as its neighbour", () => {
    expect(tuningOf({ midi: 62, a440Cents: -60 })).toEqual({ midi: 61, cents: 40 });
    expect(tuningOf({ midi: 62, a440Cents: 140 })).toEqual({ midi: 63, cents: 40 });
  });
});

describe("combineReadings", () => {
  it("averages two readings that agree, and is sure", () => {
    expect(combineReadings(10, 14)).toEqual({ cents: 12, sure: true });
  });
  it("keeps the harmonics' reading, unsure, where they disagree", () => {
    expect(combineReadings(-90, 20)).toEqual({ cents: 20, sure: false });
  });
  it("takes one reading alone as sure, and none as nothing", () => {
    expect(combineReadings(null, 5)).toEqual({ cents: 5, sure: true });
    expect(combineReadings(-8, null)).toEqual({ cents: -8, sure: true });
    expect(combineReadings(null, null)).toBeNull();
  });
});

describe("heldPitch", () => {
  it("hears the pitch held, not a scoop into it", () => {
    const dt = 0.01;
    // 0.15 s scooping up from 80 cents flat, then 0.8 s held at 12 sharp.
    const curve = [...Array.from({ length: 15 }, (_, i) => -80 + (92 * i) / 15), ...new Array(80).fill(12)];
    const center = curve.reduce((a, b) => a + b, 0) / curve.length;
    const held = heldPitch({ center, drift: curve.map((c) => c - center), dt });
    expect(held).toBeCloseTo(12, 0);
    expect(center).toBeLessThan(5); // the mean is pulled down by the scoop
  });
});

describe("curveTracks", () => {
  it("rejects a curve that jumps", () => {
    expect(curveTracks([0, 2, 4, 3], [0, 0, 0, 0])).toBe(true);
    expect(curveTracks([0, 2, 90, 3], [0, 0, 0, 0])).toBe(false);
  });
});

describe("planWindows", () => {
  it("puts every note in exactly one window that holds its whole span", () => {
    const notes = Array.from({ length: 30 }, (_, i) => ({ start: i * 0.5, end: i * 0.5 + 0.8 }));
    const windows = planWindows(notes);
    const seen = windows.flatMap((w) => w.members).sort((a, b) => a - b);
    expect(seen).toEqual(notes.map((_, i) => i));
    for (const w of windows) for (const j of w.members) {
      expect(w.a).toBeLessThanOrEqual(Math.max(0, notes[j].start - 1));
      expect(w.b).toBeGreaterThanOrEqual(notes[j].end + 1.4 - 1e-9);
    }
  });
});

describe("assignParts", () => {
  const satb = [
    [72, 67, 64, 48], [72, 69, 65, 53], [71, 67, 62, 55], [72, 67, 64, 48],
  ];
  it("gives each note of a chorale its part", () => {
    const notes = satb.flatMap((c, k) => c.map((m) => ({ start: k, end: k + 0.95, midi: m })));
    const parts = assignParts(notes, 4);
    expect(parts).toEqual(satb.flatMap(() => [0, 1, 2, 3]));
  });

  it("keeps parts through staggered entries and a part resting", () => {
    // Singers come in up to 0.12 s apart; in chord 3 the bass rests and the tenor sits where the bass was.
    const notes = [
      ...satb.flatMap((c, k) =>
        c.map((m, p) => ({ start: k + p * 0.04, end: k + 0.95, midi: m, p }))
      ).filter((n) => !(n.start >= 2 && n.start < 3 && n.p === 3)),
    ];
    const parts = assignParts(notes, 4);
    notes.forEach((n, j) => expect(parts[j]).toBe(n.p));
  });

  it("names the parts", () => {
    expect(partNames(4, "voices")).toEqual(["Soprano", "Alto", "Tenor", "Bass"]);
    expect(partNames(4, "instruments")).toEqual(["Part 1", "Part 2", "Part 3", "Part 4"]);
    expect(partNames(3, "voices")).toEqual(["Top", "Middle", "Bottom"]);
  });
});

describe("summarise", () => {
  it("weighs notes by length and leaves unsure notes out", () => {
    const notes = [note(0, 1, 60, -20), note(1, 4, 60, 0), note(4, 5, 60, 80, false), note(0, 2, 48, 30)];
    const { parts, all } = summarise(notes, [0, 0, 0, 1], ["Top", "Bottom"]);
    expect(parts[0].meanCents).toBeCloseTo(-5);
    expect(parts[0].inTune).toBeCloseTo(0.75);
    expect(parts[0].unsure).toBe(1);
    expect(parts[1].offNotes).toBe(1);
    expect(all.notes).toBe(3);
  });

  it("says which way a part leans", () => {
    expect(leanWords(-17.6)).toBe("18¢ flat");
    expect(leanWords(6)).toBe("6¢ sharp");
    expect(leanWords(1.4)).toBe("in tune");
  });
});

describe("harmonicPitch", () => {
  const SR = 44100;
  const tone = (out: Float32Array, hz: number, start: number, end: number) => {
    for (let i = Math.round(start * SR); i < Math.round(end * SR); i++)
      for (let h = 1; h <= 6; h++) out[i] += (0.1 / h) * Math.sin((2 * Math.PI * hz * h * i) / SR);
  };
  const hz = (m: number, c = 0) => 440 * 2 ** ((m - 69) / 12 + c / 1200);

  it("reads a note from the harmonics no other note covers", () => {
    const x = new Float32Array(SR * 2);
    tone(x, hz(60, 17), 0, 2); // C4, 17 cents sharp
    tone(x, hz(67), 0, 2); // G4 in tune
    const notes = [{ start: 0, end: 2, freq: hz(60) }, { start: 0, end: 2, freq: hz(67) }];
    expect(harmonicPitch(x, SR, notes, 0, hz(60))!.cents).toBeCloseTo(17, 0);
    expect(harmonicPitch(x, SR, notes, 1, hz(67))!.cents).toBeCloseTo(0, 0);
  });

  it("gives nothing for the upper note of an octave, whose harmonics are all shared", () => {
    const x = new Float32Array(SR * 2);
    tone(x, hz(48), 0, 2);
    tone(x, hz(60, 20), 0, 2);
    const notes = [{ start: 0, end: 2, freq: hz(48) }, { start: 0, end: 2, freq: hz(60) }];
    expect(harmonicPitch(x, SR, notes, 1, hz(60))).toBeNull();
  });
});

describe("mixNotes", () => {
  it("lays each note back where it was", () => {
    const out = mixNotes(10, 10, [{ from: 0.2, signal: Float32Array.of(1, 1) }, { from: 0.3, signal: Float32Array.of(2) }]);
    expect(Array.from(out)).toEqual([0, 0, 1, 3, 0, 0, 0, 0, 0, 0]);
  });
});
