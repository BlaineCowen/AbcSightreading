import { describe, expect, test } from "bun:test";
import { LEVEL_IDS, NOTE_COUNT, challengeLink, makeChallenge, seededRandom } from "../../src/lib/challenge/exercise";
import { ChallengeRun } from "../../src/lib/challenge/run";

const MAJOR_PCS = new Set([0, 2, 4, 5, 7, 9, 11]);
const seeds = Array.from({ length: 300 }, (_, i) => i * 7919 + 13);

describe("challenge exercises", () => {
  test("a seed gives the same notes every time", () => {
    for (const level of LEVEL_IDS) {
      expect(makeChallenge(level, "high", 42)).toEqual(makeChallenge(level, "high", 42));
    }
    expect(seededRandom(5)()).toBe(seededRandom(5)());
  });

  test("eight notes in C major, in each voice's range", () => {
    for (const level of LEVEL_IDS) for (const voice of ["high", "low"] as const) for (const seed of seeds) {
      const c = makeChallenge(level, voice, seed);
      expect(c.notes.length).toBe(NOTE_COUNT);
      const base = voice === "high" ? 60 : 48;
      for (const n of c.notes) {
        expect(MAJOR_PCS.has(n.midi % 12)).toBe(true);
        expect(n.midi).toBeGreaterThanOrEqual(base);
        expect(n.midi).toBeLessThanOrEqual(base + 17);
      }
      expect(c.clef).toBe(voice === "high" ? "treble" : "bass");
    }
  });

  test("Warm-up steps from do, within do to so, and ends on do", () => {
    for (const seed of seeds) {
      const m = makeChallenge("warmup", "high", seed).notes.map((n) => n.midi);
      expect(m[0]).toBe(60);
      expect(m[NOTE_COUNT - 1]).toBe(60);
      for (const x of m) expect(x).toBeLessThanOrEqual(67);
      for (let i = 1; i < m.length; i++) expect(Math.abs(m[i] - m[i - 1])).toBeLessThanOrEqual(2);
      // It goes somewhere: up to fa or so, and no more than one note sung twice in a row.
      expect(Math.max(...m)).toBeGreaterThanOrEqual(65);
      expect(m.slice(1).filter((x, i) => x === m[i]).length).toBeLessThanOrEqual(1);
    }
  });

  test("Skips has at least two skips and ends on a do", () => {
    for (const seed of seeds) {
      const m = makeChallenge("skips", "high", seed).notes.map((n) => n.midi);
      expect([60, 72]).toContain(m[NOTE_COUNT - 1]);
      const skips = m.slice(1).filter((x, i) => Math.abs(x - m[i]) >= 3).length;
      expect(skips).toBeGreaterThanOrEqual(2);
    }
  });

  test("Wild leaps every time, never back to the note two before, never ends on do", () => {
    for (const seed of seeds) {
      const m = makeChallenge("wild", "high", seed).notes.map((n) => n.midi);
      for (let i = 1; i < m.length; i++) expect(Math.abs(m[i] - m[i - 1])).toBeGreaterThanOrEqual(3);
      for (let i = 2; i < m.length; i++) expect(m[i]).not.toBe(m[i - 2]);
      expect(m[NOTE_COUNT - 1] % 12).not.toBe(0);
    }
  });

  test("the link carries level, voice and seed", () => {
    const u = new URL(challengeLink("https://www.abc-sightreading.com", { level: "wild", voice: "low", seed: 99 }));
    expect(u.pathname).toBe("/challenge");
    expect(u.searchParams.get("l")).toBe("wild");
    expect(u.searchParams.get("v")).toBe("low");
    expect(u.searchParams.get("c")).toBe("99");
  });
});

/** Sing `plan` (from ms, to ms, midi) into a run, a frame every 40 ms, until it finishes or time runs out. */
function sing(notes: number[], plan: (t: number, index: number) => number | null, limit = 20_000) {
  const run = new ChallengeRun(notes, 0);
  let v = run.tick(0, null);
  let since = 0, last = 0;
  for (let t = 40; t < limit && !v.done; t += 40) {
    if (v.index !== last) { last = v.index; since = t; }
    v = run.tick(t, plan(t - since, v.index));
  }
  return { run, v };
}

describe("challenge judging (Grade's Note by note rules)", () => {
  const notes = [60, 64, 67, 72];

  test("each note held in tune: right first time, 100 each", () => {
    const { v } = sing(notes, (t, i) => (t > 200 ? notes[i] + 0.05 : null));
    expect(v.done).toBe(true);
    expect(v.results.map((r) => r.outcome)).toEqual(["first", "first", "first", "first"]);
    expect(v.total).toBe(400);
    expect(v.firsts).toBe(4);
  });

  test("any octave counts", () => {
    const { v } = sing(notes, (t, i) => (t > 200 ? notes[i] - 12 : null));
    expect(v.results.every((r) => r.outcome === "first")).toBe(true);
  });

  test("a wrong note held first, then the right one: corrected, 75", () => {
    const { v } = sing(notes, (t, i) => (t < 200 ? null : i === 1 && t < 900 ? notes[i] + 2 : notes[i]));
    expect(v.results[1].outcome).toBe("corrected");
    expect(v.results[1].score).toBe(75);
    expect(v.results[0].outcome).toBe("first");
  });

  test("the last note's tail in the first moment does not count against the next", () => {
    // Sung from the very first frame at the previous pitch for 120 ms (under SETTLE_MS), then the note.
    const { v } = sing(notes, (t, i) => (t < 120 && i > 0 ? notes[i - 1] : t < 200 ? null : notes[i]));
    expect(v.results.every((r) => r.outcome === "first")).toBe(true);
  });

  test("a skipped note scores 0 and the run goes on", () => {
    const run = new ChallengeRun(notes, 0);
    run.tick(40, null);
    run.skip(80);
    let v = run.tick(120, null);
    expect(v.index).toBe(1);
    expect(v.results[0].outcome).toBe("skipped");
    expect(v.results[0].score).toBe(0);
  });

  test("hearing the note caps it at 50", () => {
    const run = new ChallengeRun([60], 0);
    run.help(0, 500);
    let v = run.tick(0, null);
    for (let t = 40; t < 3000 && !v.done; t += 40) v = run.tick(t, t > 600 ? 60 : null);
    expect(v.results[0].outcome).toBe("helped");
    expect(v.results[0].score).toBeLessThanOrEqual(50);
  });

  test("silence never finishes a note", () => {
    const { v } = sing(notes, () => null, 5000);
    expect(v.done).toBe(false);
    expect(v.results.length).toBe(0);
  });
});
