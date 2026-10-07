import { expect, test } from "bun:test";
import { clickDips } from "../../scripts/check-click-dips";

/** A run of whole notes at 60 BPM, a frame every 20 ms, steady at -20 dBFS; `dip` lowers the 150 ms after each beat. */
function run(dip: number, dropPitch = false) {
  const t0 = 1000;
  const lag = 110;
  const frames = [];
  for (let t = t0; t < t0 + 16_000; t += 20) {
    const sinceBeat = (t - lag - t0) % 1000;
    const dipped = sinceBeat >= 0 && sinceBeat < 150 && t - lag - t0 >= 1000;
    frames.push({ t, midi: dipped && dropPitch ? null : 60, cents: 0, dbfs: -20 - (dipped ? dip : 0) });
  }
  return {
    tempo: 60, beatUnits: 8, t0, detectLatencyMs: lag, outputLatencyMs: 0,
    settings: { mode: "performance", click: "beat" },
    notes: [0, 1, 2, 3].map((k) => ({ startUnits: k * 32, lengthUnits: 32 })),
    frames,
  };
}

test("no dip reads level", () => {
  const r = clickDips(run(0));
  expect(r.beats).toBe(12);
  expect(Math.abs(r.dbAfter - r.dbBefore)).toBeLessThan(0.01);
  expect(r.voicedAfter).toBe(1);
});

test("a planted 9 dB dip after each beat is found", () => {
  const r = clickDips(run(9));
  expect(r.dbBefore - r.dbAfter).toBeGreaterThan(5);
});

test("pitch lost after the click shows as fewer voiced frames", () => {
  const r = clickDips(run(9, true));
  expect(r.voicedAfter).toBeLessThan(0.5);
  expect(r.voicedBefore).toBe(1);
});
