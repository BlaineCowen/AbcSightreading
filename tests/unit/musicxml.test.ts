import { describe, expect, test } from "bun:test";
import abcjs from "abcjs";
import { abcToMusicXml, scoreFromAbc, type XmlNote } from "../../src/lib/musicxml";
import { runChoralJob, rendererFor } from "../../src/lib/choral-jobs";
import { createNewSr, assembleUnisonAbc } from "../../src/lib/generateUnison";
import { chords as fullChordSet } from "../../src/resources/chords";
import { rhythms } from "../../src/resources/rhythms";

/**
 * MusicXML is only worth exporting if a notation program opens it with the
 * right notes. There is no notation program here to open it in, so the pitches
 * are checked against abcjs itself - what it plays for each note is what the
 * file has to say - and the file against the XML rules with xmllint where it
 * is installed.
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

const SATB = {
  numofParts: 4,
  parts: {
    Soprano: { order: 3, smallName: "S", clef: "treble octave=-1", range: [21, 35], currentRange: [25, 32] },
    Alto: { order: 2, smallName: "A", clef: "treble octave=-1", range: [14, 32], currentRange: [21, 28] },
    Tenor: { order: 1, smallName: "T", clef: "treble transpose=-12", range: [11, 27], currentRange: [14, 23] },
    Bass: { order: 0, smallName: "B", clef: "bass octave=-1", range: [2, 24], currentRange: [9, 18] },
  },
} as any;

function choral(key: string, meter: "4/4" | "3/4" = "4/4") {
  const result = quietly(() =>
    runChoralJob({
      kind: "exercise",
      params: {
        key,
        timeSig: { name: meter, tsPerMeasure: meter === "4/4" ? 32 : 24, beamGroupSize: 8 },
        partsObject: SATB,
        measures: 8,
        maxSkip: 4,
        bpm: 72,
        selectedRhythms: rhythms.filter((r) => ["half", "quarter", "eighthEighth", "dotQuarterEighth"].includes(r.name)),
        chords: fullChordSet,
        accidentalsByStep: true,
        nctProbability: 0.4,
        chromaticFrequency: 1,
      } as any,
    })
  );
  return rendererFor(result);
}

const MIDI_STEP: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const midiOf = (n: XmlNote) => (n.pitch!.octave + 1) * 12 + MIDI_STEP[n.pitch!.step] + n.pitch!.alter;

/** What abcjs plays for each attacked note, staff by staff. */
function abcjsPitches(abc: string): number[][] {
  const [tune] = abcjs.parseOnly(abc) as any[];
  tune.setUpAudio({});
  const staffs = tune.lines[0].staff.length;
  const out: number[][] = Array.from({ length: staffs }, () => []);
  for (const line of tune.lines) {
    line.staff.forEach((staff: any, s: number) => {
      for (const el of staff.voices[0]) {
        if (el.el_type !== "note" || el.rest || !el.pitches?.length) continue;
        if (el.pitches[0].endTie) continue;
        out[s].push(el.midiPitches[0].pitch);
      }
    });
  }
  return out;
}

/** The same from the model: attacks only, not tie continuations. */
const modelPitches = (abc: string) =>
  scoreFromAbc(abc).parts.map((part) =>
    part.measures.flatMap((m) => m.notes).filter((n) => !n.rest && !n.tieStop).map(midiOf)
  );

const xmllint = Bun.which("xmllint");
function wellFormed(xml: string) {
  if (!xmllint) return;
  const run = Bun.spawnSync([xmllint, "--noout", "--nonet", "-"], { stdin: new TextEncoder().encode(xml) });
  expect(new TextDecoder().decode(run.stderr)).toBe("");
  expect(run.exitCode).toBe(0);
}

