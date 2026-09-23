import { describe, expect, test } from "bun:test";
import abcjs from "abcjs";
import { assembleAbcString } from "../../src/lib/abc-assembly";
import { generateChoralExercise } from "../../src/lib/generateChoral";
import { joinSectionAbc } from "../../src/lib/sectional-form";
import type { VoiceNote } from "../../src/lib/types";
import { chords as fullChordSet } from "../../src/resources/chords";
import { rhythms as allRhythms } from "../../src/resources/rhythms";

/**
 * Hiding a voice from the Voices menu: its staff leaves the page, and it is
 * still heard. The page draws one ABC string and plays another, so these check
 * both halves - what the assembler leaves out, and that abcjs still finds every
 * voice in the full copy playback reads from.
 */

const note = (pitchValue: number, name: string, length: number, chordSymbol?: string): VoiceNote =>
  ({ name, degree: pitchValue % 7, pitchValue, length, rest: false, order: 0, accidental: null, chordSymbol }) as VoiceNote;

const part = (name: string, smallName: string, order: number) =>
  ({ name, smallName, order, clef: "treble", range: [0, 40], possibleNotes: [], chordNotes: [] }) as any;

/**
 * One bar of 4/4 in 32nds. The soprano carries a chord symbol on every beat,
 * as build-chord-notes writes them; the alto holds a half note across beat two.
 */
const SOPRANO = [note(28, "e", 8, "I"), note(29, "f", 8, "IV"), note(30, "g", 8, "V"), note(28, "e", 8, "I")];
const ALTO = [note(25, "B", 16), note(25, "B", 8), note(23, "G", 8)];
const PARTS = [part("Soprano", "S", 1), part("Alto", "A", 0)];

function assemble(display: Parameters<typeof assembleAbcString>[6]) {
  return assembleAbcString(
    [SOPRANO, ALTO],
    PARTS,
    [],
    "C",
    { name: "4/4", tsPerMeasure: 32, beamGroupSize: 8 } as any,
    { title: "t", composer: "", tempo: 72, midiProgram: 0 },
    display
  );
}

const bodyLine = (abc: string, id: string) =>
  abc.split("\n").find((l) => l.startsWith(`[V:${id}]`)) ?? null;
const symbolsIn = (line: string | null) => [...(line ?? "").matchAll(/"\^([^"]+)"/g)].map((m) => m[1]);

describe("a hidden voice leaves the page", () => {
  test("hiding nothing writes exactly what was written before", () => {
    const plain = assemble({ chordSymbols: true, lyrics: "movable" });
    expect(assemble({ chordSymbols: true, lyrics: "movable", hiddenVoices: [] })).toBe(plain);
    // Names that are not in this voicing change nothing either.
    expect(assemble({ chordSymbols: true, lyrics: "movable", hiddenVoices: ["Tenor"] })).toBe(plain);
  });

  test("its header, %%score entry, body and lyrics all go", () => {
    const abc = assemble({ lyrics: "movable", hiddenVoices: ["Alto"] });
    expect(abc).toContain("%%score S\n");
    expect(abc).not.toMatch(/^V:A /m);
    expect(bodyLine(abc, "A")).toBeNull();
    expect(abc.match(/^w:/gm)?.length).toBe(1);
  });

  test("the voices still shown are written exactly as before", () => {
    const full = assemble({ chordSymbols: true });
    const withoutAlto = assemble({ chordSymbols: true, hiddenVoices: ["Alto"] });
    expect(bodyLine(withoutAlto, "S")).toBe(bodyLine(full, "S"));
  });

  test("hiding every voice is ignored rather than drawing an empty page", () => {
    expect(assemble({ hiddenVoices: ["Soprano", "Alto"] })).toBe(assemble({}));
  });
});

describe("chord symbols follow the top voice still shown", () => {
  test("they move to the alto when the soprano is hidden", () => {
    const alto = bodyLine(assemble({ chordSymbols: true, hiddenVoices: ["Soprano"] }), "A");
    // IV falls in the middle of the alto's half note: nowhere to sit, so left out.
    expect(symbolsIn(alto)).toEqual(["I", "V", "I"]);
    expect(alto).toStartWith('[V:A] "^I"B16');
  });

  test("and stay off it while the soprano is shown", () => {
    const abc = assemble({ chordSymbols: true });
    expect(symbolsIn(bodyLine(abc, "S"))).toEqual(["I", "IV", "V", "I"]);
    expect(symbolsIn(bodyLine(abc, "A"))).toEqual([]);
  });

  test("they only appear when chord symbols are on", () => {
    expect(symbolsIn(bodyLine(assemble({ hiddenVoices: ["Soprano"] }), "A"))).toEqual([]);
  });
});

// ── A generated exercise ─────────────────────────────────────────────────────

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
  const selectedRhythms = allRhythms.filter((r) => ["whole", "half", "quarter"].includes(r.name));
  // Randomised generator: retry rather than let an unlucky draw fail the test.
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const out = generateChoralExercise({
        key: "C",
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

describe("a generated exercise", () => {
  const out = generate();

  test("hides by the names the Voices menu shows", () => {
    expect(out.voiceNames).toEqual(["Soprano", "Alto", "Tenor", "Bass"]);
    const abc = out.render({ hiddenVoices: ["Alto", "Tenor"] });
    expect(abc).toContain("%%score [S B]\n");
    expect(bodyLine(abc, "A")).toBeNull();
    expect(bodyLine(abc, "T")).toBeNull();
  });

  test("a full-length piece joins its sections with the same voices left out", () => {
    const hidden = { hiddenVoices: ["Tenor"] };
    const joined = joinSectionAbc([{ abc: out.render(hidden) }, { abc: out.render(hidden) }] as any);
    expect(joined).toContain("%%score [S A B]\n");
    expect(bodyLine(joined!, "T")).toBeNull();
    expect(joined!.match(/^\[V:/gm)?.length).toBe(3);
  });

  // What initSynth relies on: abcjs builds the audio from the tune's
  // setUpAudio, and a tune that is parsed but never drawn still answers it with
  // every voice. If an abcjs upgrade changes either, hidden voices go silent.
  test("abcjs plays every voice from the full copy, and none from the page's", () => {
    /** Voices that make a sound. A muted voice keeps its notes at volume 0. */
    const voiceTracks = (abc: string, params: object = {}) => {
      const [tune] = abcjs.parseOnly(abc);
      return (tune as any)
        .setUpAudio(params)
        .tracks.filter((t: any[]) => t.some((e) => e.cmd === "note" && e.volume > 0)).length;
    };
    expect(voiceTracks(out.render({ hiddenVoices: ["Alto"] }))).toBe(3);
    expect(voiceTracks(out.render({}))).toBe(4);
    // Muting still counts the whole score's voices, hidden or not.
    expect(voiceTracks(out.render({}), { voicesOff: [1] })).toBe(3);
  });
});
