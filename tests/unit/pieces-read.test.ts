import { describe, expect, test } from "bun:test";
import abcjs from "abcjs";
import { strToU8, zipSync } from "fflate";
import { PieceReadError, nearestProgram, readMusicXml } from "../../src/lib/pieces/read-musicxml";
import { abcForPiece, drawnElements, splitLength } from "../../src/lib/pieces/write-abc";
import { TICKS, type PieceScore } from "../../src/lib/pieces/model";
import { attrs, backup, note, scoreXml } from "./fixtures/musicxml-pieces";

const read = (xml: string, name = "test.musicxml") => readMusicXml(strToU8(xml), name);

/** A choir line with lyrics, a tie over the barline, a triplet and a chord; a B-flat clarinet with a key change. */
function threeBarScore(): string {
  return scoreXml([
    {
      id: "P1",
      name: "Soprano",
      program: 52,
      measures: [
        attrs({ divisions: 6 }) +
          `<direction><sound tempo="72"/></direction>` +
          note("C4", 6, { lyric: ["Hal", "begin"] }) +
          note("E4", 6, { lyric: ["le", "middle"] }) +
          note("G4", 6, { lyric: ["lu", "end"] }) +
          note("A4", 6, { tie: "start" }),
        note("A4", 6, { tie: "stop" }) +
          note("B4", 2, { tuplet: "start", type: "eighth" }) +
          note("C5", 2, { tuplet: "mid", type: "eighth" }) +
          note("D5", 2, { tuplet: "stop", type: "eighth" }) +
          note("C4", 12, { type: "half" }) +
          note("E4", 12, { chord: true, type: "half" }),
        note("F#4", 24, { type: "whole" }),
      ],
    },
    {
      id: "P2",
      name: "Clarinet in B♭",
      program: 71,
      measures: [
        attrs({ divisions: 6, fifths: 2, transpose: -2 }) + note("D4", 24, { type: "whole" }),
        note("E4", 12, { type: "half" }) + note("rest", 12, { type: "half" }),
        `<attributes><key><fifths>3</fifths></key></attributes>` + note("F#4", 24, { type: "whole" }),
      ],
    },
  ]);
}

/** Every sounding note abcjs plays, as "midi@whole-notes-from-the-start". */
function played(abc: string): string[] {
  const [tune] = abcjs.parseOnly(abc) as unknown as { warnings?: string[]; setUpAudio: (o: object) => { tracks: { cmd: string; pitch: number; start: number }[][] } }[];
  expect(tune.warnings ?? []).toEqual([]);
  return tune
    .setUpAudio({})
    .tracks.flat()
    .filter((e) => e.cmd === "note")
    .map((e) => `${e.pitch}@${e.start.toFixed(4)}`)
    .sort();
}

/** What the model says should sound: tie continuations are held, not struck. */
function expected(score: PieceScore, from = 0, to = score.measures.length - 1): string[] {
  const t0 = score.measures[from].start;
  return score.parts
    .flatMap((p) => p.notes)
    .filter((n) => !n.rest && !n.tieStop && n.measure >= from && n.measure <= to)
    .map((n) => `${n.midi}@${((n.start - t0) / (TICKS * 4)).toFixed(4)}`)
    .sort();
}

