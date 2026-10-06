import { describe, expect, test } from "bun:test";
import { detectBursts, detectClaps, withoutClickEcho, type ClapBlock } from "../../src/lib/clap-detect";
import { gradeClaps, togetherLabel } from "../../src/lib/grade-rhythm";
import { voicingAt } from "../../src/lib/clap-detect";
import { gradeSchedule } from "../../src/lib/grade";

// ── The microphone's blocks, synthesized ─────────────────────────────────────
const BLOCK = 128 / 48; // ms
const FLOOR = 1e-8; // -80 dB in the high band: a quiet room

/** Blocks over `ms`, each block's power the room plus every sound playing then. */
function blocks(ms: number, sounds: ((t: number) => { hi: number; full: number })[]): ClapBlock[] {
  const out: ClapBlock[] = [];
  for (let t = 0; t < ms; t += BLOCK) {
    let hi = FLOOR * (0.8 + 0.4 * ((t * 7919) % 1));
    let full = hi * 3;
    for (const s of sounds) {
      const x = s(t);
      hi += x.hi;
      full += x.full;
    }
    out.push({ t, hi, full });
  }
  return out;
}
/** A clap: a sharp broadband attack ringing out over about 30 ms. */
const clap = (at: number, amp = 0.1) => (t: number) => {
  if (t < at) return { hi: 0, full: 0 };
  const p = amp * amp * Math.exp(-(t - at) / 8);
  return { hi: p, full: p * 1.6 };
};
/** A sung vowel: loud, but almost nothing of it above 1.5 kHz. */
const vowel = (from: number, to: number) => (t: number) =>
  t < from || t > to ? { hi: 0, full: 0 } : { hi: 0.01 * 0.01, full: 0.01 };

describe("hearing claps", () => {
  test("one person's claps are found, each within a block or two", () => {
    const at = [500, 1000, 1250, 1500, 2000];
    const found = detectClaps(blocks(2600, at.map((a) => clap(a))));
    expect(found.length).toBe(at.length);
    found.forEach((c, i) => expect(Math.abs(c.t - at[i])).toBeLessThanOrEqual(3));
  });
  test("a voice as loud as a clap is not a clap", () => {
    expect(detectClaps(blocks(2000, [vowel(300, 1500)]))).toEqual([]);
  });
  test("a clap ringing on is one clap, not several", () => {
    const found = detectClaps(blocks(1200, [clap(400, 0.3), clap(420, 0.05)]));
    expect(found.length).toBe(1);
  });
  test("a bump in a clap's ring (a reflection) is not a second clap", () => {
    // Blaine's run: a clap, and 60 ms on a reflection rising 12 dB out of its ring.
    const found = detectClaps(blocks(1200, [clap(400, 0.3), clap(460, 0.3 * 10 ** (-28 / 20))]));
    expect(found.length).toBe(1);
  });
  test("a class clapping together is one clap a beat, timed at its middle, with its width", () => {
    // Twenty children, each up to 40 ms either side of the beat.
    const jitter = (k: number) => ((k * 37) % 81) - 40;
    const sounds = [1000, 2000].flatMap((beat) => Array.from({ length: 20 }, (_, k) => clap(beat + jitter(k), 0.03)));
    const found = detectBursts(blocks(2800, sounds));
    expect(found.length).toBe(2);
    for (const [i, beat] of [1000, 2000].entries()) {
      expect(Math.abs(found[i].t - beat)).toBeLessThan(15);
      expect(found[i].spread!).toBeGreaterThan(15);
      expect(found[i].spread!).toBeLessThan(90);
    }
  });
  test("the page's click heard back is learned in the count-in and left out after; a clap over it is kept", () => {
    const clicks = [0, 500, 1000, 1500, 2000, 2500];
    const echo = clicks.map((k) => ({ t: k + 10, level: 0.01 }));
    const claps = [{ t: 2008, level: 0.05 }, { t: 2250, level: 0.012 }];
    const kept = withoutClickEcho([...echo, ...claps].sort((a, b) => a.t - b.t), clicks, 1900);
    // The count-in's echoes are left for the grading to ignore (before the first note);
    // after it, the echo at 2500 goes, the loud clap at 2008 and the clap away from any click stay.
    expect(kept.filter((c) => c.t >= 1900).map((c) => c.t)).toEqual([2008, 2250]);
  });
  test("with nothing heard at the count-in's clicks, nothing is left out", () => {
    const claps = [{ t: 2010, level: 0.001 }];
    expect(withoutClickEcho(claps, [0, 500, 2000], 1900)).toEqual(claps);
  });
});

