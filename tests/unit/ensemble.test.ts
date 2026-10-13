import { describe, expect, test } from "bun:test";
import { writtenNote, keyAlteration } from "../../src/lib/ensemble/transpose";
import { arrangeEnsemble } from "../../src/lib/ensemble/arrange";
import { generateEnsembleExercise } from "../../src/lib/ensemble/generate";
import { ensembleInstrument, stepsFor } from "../../src/lib/ensemble/instruments";
import { writtenKey } from "../../src/lib/curriculum/band";
import { noteArray } from "../../src/resources/noteArray";
import { timeSignaturesFor } from "../../src/lib/meter";
import { DEFAULT_SETTINGS, settingsFromQuery, settingsFromSaved, settingsQuery } from "../../src/lib/ensemble/settings";
import type { VoiceNote } from "../../src/lib/types";

const TS = timeSignaturesFor(["4/4", "3/4"]);
const note = (name: string, accidental: VoiceNote["accidental"] = null, extra: Partial<VoiceNote> = {}): VoiceNote => ({
  name, degree: 0, pitchValue: noteArray.indexOf(name), length: 8, rest: false, accidental, ...extra,
});
const NATURAL = [0, 2, 4, 5, 7, 9, 11];
const ALT: Record<string, number> = { "double-flat": -2, flat: -1, natural: 0, sharp: 1, "double-sharp": 2 };
/** What a note sounds, in semitones from C,, - its letter, its sign or the key's. */
const sounds = (n: VoiceNote, key: string) =>
  Math.floor(n.pitchValue / 7) * 12 + NATURAL[((n.pitchValue % 7) + 7) % 7] + (n.accidental ? ALT[n.accidental] : keyAlteration(key, n.pitchValue));

describe("an instrument reads its part", () => {
  test("a B♭ trumpet a step up, an alto sax a sixth up, a horn a fifth up", () => {
    const bb = note("B", "flat"); // concert B♭4 in C
    const tpt = writtenNote(bb, { concertKey: "C", writtenKey: "D", octave: 0, transpose: -2 });
    expect(tpt.name).toBe("c");
    expect(tpt.accidental).toBe("natural");
    const inBb = note("B"); // concert B♭4, diatonic in B♭
    expect(writtenNote(inBb, { concertKey: "Bb", writtenKey: "C", octave: 0, transpose: -2 })).toMatchObject({ name: "c", accidental: null });
    expect(writtenNote(inBb, { concertKey: "Bb", writtenKey: "G", octave: 0, transpose: -9 })).toMatchObject({ name: "g", accidental: null });
    expect(writtenNote(inBb, { concertKey: "Bb", writtenKey: "F", octave: 0, transpose: -7 })).toMatchObject({ name: "f", accidental: null });
  });
  test("a chromatic note stays chromatic, raised or lowered as it was (fi stays fi)", () => {
    // Concert B♭ major: fi is E natural, a raised natural.
    const fi = note("E", "natural", { wasRaised: true });
    const w = writtenNote(fi, { concertKey: "Bb", writtenKey: "C", octave: 0, transpose: -2 });
    expect(w).toMatchObject({ name: "F", accidental: "sharp" });
    // te in concert C (B♭) on a B♭ trumpet (written D major): C natural, a lowered natural.
    const te = note("B", "flat");
    expect(writtenNote(te, { concertKey: "C", writtenKey: "D", octave: 0, transpose: -2 })).toMatchObject({ name: "c", accidental: "natural", wasRaised: false });
  });
  test("an octave down, and a tenor's treble-8 written an octave up", () => {
    expect(writtenNote(note("G"), { concertKey: "C", writtenKey: "C", octave: -1, transpose: 0 }).name).toBe("G,");
    expect(writtenNote(note("G,"), { concertKey: "C", writtenKey: "C", octave: 0, transpose: -12 }).name).toBe("G");
  });
  test("every written note sounds its concert note, in every key and transposition", () => {
    for (const key of ["C", "F", "Bb", "Eb", "Ab", "G", "D", "A"])
      for (const t of [0, -2, -7, -9, -12, -14, -21])
        for (const name of ["C", "E", "F", "G", "B", "c", "e"])
          for (const acc of [null, "sharp", "flat", "natural"] as VoiceNote["accidental"][]) {
            const n = note(name, acc);
            const w = writtenNote(n, { concertKey: key, writtenKey: writtenKey(key, t), octave: 0, transpose: t });
            expect(sounds(w, writtenKey(key, t)) + t).toBe(sounds(n, key));
          }
  });
});