describe("readMusicXml", () => {
  test("times, pitches, ties, a triplet, a chord and lyrics", () => {
    const score = read(threeBarScore());
    expect(score.title).toBe("Test Piece");
    expect(score.composer).toBe("A. Composer");
    expect(score.measures.map((m) => [m.label, m.start, m.length])).toEqual([
      ["1", 0, 192],
      ["2", 192, 192],
      ["3", 384, 192],
    ]);
    expect(score.measures[0].tempo).toBe(72);
    const sop = score.parts[0];
    expect(sop.program).toBe(52);
    expect(sop.notes.map((n) => n.midi ?? "r")).toEqual([60, 64, 67, 69, 69, 71, 72, 74, 60, 64, 66]);
    expect(sop.notes[3].tieStart).toBe(true);
    expect(sop.notes[4].tieStop).toBe(true);
    expect(sop.notes.slice(5, 8).map((n) => [n.start, n.length])).toEqual([
      [240, 16],
      [256, 16],
      [272, 16],
    ]);
    expect(sop.notes[9].chord).toBe(true);
    expect(sop.notes[9].start).toBe(sop.notes[8].start);
    expect(sop.notes.slice(0, 3).map((n) => n.lyric?.text)).toEqual(["Hal", "le", "lu"]);
  });

  test("a transposing part sounds where it should, and keeps its own key changes", () => {
    const clar = read(threeBarScore()).parts[1];
    expect(clar.transpose).toBe(-2);
    // Written D4 on a B-flat clarinet is concert C4.
    expect(clar.notes[0].written).toEqual({ step: "D", alter: 0, octave: 4 });
    expect(clar.notes[0].midi).toBe(60);
    expect(clar.keys.map((k) => [k.measure, k.fifths])).toEqual([
      [0, 2],
      [2, 3],
    ]);
  });

  test("two voices on a staff and a second staff, through backup", () => {
    const xml = scoreXml([
      {
        id: "P1",
        name: "Piano",
        program: 0,
        measures: [
          attrs({ staves: 2, clef: `<clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef>` }) +
            note("E5", 8, { type: "whole", staff: 1 }) +
            backup(8) +
            note("C5", 4, { voice: 2, staff: 1, type: "half" }) +
            note("D5", 4, { voice: 2, staff: 1, type: "half" }) +
            backup(8) +
            note("C3", 8, { voice: 5, staff: 2, type: "whole" }),
        ],
      },
    ]);
    const score = read(xml);
    const piano = score.parts[0];
    expect(piano.staves).toBe(2);
    expect(piano.clefs.map((c) => [c.staff, c.clef])).toEqual([
      [1, "treble"],
      [2, "bass"],
    ]);
    expect(piano.notes.map((n) => [n.midi, n.start, n.voice, n.staff])).toEqual([
      [76, 0, "1", 1],
      [72, 0, "2", 1],
      [74, 96, "2", 1],
      [48, 0, "5", 2],
    ]);
    const { abc, voices, staves } = abcForPiece(score);
    expect(played(abc)).toEqual(expected(score));
    expect(staves.map((s) => s.length)).toEqual([2, 1]);
    const [tune] = abcjs.parseOnly(abc) as unknown as Parameters<typeof drawnElements>[0][];
    const drawn = drawnElements(tune, staves);
    for (const v of voices) expect(drawn.get(v.id)?.length).toBe(v.elements.length);
    expect(abc).toContain("%%score {(P0S1V1 P0S1V2) | P0S2V5}");
  });

  test("repeats and volta brackets are kept as written", () => {
    const xml = scoreXml([
      {
        id: "P1",
        name: "Flute",
        program: 73,
        measures: [
          attrs() + note("C5", 8, { type: "whole" }),
          `<barline location="left"><repeat direction="forward"/></barline>` + note("D5", 8, { type: "whole" }),
          `<barline location="left"><ending number="1" type="start"/></barline>` +
            note("E5", 8, { type: "whole" }) +
            `<barline location="right"><ending number="1" type="stop"/><repeat direction="backward"/></barline>`,
          `<barline location="left"><ending number="2" type="start"/></barline>` +
            note("F5", 8, { type: "whole" }) +
            `<barline location="right"><ending number="2" type="discontinue"/></barline>`,
        ],
      },
    ]);
    const score = read(xml);
    expect(score.measures.map((m) => m.label)).toEqual(["1", "2", "3", "4"]);
    expect(score.measures[1].repeatStart).toBe(true);
    expect(score.measures[2]).toMatchObject({ endingStart: "1", endingStop: "stop", repeatEnd: true });
    expect(score.measures[3]).toMatchObject({ endingStart: "2", endingStop: "discontinue" });
    const { abc } = abcForPiece(score);
    expect(abc).toMatch(/\|: \[K:C\]|\|:/);
    expect(abc).toContain("[1");
    expect(abc).toContain(":|");
    expect(abc).toContain("[2");
    // abcjs plays the repeat: bar 2 twice, the first ending once, then the second.
    const notes = played(abc).map((s) => Number(s.split("@")[0]));
    expect(notes.filter((n) => n === 74)).toHaveLength(2);
    expect(notes.filter((n) => n === 76)).toHaveLength(1);
    expect(notes.filter((n) => n === 77)).toHaveLength(1);
  });

  test("a compressed .mxl opens through its container", () => {
    const zipped = zipSync({
      "META-INF/container.xml": strToU8(
        `<?xml version="1.0"?><container><rootfiles><rootfile full-path="score.musicxml"/></rootfiles></container>`,
      ),
      "score.musicxml": strToU8(threeBarScore()),
    });
    expect(readMusicXml(zipped, "x.mxl").parts).toHaveLength(2);
  });

  test("grace notes and drum parts are left out, and said so", () => {
    const xml = scoreXml([
      { id: "P1", name: "Voice", measures: [attrs() + note("C4", 1, { grace: true, type: "eighth" }) + note("C4", 8, { type: "whole" })] },
      {
        id: "P2",
        name: "Drum Set",
        measures: [attrs() + `<note><unpitched><display-step>C</display-step><display-octave>5</display-octave></unpitched><duration>8</duration><voice>1</voice></note>`],
      },
    ]);
    const score = read(xml);
    expect(score.parts.map((p) => p.name)).toEqual(["Voice"]);
    expect(score.parts[0].notes).toHaveLength(1);
    expect(score.warnings).toEqual(["1 grace note left out", "1 drum part left out"]);
  });

  test("a file that is not MusicXML says what to do", () => {
    expect(() => read("<html><body>hi</body></html>")).toThrow(PieceReadError);
    expect(() => read("<html><body>hi</body></html>")).toThrow(/Export/);
    expect(() => readMusicXml(new Uint8Array([0x50, 0x4b, 1, 2, 3]), "x.mxl")).toThrow(PieceReadError);
  });
});

