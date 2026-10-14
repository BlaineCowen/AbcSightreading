import { describe, expect, test } from "bun:test";
import abcjs from "abcjs";
import { assembleAbcString } from "../../src/lib/abc-assembly";
import { generateChoralExercise } from "../../src/lib/generateChoral";
import { joinSectionAbc } from "../../src/lib/sectional-form";
import type { VoiceNote } from "../../src/lib/types";
import { chords as fullChordSet } from "../../src/resources/chords";
import { rhythms as allRhythms } from "../../src/resources/rhythms";

/**
 * Solfège under some parts only (Display > Annotations > Under): the basses
 * reading syllables while the rest read the notes. A part without it loses its
 * `w:` line and nothing else; the parts that keep it keep exactly the line
 * they had; and with every part on, the score is byte for byte what it was.
 */

const note = (pitchValue: number, name: string, length: number): VoiceNote =>
  ({ name, degree: pitchValue % 7, pitchValue, length, rest: false, order: 0, accidental: null }) as VoiceNote;
const part = (name: string, smallName: string, order: number) =>
  ({ name, smallName, order, clef: "treble", range: [0, 40], possibleNotes: [], chordNotes: [] }) as any;

const SOPRANO = [note(28, "e", 8), note(29, "f", 8), note(30, "g", 8), note(28, "e", 8)];
const ALTO = [note(25, "B", 16), note(25, "B", 8), note(23, "G", 8)];
const PARTS = [part("Soprano", "S", 1), part("Alto", "A", 0)];

function assemble(display: Parameters<typeof assembleAbcString>[6]) {
  return assembleAbcString(
    [SOPRANO, ALTO],
    PARTS,
    [],
    "C",
    { name: "4/4", tsPerMeasure: 32, beatUnits: 8 } as any,
    { title: "t", composer: "", tempo: 72, midiProgram: 0 },
    display,
  );
}

/** Each voice's lyric line, by the voice it sits under (null for none). */
function lyricsByVoice(abc: string): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  let voice: string | null = null;
  for (const line of abc.split("\n")) {
    const v = /^\[V:(\w+)\]/.exec(line);
    if (v) {
      voice = v[1];
      out[voice] = null;
    } else if (voice && line.startsWith("w:")) out[voice] = line;
  }
  return out;
}

describe("solfège under some parts", () => {
  test("every part on writes exactly what was written before", () => {
    const plain = assemble({ lyrics: "movable" });
    expect(assemble({ lyrics: "movable", lyricsOff: [] })).toBe(plain);
    // A name this voicing does not have changes nothing.
    expect(assemble({ lyrics: "movable", lyricsOff: ["Bass"] })).toBe(plain);
  });

  test("a part switched off loses its lyric line and only that", () => {
    const all = assemble({ lyrics: "movable" });
    const altoOnly = assemble({ lyrics: "movable", lyricsOff: ["Soprano"] });
    expect(lyricsByVoice(altoOnly)).toEqual({ S: null, A: lyricsByVoice(all).A });
    // The notes, the header and the alto's syllables are untouched: dropping the
    // soprano's w: line from the full score gives this score.
    expect(altoOnly).toBe(all.replace(lyricsByVoice(all).S! + "\n", ""));
  });

  test("with no syllable system on it prints nothing either way", () => {
    expect(assemble({ lyricsOff: ["Soprano"] })).toBe(assemble({}));
  });

  test("every syllable system honours it", () => {
    for (const lyrics of ["movable", "fixed", "names"] as const) {
      const abc = assemble({ lyrics, lyricsOff: ["Alto"] });
      expect(lyricsByVoice(abc).A).toBeNull();
      expect(lyricsByVoice(abc).S).not.toBeNull();
    }
  });
});

const FOUR_PARTS = {
  numofParts: 4,
  parts: {
    Soprano: { order: 3, smallName: "S", clef: "treble", range: [25, 32], currentRange: [25, 32] },
    Alto: { order: 2, smallName: "A", clef: "treble", range: [21, 28], currentRange: [21, 28] },
    Tenor: { order: 1, smallName: "T", clef: "treble-8", range: [14, 23], currentRange: [14, 23] },
    Bass: { order: 0, smallName: "B", clef: "bass", range: [9, 18], currentRange: [9, 18] },
  },
} as any;

function generate() {
  const selectedRhythms = allRhythms.filter((r) => ["whole", "half", "quarter", "eighthEighth"].includes(r.name));
  // Randomised generator: retry rather than let an unlucky draw fail the test.
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const out = generateChoralExercise({
        key: "G",
        timeSig: { name: "4/4", tsPerMeasure: 32 },
        partsObject: FOUR_PARTS,
        measures: 4,
        maxSkip: 4,
        bpm: 72,
        selectedRhythms,
        chords: fullChordSet,
        accidentalsByStep: true,
        nctProbability: 0.3,
      } as any);
      if (out?.abcString) return out;
    } catch {
      /* try again */
    }
  }
  throw new Error("could not generate a choral exercise in 40 attempts");
}

describe("a generated four-part exercise", () => {
  const out = generate();
  const basses = { lyrics: "movable" as const, lyricsOff: ["Soprano", "Alto", "Tenor"] };

  test("solfège under the basses alone, by the names the page shows", () => {
    expect(out.voiceNames).toEqual(["Soprano", "Alto", "Tenor", "Bass"]);
    const all = lyricsByVoice(out.render({ lyrics: "movable" }));
    expect(lyricsByVoice(out.render(basses))).toEqual({ S: null, A: null, T: null, B: all.B });
  });

  test("abcjs lays the bass syllables one to a note", () => {
    const [tune] = abcjs.parseOnly(out.render(basses));
    const staves = tune.lines.filter((l: any) => l.staff).flatMap((l: any) => l.staff);
    const notes = (voice: number) =>
      staves.filter((_: any, i: number) => i % 4 === voice).flatMap((st: any) => st.voices[0]).filter((el: any) => el.el_type === "note" && !el.rest);
    // Every bass note carries a syllable; no upper note does.
    expect(notes(3).every((n: any) => n.lyric?.length === 1)).toBe(true);
    for (const v of [0, 1, 2]) expect(notes(v).some((n: any) => n.lyric)).toBe(false);
  });

  test("a full-length piece keeps the choice in every section", () => {
    const joined = joinSectionAbc([{ abc: out.render(basses) }, { abc: out.render(basses) }] as any)!;
    const lines = lyricsByVoice(joined);
    expect([lines.S, lines.A, lines.T]).toEqual([null, null, null]);
    expect(lines.B).not.toBeNull();
  });
});