// ── Grading what was clapped ──────────────────────────────────────────────────
const abc = (body: string) => `X:1\nM:4/4\nL:1/32\nK:C clef=perc stafflines=1\n${body}\n`;
const BEAT = 1000; // bpm 60
const run = (body: string, times: number[], strictness: "easy" | "standard" | "strict" = "standard", who: "solo" | "class" = "solo", levels?: number[]) =>
  gradeClaps(gradeSchedule(abc(body)), times.map((t, i) => ({ t, level: levels?.[i] ?? 1, spread: who === "class" ? 30 : undefined })), {
    t0: 0,
    bpm: 60,
    beatUnits: 8,
    strictness,
    who,
  });

describe("grading a clapped rhythm", () => {
  test("every note clapped on time is 100, no strays", () => {
    const r = run("B8 B8 B4 B4 B8 | B32 |", [0, 1000, 2000, 2500, 3000, 4000]);
    expect(r.rhythm).toBe(100);
    expect(r.strays).toEqual([]);
    expect(r.letter).toBe("A");
  });
  test("a clap 0.3 beats late is full credit on Easy, part on Standard", () => {
    const times = [0, 1300, 2000, 3000];
    expect(run("B8 B8 B8 B8 |", times, "easy").notes[1].rhythm).toBe(100);
    const std = run("B8 B8 B8 B8 |", times, "standard").notes[1];
    expect(std.rhythm).toBeGreaterThan(0);
    expect(std.rhythm).toBeLessThan(100);
    expect(std.onsetBeats).toBeCloseTo(0.3, 5);
  });
  test("a note not clapped is missed and scores 0", () => {
    const r = run("B8 B8 B8 B8 |", [0, 1000, 3000]);
    expect(r.notes[2]).toMatchObject({ missed: true, rhythm: 0 });
    expect(r.rhythm).toBe(75);
  });
  test("two claps on one note: one counts, one is a stray, and the stray costs a note", () => {
    const r = run("B8 B8 B8 B8 |", [0, 1000, 1080, 2000, 3000]);
    expect(r.notes.every((n) => n.rhythm === 100)).toBe(true);
    expect(r.strays.length).toBe(1);
    expect(r.rhythm).toBe(80); // 400 over 4 notes + 1 stray
  });
  test("of two claps on a note both in time, the nearer one counts", () => {
    const r = run("B8 B8 B8 B8 |", [0, 1000, 1150, 2000, 3000]);
    expect(r.notes[1].onsetBeats).toBe(0);
    expect(r.strays[0].t).toBe(1150);
  });
  test("a clap in a rest is a stray, placed where it fell", () => {
    const r = run("B8 z8 B16 |", [0, 1000, 2000]);
    expect(r.strays.length).toBe(1);
    expect(r.strays[0].units).toBeCloseTo(8, 5);
  });
  test("a tied note is one clap", () => {
    const r = run("B24 B8- | B16 B16 |", [0, 3000, 6000]);
    expect(r.notes.length).toBe(3);
    expect(r.rhythm).toBe(100);
  });
  test("an early clap for the next note goes to the next note, not the one before", () => {
    // Eighths at 60: 500 ms apart. Note 2 clapped 150 ms early, note 1 on time.
    const r = run("B4 B4 B4 B4 B16 |", [0, 350, 1000, 1500, 2000], "easy");
    expect(r.strays).toEqual([]);
    expect(r.notes[1].onsetBeats).toBeCloseTo(-0.15, 5);
  });
  test("after a missed note the claps do not slide one note over, even on Easy", () => {
    // Note 2 missed; the rest clapped on time. Each clap stays on its own note.
    const r = run("B8 B8 B8 B8 |", [0, 2000, 3000], "easy");
    expect(r.notes.map((n) => n.missed)).toEqual([false, true, false, false]);
    expect(r.notes[2].onsetBeats).toBe(0);
  });
  test("a steady lag (the microphone's, unchecked) is not counted, and sixteenths stay on their own notes", () => {
    // Blaine's run: ta ti-ti-ki at 72, every clap about 150 ms behind.
    const body = "B8 B4 B2 B2 | B4 B4 B8 |";
    const beat = 60000 / 72;
    const at = [0, 1, 1.5, 1.75, 2, 2.5, 3].map((b) => b * beat + 150);
    const sched = gradeSchedule(abc(body));
    const graded = (forgiveLag: boolean, strictness: "standard" | "strict") =>
      gradeClaps(sched, at.map((t) => ({ t, level: 1 })), { t0: 0, bpm: 72, beatUnits: 8, strictness, who: "solo", forgiveLag });
    const forgiven = graded(true, "strict");
    expect(forgiven.rhythm).toBe(100);
    expect(forgiven.strays).toEqual([]);
    expect(Math.abs(forgiven.lagMs - 150)).toBeLessThan(2);
    // Checked microphone: the lag counts, but the claps still land on their own notes.
    const counted = graded(false, "strict");
    expect(counted.strays).toEqual([]);
    expect(counted.notes.every((n) => !n.missed && (n.onsetBeats ?? 0) > 0.17)).toBe(true);
  });
  test("claps in the count-in are not graded", () => {
    expect(run("B8 B8 B8 B8 |", [-4000, -3000, 0, 1000, 2000, 3000]).strays).toEqual([]);
  });
  test("a class: a quiet stray (a child or two) costs a fraction; a loud one (half the room) nearly a whole note", () => {
    const body = "B8 B8 B8 B8 |";
    const quiet = run(body, [0, 1000, 1500, 2000, 3000], "standard", "class", [1, 1, 0.3, 1, 1]);
    const loud = run(body, [0, 1000, 1500, 2000, 3000], "standard", "class", [1, 1, 0.9, 1, 1]);
    expect(quiet.strays[0].weight).toBeCloseTo(0.3, 5);
    expect(quiet.rhythm).toBe(93); // 400 / 4.3
    expect(loud.rhythm).toBe(82); // 400 / 4.9
    expect(quiet.together).toBe(30);
    expect(togetherLabel(30)).toBe("Tight");
  });
  test("a class: a note only part of the room clapped gets that part", () => {
    const r = run("B8 B8 B8 B8 |", [0, 1000, 2000, 3000], "standard", "class", [1, 1, 0.3, 1]);
    expect(r.notes[2].rhythm).toBe(75); // 0.3 / 0.4
  });
});