describe("abcForPiece", () => {
  test("abcjs plays every note at its pitch and time, the clarinet at concert pitch", () => {
    const score = read(threeBarScore());
    const { abc } = abcForPiece(score, { title: true });
    expect(played(abc)).toEqual(expected(score));
    expect(abc).toContain("%%MIDI program 52");
    expect(abc).toContain("%%MIDI program 71");
    expect(abc).toContain("transpose=-2");
    expect(abc).toContain("(3:2:3");
    expect(abc).toContain("w: Hal- le- lu");
  });

  test("an excerpt starts at its first bar", () => {
    const score = read(threeBarScore());
    const { abc, startTick } = abcForPiece(score, { from: 1, to: 2 });
    expect(startTick).toBe(192);
    // The tie into bar 2 is cut: its second half sounds as the excerpt's first note.
    const want = expected(score, 1, 2);
    want.push(`69@0.0000`);
    expect(played(abc)).toEqual(want.sort());
  });

  test("element map lines up with what abcjs draws, voice by voice", () => {
    const score = read(threeBarScore());
    const out = abcForPiece(score);
    const [tune] = abcjs.parseOnly(out.abc) as unknown as Parameters<typeof drawnElements>[0][];
    const drawn = drawnElements(tune, out.staves);
    for (const v of out.voices) {
      const els = drawn.get(v.id)!;
      expect(els.length).toBe(v.elements.length);
      v.elements.forEach((ni, k) => {
        const el = els[k] as { rest?: unknown; pitches?: unknown[] };
        if (ni < 0) expect(el.rest).toBeTruthy();
        else expect(!!el.rest).toBe(score.parts[v.part].notes[ni].rest);
      });
    }
  });

  test("odd lengths are drawn as tied notes abcjs can draw", () => {
    expect(splitLength(60)).toEqual([48, 12]);
    expect(splitLength(192)).toEqual([192]);
    expect(splitLength(168)).toEqual([144, 24]);
  });
});

describe("nearestProgram", () => {
  test("the file's program when we have it, else the name, else the family", () => {
    expect(nearestProgram(71, "Clarinet")).toBe(71);
    expect(nearestProgram(72, "Bass Clarinet")).toBe(71);
    expect(nearestProgram(undefined, "Alto Saxophone")).toBe(65);
    expect(nearestProgram(undefined, "Violoncello")).toBe(42);
    expect(nearestProgram(undefined, "Soprano")).toBe(53);
    expect(nearestProgram(61, "Brass")).toBe(56);
    expect(nearestProgram(undefined, "Theremin")).toBe(0);
  });
});