describe("pitch", () => {
  for (const [key, meter] of [["C", "4/4"], ["A", "3/4"], ["Eb", "4/4"], ["F#m", "4/4"], ["Cm", "3/4"], ["Bb", "4/4"]] as const) {
    test(`every note sounds what abcjs plays - ${key} ${meter}`, () => {
      const render = choral(key, meter);
      for (const display of [{}, { hiddenVoices: ["Alto"] }]) {
        const abc = render(display);
        expect(modelPitches(abc)).toEqual(abcjsPitches(abc));
      }
    });
  }

  test("the tenor is a treble-8 clef at sounding pitch", () => {
    const abc = `X:1\nM:4/4\nL:1/32\nV:T clef=treble transpose=-12 name="Tenor"\nK:C\n[V:T] e8 A8 c16 |]\n`;
    const part = scoreFromAbc(abc).parts[0];
    expect(part.clef).toEqual({ sign: "G", line: 2, octaveChange: -1 });
    expect(part.measures[0].notes[0].pitch).toEqual({ step: "E", alter: 0, octave: 4 });
    expect(part.measures[0].notes[1].pitch).toEqual({ step: "A", alter: 0, octave: 3 });
  });

  test("an accidental holds for the bar, on that octave only, and the key comes back after the barline", () => {
    const abc = `X:1\nM:4/4\nL:1/32\nK:D\nF8 =F8 F8 ^F8 | F8 =f8 F8 F8 |]\n`;
    const [bar1, bar2] = scoreFromAbc(abc).parts[0].measures.map((m) => m.notes);
    expect(bar1.map((n) => n.pitch!.alter)).toEqual([1, 0, 0, 1]);
    expect(bar1.map((n) => n.accidental)).toEqual([undefined, "natural", undefined, "sharp"]);
    // f is a different octave: its natural leaves F's sharp alone.
    expect(bar2.map((n) => n.pitch!.alter)).toEqual([1, 0, 1, 1]);
  });

  test("a flat key flattens, and a tie carries its alteration over the barline", () => {
    const abc = `X:1\nM:4/4\nL:1/32\nK:Bb\nB8 E8 c8 =B8- | B8 B8 z16 |]\n`;
    const notes = scoreFromAbc(abc).parts[0].measures.flatMap((m) => m.notes);
    expect(notes.slice(0, 4).map((n) => n.pitch!.alter)).toEqual([-1, -1, 0, 0]);
    expect(notes[3].tieStart).toBe(true);
    expect(notes[4]).toMatchObject({ tieStop: true, pitch: { step: "B", alter: 0 } });
    expect(notes[4].accidental).toBeUndefined();
    // The next B is not tied: the key's flat is back.
    expect(notes[5].pitch!.alter).toBe(-1);
  });
});

describe("rhythm", () => {
  test("every bar of every part adds up to the time signature", () => {
    for (const meter of ["4/4", "3/4"] as const) {
      const score = scoreFromAbc(choral("G", meter)({ chordSymbols: true, lyrics: "movable" }));
      const bar = meter === "4/4" ? 32 : 24;
      for (const part of score.parts) {
        expect(part.measures.length).toBe(8);
        for (const m of part.measures) expect(m.notes.reduce((s, n) => s + n.length, 0)).toBe(bar);
        expect(part.measures.at(-1)!.finalBar).toBe(true);
      }
    }
  });

  test("a length no single note has becomes tied notes, the words on the first", () => {
    const abc = `X:1\nM:4/4\nL:1/32\nK:C\n"^I"c20 d12 | z20 z12 |]\n`;
    const [bar1, bar2] = scoreFromAbc(abc).parts[0].measures.map((m) => m.notes);
    expect(bar1.map((n) => n.length)).toEqual([16, 4, 12]);
    expect(bar1[0]).toMatchObject({ tieStart: true, words: [{ text: "I", placement: "above" }] });
    expect(bar1[1]).toMatchObject({ tieStop: true });
    expect(bar1[1].words).toBeUndefined();
    expect(bar2.map((n) => [n.length, n.tieStart ?? false])).toEqual([[16, false], [4, false], [12, false]]);
  });

  test("beams follow abcjs's groups, with hooks where a 16th stands alone", () => {
    const abc = `X:1\nM:4/4\nL:1/32\nK:C\nc4d4 e6f2 g2a6 c8 |]\n`;
    const notes = scoreFromAbc(abc).parts[0].measures[0].notes;
    expect(notes.map((n) => n.beams)).toEqual([
      ["begin"], ["end"],
      ["begin"], ["end", "backward hook"],
      ["begin", "forward hook"], ["end"],
      undefined,
    ]);
  });

  test("a whole bar of rest is written as a measure rest", () => {
    const abc = `X:1\nM:3/4\nL:1/32\nK:C\nz24 | c24 |]\n`;
    const [bar1] = scoreFromAbc(abc).parts[0].measures;
    expect(bar1.notes[0].wholeMeasure).toBe(true);
    expect(abcToMusicXml(abc)).toContain('<rest measure="yes"/>');
  });
});

