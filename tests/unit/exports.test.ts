import { describe, expect, test } from "bun:test";
import { midiFileFor, withTempo, exportFileName, keyAndMeterOf } from "../../src/lib/exports";
import { runChoralJob, rendererFor } from "../../src/lib/choral-jobs";
import { createNewSr, assembleUnisonAbc } from "../../src/lib/generateUnison";
import { chords as fullChordSet } from "../../src/resources/chords";
import { rhythms } from "../../src/resources/rhythms";

/**
 * The MIDI file is checked by reading it back: the tempo it declares, and the
 * notes each track plays. That is what a practice app or a DAW will see.
 */

const quietly = <T>(fn: () => T): T => {
  const { log, warn, error } = console;
  Object.assign(console, { log: () => {}, warn: () => {}, error: () => {} });
  try {
    for (let i = 0; i < 30; i++) {
      try { return fn(); } catch { /* a randomised search: try again */ }
    }
    throw new Error("could not generate in 30 attempts");
  } finally {
    Object.assign(console, { log, warn, error });
  }
};

/** Just enough of a MIDI reader: the header, tempo events, and note-ons per track. */
function readMidi(bytes: Uint8Array) {
  const text = (at: number) => String.fromCharCode(...bytes.subarray(at, at + 4));
  const u32 = (at: number) => (bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3];
  expect(text(0)).toBe("MThd");
  const format = (bytes[8] << 8) | bytes[9];
  const trackCount = (bytes[10] << 8) | bytes[11];
  const tempos: number[] = [];
  const tracks: number[][] = [];
  let at = 8 + u32(4);
  while (at < bytes.length) {
    expect(text(at)).toBe("MTrk");
    const end = at + 8 + u32(at + 4);
    let i = at + 8;
    let status = 0;
    const notes: number[] = [];
    const varLen = () => {
      let value = 0;
      for (;;) {
        const b = bytes[i++];
        value = (value << 7) | (b & 0x7f);
        if (!(b & 0x80)) return value;
      }
    };
    while (i < end) {
      varLen(); // delta time
      if (bytes[i] & 0x80) status = bytes[i++];
      if (status === 0xff) {
        const type = bytes[i++];
        const length = varLen();
        if (type === 0x51) tempos.push((bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2]);
        i += length;
      } else if (status === 0xf0 || status === 0xf7) {
        i += varLen();
      } else {
        const kind = status & 0xf0;
        const data = kind === 0xc0 || kind === 0xd0 ? 1 : 2;
        if (kind === 0x90 && bytes[i + 1] > 0) notes.push(bytes[i]);
        i += data;
      }
    }
    tracks.push(notes);
    at = end;
  }
  return { format, trackCount, tempos, tracks: tracks.filter((t) => t.length > 0) };
}

const SATB = {
  numofParts: 4,
  parts: {
    Soprano: { order: 3, smallName: "S", clef: "treble octave=-1", range: [21, 35], currentRange: [25, 32] },
    Alto: { order: 2, smallName: "A", clef: "treble octave=-1", range: [14, 32], currentRange: [21, 28] },
    Tenor: { order: 1, smallName: "T", clef: "treble transpose=-12", range: [11, 27], currentRange: [14, 23] },
    Bass: { order: 0, smallName: "B", clef: "bass octave=-1", range: [2, 24], currentRange: [9, 18] },
  },
} as any;

const choral = () =>
  rendererFor(
    quietly(() =>
      runChoralJob({
        kind: "exercise",
        params: {
          key: "D",
          timeSig: { name: "4/4", tsPerMeasure: 32, beamGroupSize: 8 },
          partsObject: SATB,
          measures: 4,
          maxSkip: 4,
          bpm: 72,
          selectedRhythms: rhythms.filter((r) => ["half", "quarter"].includes(r.name)),
          chords: fullChordSet,
          accidentalsByStep: true,
          nctProbability: 0,
        } as any,
      })
    )
  );