// ── From Blaine's class recordings (6 October): chant, a ragged room, background ──
const runWith = (body: string, claps: { t: number; level?: number; voiced?: boolean }[], who: "solo" | "class" = "solo", strictness: "easy" | "standard" = "easy") =>
  gradeClaps(gradeSchedule(abc(body)), claps.map((c) => ({ level: 1, ...c })), { t0: 0, bpm: 60, beatUnits: 8, strictness, who });

describe("a class clapping and chanting", () => {
  test("a chanted syllable is never a stray", () => {
    const r = runWith("B8 B8 B8 B8 |", [{ t: 0 }, { t: 120, voiced: true }, { t: 1000 }, { t: 1500, voiced: true }, { t: 2000 }, { t: 3000 }]);
    expect(r.strays).toEqual([]);
    expect(r.rhythm).toBe(100);
    expect(r.ignored.voiced).toBe(2);
  });
  test("a chant can fill a note whose clap it buried", () => {
    const r = runWith("B8 B8 B8 B8 |", [{ t: 0 }, { t: 1030, voiced: true }, { t: 2000 }, { t: 3000 }]);
    expect(r.notes[1].missed).toBe(false);
  });
  test("a class: a sound close behind a matched clap is the same, ragged clap", () => {
    // Children 150-280 ms behind the rest, on every note.
    const r = runWith("B8 B8 B8 B8 |", [0, 1000, 2000, 3000].flatMap((t) => [{ t }, { t: t + 150, level: 0.8 }, { t: t + 280, level: 0.6 }]), "class");
    expect(r.strays).toEqual([]);
    expect(r.ignored.merged).toBe(8);
    expect(r.rhythm).toBe(100);
  });
  test("a class: a clap half a beat off is still a stray", () => {
    const r = runWith("B8 B8 B8 B8 |", [{ t: 0 }, { t: 500 }, { t: 1000 }, { t: 2000 }, { t: 3000 }], "class");
    expect(r.strays.length).toBe(1);
  });
  test("just me: a second clap close behind still costs (a double clap)", () => {
    const r = runWith("B8 B8 B8 B8 |", [{ t: 0 }, { t: 1000 }, { t: 1150 }, { t: 2000 }, { t: 3000 }]);
    expect(r.strays.length).toBe(1);
  });
  test("a class: a faint sliver just ahead of the clap is not matched in its place", () => {
    // The room's clap at 2000 split off a faint leading edge at 1990, nearer the beat.
    const r = runWith("B8 B8 B8 B8 |", [{ t: 0 }, { t: 1000 }, { t: 1990, level: 0.01 }, { t: 2060 }, { t: 3000 }], "class");
    expect(r.notes[2].rhythm).toBe(100);
    expect(r.strays).toEqual([]);
  });
  test("just me: a quiet clap is still a clap", () => {
    const r = runWith("B8 B8 B8 B8 |", [{ t: 0 }, { t: 1000, level: 0.05 }, { t: 2000 }, { t: 3000 }]);
    expect(r.notes[1].missed).toBe(false);
  });
  test("much quieter than the claps is the room, not a stray", () => {
    const r = runWith("B8 B8 B8 B8 |", [{ t: 0 }, { t: 500, level: 0.1 }, { t: 1000 }, { t: 2000 }, { t: 3000 }]);
    expect(r.strays).toEqual([]);
    expect(r.ignored.quiet).toBe(1);
  });
  test("just me, but it sounds like a room: the result says to try The class", () => {
    const ragged = [0, 1000, 2000, 3000].flatMap((t) => [{ t }, { t: t + 160 }]);
    expect(runWith("B8 B8 B8 B8 |", ragged).soundedLikeClass).toBe(true);
    expect(runWith("B8 B8 B8 B8 |", [{ t: 0 }, { t: 1000 }, { t: 2000 }, { t: 3000 }]).soundedLikeClass).toBeUndefined();
  });
});

describe("telling a voice from a clap", () => {
  const rate = 16000;
  const sound = (f: (k: number) => number) => {
    const samples = new Float32Array(rate);
    for (let k = 0; k < samples.length; k++) samples[k] = f(k);
    return { t0: 0, rate, samples };
  };
  test("a sung vowel is pitched; a clap's noise is not", () => {
    // A voice at 220 Hz with harmonics, and white noise ringing out.
    const vowel = sound((k) => Math.sin((2 * Math.PI * 220 * k) / rate) + 0.5 * Math.sin((2 * Math.PI * 440 * k) / rate) + 0.3 * Math.sin((2 * Math.PI * 660 * k) / rate));
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
    const clap = sound((k) => rnd() * Math.exp(-k / (0.03 * rate)));
    expect(voicingAt(vowel, 100)).toBeGreaterThan(0.8);
    expect(voicingAt(clap, 0)).toBeLessThan(0.3);
  });
});