describe("the score", () => {
  test("SATB: four bracketed parts, named, with the tenor's clef and the key", () => {
    const abc = choral("Eb")({ chordSymbols: true, lyrics: "movable" });
    const score = scoreFromAbc(abc);
    expect(score.parts.map((p) => [p.name, p.abbreviation])).toEqual([
      ["Soprano", "S"], ["Alto", "A"], ["Tenor", "T"], ["Bass", "B"],
    ]);
    expect(score.parts.map((p) => p.clef.sign)).toEqual(["G", "G", "G", "F"]);
    expect(score.parts[0].key).toEqual({ fifths: -3, mode: "major" });
    const xml = abcToMusicXml(abc, { tempo: 96, encodingDate: "2026-09-21" });
    expect(xml.match(/<score-part /g)?.length).toBe(4);
    expect(xml).toContain("<group-symbol>bracket</group-symbol>");
    expect(xml).toContain("<per-minute>96</per-minute>");
    expect(xml).toContain("<work-title>Sight Reading Exercise - Eb</work-title>");
    wellFormed(xml);
  });

  test("a hidden voice is not in the file", () => {
    const abc = choral("C")({ hiddenVoices: ["Alto", "Tenor"] });
    expect(scoreFromAbc(abc).parts.map((p) => p.name)).toEqual(["Soprano", "Bass"]);
  });

  test("solfège become lyrics, and chord symbols words above, one each", () => {
    const abc = choral("F")({ chordSymbols: true, lyrics: "movable" });
    const score = scoreFromAbc(abc);
    const soprano = score.parts[0].measures.flatMap((m) => m.notes);
    const wLine = abc.split("\n").find((l) => l.startsWith("w:"))!.slice(2).trim().split(/\s+/);
    expect(soprano.filter((n) => n.lyric).map((n) => n.lyric!.text)).toEqual(wLine);
    const symbols = [...abc.matchAll(/"\^([^"]+)"/g)].map((m) => m[1]);
    const words = score.parts.flatMap((p) => p.measures.flatMap((m) => m.notes)).flatMap((n) => n.words ?? []);
    expect(words.map((w) => w.text)).toEqual(symbols);
    expect(words.every((w) => w.placement === "above")).toBe(true);
  });

  test("text is escaped", () => {
    const xml = abcToMusicXml(`X:1\nT:Tom & Jerry <3\nM:4/4\nL:1/32\nK:C\nc32 |]\n`);
    expect(xml).toContain("<work-title>Tom &amp; Jerry &lt;3</work-title>");
    wellFormed(xml);
  });
});

describe("unison", () => {
  const unison = (over: Record<string, unknown>) =>
    quietly(() =>
      createNewSr({
        bpm: 60, clef: "bass", selectedClef: "bass",
        timeSig: { name: "3/4", tsPerMeasure: 24, beamGroupSize: 8 }, selectedTimeSignature: "3/4",
        measures: 8, maxSkip: 4, tempo: 60, range: { min: 2, max: 12 },
        selectedRhythms: ["quarter", "half", "dotHalf", "eighthEighth"],
        rhythms: rhythms.filter((r) => ["quarter", "half", "dotHalf", "eighthEighth"].includes(r.name)),
        scaleDegrees: new Set([1, 2, 3, 4, 5]), key: "Bb", selectedFlatDegrees: [7],
        accidentalsFollowStep: true, allowTiesAcrossBarline: true,
        chords: ["1", "2", "3", "4", "5", "6", "7"], showSolfege: true,
        partsObject: { numofParts: 1, parts: { Unison: { chordNoteObject: [], order: 0, smallName: "U", selectedRange: [2, 12] } } },
        ...over,
      } as any)
    ) as any;

  test("a bass-clef exercise with ties sounds what abcjs plays", () => {
    const [, , score] = unison({});
    const abc = assembleUnisonAbc(score, { showSolfege: true, showRhythmSyllables: true });
    expect(modelPitches(abc)).toEqual(abcjsPitches(abc));
    const xml = abcToMusicXml(abc, { defaultPartName: "Voice", title: "Sight Reading" });
    expect(xml).toContain("<part-name>Voice</part-name>");
    expect(xml).toContain("<sign>F</sign>");
    wellFormed(xml);
  });

  test("rhythm-only is a one-line percussion part of unpitched notes", () => {
    const [, , score] = unison({ rhythmOnly: true });
    const abc = assembleUnisonAbc(score, { showRhythmSyllables: true });
    const model = scoreFromAbc(abc, { defaultPartName: "Rhythm" });
    expect(model.parts[0]).toMatchObject({ percussion: true, staffLines: 1, clef: { sign: "percussion" } });
    const xml = abcToMusicXml(abc, { defaultPartName: "Rhythm" });
    expect(xml).toContain("<unpitched>");
    expect(xml).not.toContain("<pitch>");
    expect(xml).toContain("<midi-channel>10</midi-channel>");
    expect(xml).toContain('<direction placement="below">');
    wellFormed(xml);
  });
});