describe("arranging an ensemble", () => {
  test("a brass quintet: four parts, the trumpets sharing the top, the tuba the bass", () => {
    const a = arrangeEnsemble([{ instrument: "band-trumpet", count: 2 }, { instrument: "band-horn", count: 1 }, { instrument: "band-trombone", count: 1 }, { instrument: "band-tuba", count: 1 }]);
    expect(a.parts.map((p) => p.name)).toEqual(["Soprano", "Alto", "Tenor", "Bass"]);
    const tuba = a.staves.find((s) => s.instrument.id === "band-tuba")!;
    expect(a.parts[tuba.part].order).toBe(0);
    expect(a.staves.filter((s) => s.instrument.id === "band-trumpet")).toHaveLength(1);
    expect(a.staves.find((s) => s.instrument.id === "band-trumpet")!).toMatchObject({ part: 0, count: 2, name: "Trumpet (2)" });
  });
  test("four trumpets split into four numbered parts, staggered", () => {
    const a = arrangeEnsemble([{ instrument: "band-trumpet", count: 4 }]);
    expect(a.staves.map((s) => s.name)).toEqual(["Trumpet 1", "Trumpet 2", "Trumpet 3", "Trumpet 4"]);
    for (let k = 1; k < 4; k++) expect(a.parts[k].current[1]).toBeLessThanOrEqual(a.parts[k - 1].current[1]);
    expect(a.parts[3].current[0]).toBeLessThan(a.parts[0].current[0]);
  });
  test("a string bass under a violin plays its line an octave down", () => {
    const a = arrangeEnsemble([{ instrument: "orch-violin", count: 1 }, { instrument: "orch-bass", count: 1 }]);
    expect(a.staves.find((s) => s.instrument.id === "orch-bass")!.octave).toBe(-1);
    expect(a.parts[0].current[0] - a.parts[1].current[1]).toBeLessThanOrEqual(3);
  });
  test("staves in score order: woodwinds, brass, voices, strings", () => {
    const a = arrangeEnsemble([{ instrument: "orch-cello", count: 1 }, { instrument: "soprano", count: 1 }, { instrument: "band-trumpet", count: 1 }, { instrument: "band-flute", count: 1 }]);
    expect(a.staves.map((s) => s.instrument.id)).toEqual(["band-flute", "band-trumpet", "soprano", "orch-cello"]);
  });
});

const ENSEMBLES: Record<string, [string, number][]> = {
  "brass quintet": [["band-trumpet", 2], ["band-horn", 1], ["band-trombone", 1], ["band-tuba", 1]],
  "string quartet": [["orch-violin", 2], ["orch-viola", 1], ["orch-cello", 1]],
  "SATB and cello": [["soprano", 1], ["alto", 1], ["tenor", 1], ["bass", 1], ["orch-cello", 1]],
  "flute and clarinet": [["band-flute", 1], ["band-clarinet", 1]],
  "violin and string bass": [["orch-violin", 1], ["orch-bass", 1]],
  "full band": [["band-flute", 2], ["band-clarinet", 3], ["band-alto-sax", 2], ["band-tenor-sax", 1], ["band-bari-sax", 1], ["band-trumpet", 3], ["band-horn", 2], ["band-trombone", 2], ["band-euphonium", 1], ["band-tuba", 1]],
};