describe("the MIDI file", () => {
  const render = choral();
  const abc = render({});

  test("is a format-1 file with one track per voice, at the tempo asked for", () => {
    const midi = readMidi(midiFileFor(abc, { bpm: 90 }));
    expect(midi.format).toBe(1);
    expect(midi.tracks.length).toBe(4);
    expect(midi.tempos).toContain(Math.round(60_000_000 / 90));
  });

  test("the tenor sounds an octave below where it is written, and transposing moves every note", () => {
    const plain = readMidi(midiFileFor(abc, { bpm: 72 }));
    const up = readMidi(midiFileFor(abc, { bpm: 72, transpose: 2 }));
    up.tracks.forEach((track, t) => expect(track).toEqual(plain.tracks[t].map((p) => p + 2)));
    // Tenor below alto on average; were it an octave high it would sit above.
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean(plain.tracks[2])).toBeLessThan(mean(plain.tracks[1]));
    expect(mean(plain.tracks[2])).toBeGreaterThan(mean(plain.tracks[3]));
  });

  test("a voice left out of the ABC is left out of the file", () => {
    const midi = readMidi(midiFileFor(render({ hiddenVoices: ["Alto"] }), { bpm: 72 }));
    expect(midi.tracks.length).toBe(3);
  });

  test("unison, which has no Q: line, still plays at the tempo asked for", () => {
    const [, , score] = quietly(() =>
      createNewSr({
        bpm: 60, clef: "treble", selectedClef: "treble",
        timeSig: { name: "4/4", tsPerMeasure: 32, beamGroupSize: 8 }, selectedTimeSignature: "4/4",
        measures: 4, maxSkip: 4, tempo: 60, range: { min: 14, max: 23 },
        selectedRhythms: ["quarter", "half"], rhythms: rhythms.filter((r) => ["quarter", "half"].includes(r.name)),
        scaleDegrees: new Set([1, 3, 5]), key: "C", chords: ["1", "2", "3", "4", "5", "6", "7"],
        partsObject: { numofParts: 1, parts: { Unison: { chordNoteObject: [], order: 0, smallName: "U", selectedRange: [14, 23] } } },
      } as any)
    ) as any;
    const unison = assembleUnisonAbc(score, {});
    expect(unison).not.toMatch(/^Q:/m);
    const midi = readMidi(midiFileFor(unison, { bpm: 66 }));
    expect(midi.tempos).toContain(Math.round(60_000_000 / 66));
    expect(midi.tracks.length).toBe(1);
  });
});

describe("withTempo", () => {
  test("replaces the tempo there is", () => {
    expect(withTempo("X:1\nL:1/32\nQ:1/4=72\nK:C\nc8|", 96)).toBe("X:1\nL:1/32\nQ:1/4=96\nK:C\nc8|");
  });
  test("adds one to the header when there is none", () => {
    expect(withTempo("X:1 \nM:4/4\nL:1/32\nK:C\nc8|", 60)).toBe("X:1 \nM:4/4\nL:1/32\nQ:1/4=60\nK:C\nc8|");
  });
});

describe("key and meter from the score", () => {
  test("choral, unison and rhythm headers", () => {
    expect(keyAndMeterOf("X:1\nM:3/4\nL:1/32\nK:Eb\n")).toEqual({ key: "Eb", meter: "3/4" });
    expect(keyAndMeterOf("X:1\nM:4/4\nK:F#m\n")).toEqual({ key: "F#m", meter: "4/4" });
    expect(keyAndMeterOf("X:1 \nM:2/4\nV:U\nK: G clef=bass \n")).toEqual({ key: "G", meter: "2/4" });
  });
});

describe("file names", () => {
  const date = new Date(2026, 8, 21);
  test("say what it is, in words a folder listing can show", () => {
    expect(exportFileName({ page: "choral", key: "Eb", meter: "3/4", date }, "musicxml")).toBe(
      "choral-E-flat-major-3-4-2026-09-21.musicxml"
    );
    expect(exportFileName({ page: "choral", key: "F#m", meter: "4/4", date }, "midi")).toBe(
      "choral-F-sharp-minor-4-4-2026-09-21.mid"
    );
    expect(exportFileName({ page: "rhythm", meter: "2/4", date }, "abc")).toBe("rhythm-2-4-2026-09-21.abc");
  });
});
