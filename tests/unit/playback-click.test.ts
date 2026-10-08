import { describe, expect, test } from "bun:test";
import { barClicks, drumPatternFor } from "../../src/lib/playback-click";
import { CLICK_SOUNDS, SAMPLE_NAMES, drumNoteFor, sampleForDrumNote, toClickSound } from "../../src/lib/tuner/click-sounds";

/**
 * The click under the exercise, set by the Tools metronome: its subdivision,
 * accent and sound. Written before the code.
 */
describe("one bar's clicks", () => {
  test("beats alone: the downbeat accented", () => {
    expect(barClicks(4, 1, true)).toEqual(["downbeat", "beat", "beat", "beat"]);
  });
  test("no accent: every beat the same", () => {
    expect(barClicks(3, 1, false)).toEqual(["beat", "beat", "beat"]);
  });
  test("eighths: a lighter click between the beats", () => {
    expect(barClicks(2, 2, true)).toEqual(["downbeat", "sub", "beat", "sub"]);
  });
  test("triplets", () => {
    expect(barClicks(2, 3, true)).toEqual(["downbeat", "sub", "sub", "beat", "sub", "sub"]);
  });
});

describe("the Choral page's drum pattern (abcjs spreads it evenly across the bar)", () => {
  const note = (name: string) => String(drumNoteFor(name as any));
  test("4/4, quartz, beats: the accent sample on one, the beat sample on the others", () => {
    const p = drumPatternFor({ beats: 4, subdivision: 1, accent: true, sound: "quartz" }).split(" ");
    expect(p[0]).toBe("dddd");
    expect(p.slice(1, 5)).toEqual([note("quartz-accent"), note("quartz-beat"), note("quartz-beat"), note("quartz-beat")]);
    const vel = p.slice(5).map(Number);
    expect(vel[0]).toBeGreaterThan(vel[1]);
  });
  test("2/4 in eighths: four hits, the offbeats the subdivision sample and quietest", () => {
    const p = drumPatternFor({ beats: 2, subdivision: 2, accent: true, sound: "block" }).split(" ");
    expect(p[0]).toBe("dddd");
    expect(p[2]).toBe(note("block-sub"));
    const vel = p.slice(5).map(Number);
    expect(vel[1]).toBeLessThan(vel[2]);
    expect(vel[3]).toBeLessThan(vel[2]);
  });
  test("every sample has a drum note of its own, which the proxy maps back", () => {
    const notes = SAMPLE_NAMES.map(drumNoteFor);
    expect(new Set(notes).size).toBe(SAMPLE_NAMES.length);
    for (const name of SAMPLE_NAMES) expect(sampleForDrumNote(drumNoteFor(name))).toBe(name);
    expect(sampleForDrumNote(33)).toBeNull(); // a General MIDI drum stays a drum
  });
  test("velocities are MIDI's, 1 to 127", () => {
    for (const { id } of CLICK_SOUNDS) {
      const vel = drumPatternFor({ beats: 4, subdivision: 4, accent: true, sound: id }).split(" ").slice(17).map(Number);
      for (const v of vel) expect(v >= 1 && v <= 127 && Number.isInteger(v)).toBe(true);
    }
  });
});

describe("sounds saved before the samples changed", () => {
  test("map to the nearest new one", () => {
    expect(toClickSound("woodblock")).toBe("quartz"); // the old default, to the new default
    expect(toClickSound("clickbell")).toBe("quartz");
    expect(toClickSound("claves")).toBe("tick");
    expect(toClickSound("beep")).toBe("sine");
    expect(toClickSound("quartz")).toBe("quartz");
    expect(toClickSound("cowbell")).toBeNull();
  });
});

import { metronomeClickFor, newMetronomeBeatState } from "../../src/lib/metronome-beats";

describe("the click's bar model under an exercise", () => {
  test("the drum pattern rests where a slot or a beat is silent, and lists only the hits", () => {
    // Off-beats in 2/4: a rest then a hit, each beat.
    const off = drumPatternFor({ beats: 2, subdivision: 2, accent: true, sound: "quartz", subMask: "01" }).split(" ");
    expect(off[0]).toBe("zdzd");
    expect(off.length).toBe(1 + 2 * 2);
    // Backbeat: 1 and 3 silent.
    const back = drumPatternFor({ beats: 4, subdivision: 1, accent: true, sound: "quartz", beatLevels: ["off", "normal", "off", "normal"] }).split(" ");
    expect(back[0]).toBe("zdzd");
    // A soft beat is quieter than a normal one.
    const soft = drumPatternFor({ beats: 2, subdivision: 1, accent: false, sound: "quartz", beatLevels: ["normal", "soft"] }).split(" ");
    expect(Number(soft[4])).toBeLessThan(Number(soft[3]));
    // Nothing to play: no drum track at all.
    expect(drumPatternFor({ beats: 2, subdivision: 1, accent: true, sound: "quartz", beatLevels: ["off", "off"] })).toBe("");
  });

  test("the beat tracker says which beat of the bar each click is", () => {
    const state = newMetronomeBeatState();
    const seen = [0, 0.5, 1, 2, 3, 4, 5].map((b) => metronomeClickFor(state, b, 3)).filter((c) => c.click).map((c) => c.beatInBar);
    expect(seen).toEqual([0, 1, 2, 0, 1, 2]);
  });
});