describe("an ensemble exercise", () => {
  test("each staff in its own key, clef and sound, transposed back for playback", () => {
    const ex = generateEnsembleExercise({ members: ENSEMBLES["brass quintet"].map(([instrument, count]) => ({ instrument, count })), key: "Bb", timeSig: TS["4/4"], measures: 4, level: 3, bpm: 80 });
    expect(ex.abc).toContain('V:Tpt clef=treble name="Trumpet (2)" snm="Tpt" transpose=-2');
    expect(ex.abc).toContain('V:Hn clef=treble name="French horn" snm="Hn" transpose=-7');
    expect(ex.abc).toMatch(/V:Tpt\n%%MIDI program 56\n\[K:C\] /);
    expect(ex.abc).toMatch(/V:Hn\n%%MIDI program 60\n\[K:F\] /);
    expect(ex.abc).toMatch(/V:Tba\n%%MIDI program 58\n\[K:Bb\] /);
  });
  test("every staff sounds its part (at the octave it plays it)", () => {
    const members = ENSEMBLES["full band"].map(([instrument, count]) => ({ instrument, count }));
    const ex = generateEnsembleExercise({ members, key: "Eb", timeSig: TS["4/4"], measures: 4, level: 4, bpm: 80 });
    ex.arrangement.staves.forEach((s, i) => {
      const wk = writtenKey("Eb", s.instrument.transpose);
      ex.concert[s.part].forEach((c, j) => {
        const w = ex.staffNotes[i][j];
        expect(w.rest).toBe(c.rest);
        if (!c.rest) expect(sounds(w, wk) + s.instrument.transpose).toBe(sounds(c, "Eb") - 12 + 12 * s.octave);
      });
    });
  });
  test("common ensembles generate at every level and stay in their players' ranges", () => {
    const quiet = { log: console.log, warn: console.warn };
    for (const [name, list] of Object.entries(ENSEMBLES)) {
      const members = list.map(([instrument, count]) => ({ instrument, count }));
      for (const level of [1, 3, 5])
        for (const key of ["Bb", "F"]) {
          Object.assign(console, { log: () => {}, warn: () => {} });
          let ex;
          try {
            ex = generateEnsembleExercise({ members, key, timeSig: TS[level === 1 ? "3/4" : "4/4"], measures: 8, level, bpm: 80 });
          } finally {
            Object.assign(console, quiet);
          }
          ex.arrangement.staves.forEach((s, i) => {
            const inst = ensembleInstrument[s.instrument.id];
            const lo = inst.concert.min - stepsFor(inst.transpose) - 2;
            const hi = inst.concert.max - stepsFor(inst.transpose) + 2;
            for (const n of ex.staffNotes[i]) if (!n.rest) expect(n.pitchValue, `${name}: ${s.name}`).toBeGreaterThanOrEqual(lo), expect(n.pitchValue, `${name}: ${s.name}`).toBeLessThanOrEqual(hi);
          });
        }
    }
  }, 120_000);
});

describe("the Bach chorale style", () => {
  const quintet = ENSEMBLES["brass quintet"].map(([instrument, count]) => ({ instrument, count }));
  test("a fermata over every part at each phrase's end, and over the last note", () => {
    const ex = generateEnsembleExercise({ members: quintet, key: "Bb", timeSig: TS["4/4"], measures: 8, level: 3, bpm: 80, style: "chorale" });
    for (const notes of ex.staffNotes) {
      const sounding = notes.filter((n) => !n.rest);
      expect(sounding[sounding.length - 1].fermata).toBe(true);
      expect(notes.filter((n) => n.fermata).length).toBeGreaterThanOrEqual(2);
    }
    // Every staff holds its fermatas at the same moments.
    const ends = (notes: VoiceNote[]) => { let at = 0; return notes.map((n) => ((at += n.length), n.fermata ? at : -1)).filter((x) => x >= 0); };
    const first = ends(ex.staffNotes[0]);
    for (const notes of ex.staffNotes) expect(ends(notes)).toEqual(first);
    expect((ex.abc.match(/!fermata!/g) ?? []).length).toBe(first.length * ex.staffNotes.length);
  });
  test("busier than the simple style: more of the parts move in eighths, on their own", () => {
    const eighthShare = (style: "simple" | "chorale") => {
      let eighths = 0, notes = 0;
      const quiet = { log: console.log, warn: console.warn };
      Object.assign(console, { log: () => {}, warn: () => {} });
      try {
        for (let r = 0; r < 12; r++) {
          const ex = generateEnsembleExercise({ members: quintet, key: "F", timeSig: TS["4/4"], measures: 8, level: 5, bpm: 80, style });
          for (const part of ex.concert) for (const n of part) if (!n.rest) { notes++; if (n.length <= 4) eighths++; }
        }
      } finally {
        Object.assign(console, quiet);
      }
      return eighths / notes;
    };
    // Measured: about 20% at Level 5 (Bach writes 36%); simple at Level 5 takes UIL's rhythms.
    expect(eighthShare("chorale")).toBeGreaterThan(0.12);
  }, 120_000);
});

describe("ensemble settings: links and saved ensembles", () => {
  test("the style rides in the link, and a saved ensemble opens as saved", () => {
    const s = { ...DEFAULT_SETTINGS, style: "simple" as const, level: 4, keys: ["Eb"], members: [{ instrument: "band-flute", count: 2 }, { instrument: "band-tuba", count: 1 }] };
    expect(settingsFromQuery("?" + settingsQuery(s))).toEqual(s);
    expect(settingsFromSaved(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });
  test("a damaged saved ensemble still opens, on the defaults", () => {
    expect(settingsFromSaved(null)).toEqual(DEFAULT_SETTINGS);
    expect(settingsFromSaved({ members: "brass", level: "x" })).toEqual(DEFAULT_SETTINGS);
    expect(settingsFromSaved({ members: [{ instrument: "band-nonsense", count: 3 }] }).members).toEqual(DEFAULT_SETTINGS.members);
  });
});
