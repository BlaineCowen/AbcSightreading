import { describe, expect, test } from "bun:test";
import { generateChoralExercise } from "../../src/lib/generateChoral";
import { labelFor } from "../../src/lib/build-chord-notes";
import type { Chord, VoiceNote } from "../../src/lib/types";
import { chords as fullChordSet } from "../../src/resources/chords";
import { rhythms as allRhythms } from "../../src/resources/rhythms";
import { solfegeFor, modeOf } from "../../src/resources/solfege";

/**
 * Solfège lyrics and chord symbols are both *silent* features: when they go
 * wrong nothing throws, the score just quietly says less than it should. The
 * symbol producer sat unwritten for months behind a type field, an emitter and a
 * propagation rule that all looked finished - so these assert the output, not
 * the plumbing.
 */

const PARTS = {
  numofParts: 4,
  parts: {
    Soprano: { order: 3, smallName: "S", clef: "treble octave=-1", range: [25, 32], currentRange: [25, 32] },
    Alto: { order: 2, smallName: "A", clef: "treble octave=-1", range: [21, 28], currentRange: [21, 28] },
    Tenor: { order: 1, smallName: "T", clef: "treble transpose=-12", range: [14, 23], currentRange: [14, 23] },
    Bass: { order: 0, smallName: "B", clef: "bass octave=-1", range: [9, 18], currentRange: [9, 18] },
  },
} as any;

function generate(overrides: Record<string, unknown> = {}) {
  const selectedRhythms = allRhythms.filter((r) =>
    ["whole", "half", "quarter"].includes(r.name)
  );
  // Randomised generator: retry rather than let an unlucky draw fail the test.
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const out = generateChoralExercise({
        key: "C",
        timeSig: { name: "4/4", tsPerMeasure: 32 },
        partsObject: PARTS,
        measures: 8,
        maxSkip: 4,
        bpm: 72,
        selectedRhythms,
        chords: fullChordSet,
        accidentalsByStep: true,
        nctProbability: 0.3,
        chromaticFrequency: 1,
        ...overrides,
      } as any);
      if (out?.abcString) return out;
    } catch {
      /* try again */
    }
  }
  throw new Error("could not generate a choral exercise in 40 attempts");
}

/** The `[V:x] ...` body lines, paired with the `w:` line that follows each. */
function voiceLines(abc: string): { body: string; lyric: string | null }[] {
  const lines = abc.split("\n");
  const out: { body: string; lyric: string | null }[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith("[V:")) continue;
    const next = lines[i + 1] ?? "";
    out.push({ body: lines[i], lyric: next.startsWith("w:") ? next : null });
  }
  return out;
}

/** Note elements in a body line, with annotations removed first. */
function noteCount(body: string): number {
  const stripped = body.replace(/"[^"]*"/g, "");
  return (stripped.match(/[A-Ga-g][,']*\d+/g) ?? []).length;
}

const symbolsIn = (abc: string) =>
  [...abc.matchAll(/"\^([^"]+)"/g)].map((m) => m[1]);

describe("solfège syllables", () => {
  test("major runs do through ti", () => {
    const got = [0, 1, 2, 3, 4, 5, 6].map((d) => solfegeFor(d, null, undefined, "major"));
    expect(got).toEqual(["do", "re", "mi", "fa", "so", "la", "ti"]);
  });

  test("minor is la-based: the tonic is la, not do", () => {
    // The whole point of the mode option. Do-based minor would give "do" here.
    expect(solfegeFor(0, null, undefined, "minor")).toBe("la");
    expect(solfegeFor(1, null, undefined, "minor")).toBe("ti");
    expect(solfegeFor(2, null, undefined, "minor")).toBe("do");
  });

  test("the minor leading tone is si", () => {
    // Degree 6 raised. This only comes out right if the la rotation is applied
    // BEFORE the alteration - rotate after and you get "li".
    expect(solfegeFor(6, "sharp", undefined, "minor")).toBe("si");
    expect(solfegeFor(6, "natural", true, "minor")).toBe("si");
  });

  test("a natural resolves by wasRaised, which is the only thing that can tell", () => {
    // A natural sign alone cannot say whether it raised or lowered the written
    // pitch: Bb->B natural in F major raises, F#->F natural in G major lowers.
    expect(solfegeFor(3, "natural", true, "major")).toBe("fi");
    expect(solfegeFor(3, "natural", false, "major")).toBe("fe");
  });

  test("double accidentals take the single-alteration syllable", () => {
    expect(solfegeFor(0, "double-sharp", undefined, "major")).toBe("di");
    expect(solfegeFor(6, "double-flat", undefined, "major")).toBe("te");
  });

  test("degrees with no altered syllable fall back rather than vanish", () => {
    // Sharped mi and ti have no standard name.
    expect(solfegeFor(2, "sharp", undefined, "major")).toBe("mi");
    expect(solfegeFor(0, "flat", undefined, "major")).toBe("do");
  });

  test("modeOf reads the key the way the UI writes it", () => {
    expect(modeOf("C")).toBe("major");
    expect(modeOf("Am")).toBe("minor");
    expect(modeOf("F#m")).toBe("minor");
  });
});

describe("lyric alignment", () => {
  // ABC pins a syllable to a note element and skips rests entirely, so one
  // extra or missing token shifts every syllable after it onto the wrong note -
  // silently, and for the rest of the piece.
  for (const [label, overrides] of [
    ["plain", {}],
    ["with rests", { selectedRhythms: allRhythms.filter((r) => ["whole", "half", "quarter", "halfRest", "quarterRest"].includes(r.name)) }],
    ["with an independent texture", { voiceTexture: "independent", measures: 16 }],
    ["with heavy decoration", { nctProbability: 1 }],
  ] as [string, Record<string, unknown>][]) {
    test(`one syllable per note, ${label}`, () => {
      const out = generate({ ...overrides, display: { lyrics: "movable", chordSymbols: true } });
      const voices = voiceLines(out.abcString);
      expect(voices.length).toBeGreaterThan(0);
      for (const { body, lyric } of voices) {
        expect(lyric).not.toBeNull();
        const slots = lyric!.replace(/^w:\s*/, "").trim().split(/\s+/).filter(Boolean);
        expect(slots.length).toBe(noteCount(body));
      }
    });
  }

  test("no lyric line at all when solfège is off", () => {
    const out = generate({ display: { chordSymbols: true } });
    expect(out.abcString).not.toContain("\nw:");
  });
});

/**
 * The symbols with their first-inversion figure taken off, consecutive repeats
 * collapsed.
 *
 * A printed symbol is the chord as VOICED - a root-position entry whose bass
 * sang the third prints as I⁶ - while the progression holds the entry. Compared
 * in this form, the row still has to follow the progression chord for chord;
 * `labelFor` is tested for the exact figure below.
 */
const rootForms = (symbols: string[]) => {
  const out: string[] = [];
  for (const s of symbols) {
    const root = s.replace("⁶₅", "⁷").replace(/⁶(?!₄)/, "");
    if (root !== out[out.length - 1]) out.push(root);
  }
  return out;
};

describe("chord symbols", () => {
  test("the score is actually labelled", () => {
    // The regression that matters: every piece of this feature existed except
    // the one that assigns the symbol, and nothing noticed for months.
    const out = generate({ display: { chordSymbols: true } });
    expect(symbolsIn(out.abcString).length).toBeGreaterThan(0);
  });

  test("the symbols follow the progression, in order and without repeats", () => {
    const out = generate({ display: { chordSymbols: true } });
    const expected = rootForms(out.chordProgression.map((c) => c.symbol));
    expect(rootForms(symbolsIn(out.abcString))).toEqual(expected);
  });

  test("they all sit on one voice, so they read as a single row", () => {
    const out = generate({ display: { chordSymbols: true } });
    const labelled = voiceLines(out.abcString).filter((v) => v.body.includes('"^'));
    expect(labelled.length).toBe(1);
  });

  test("a chord that falls while the labelled voice rests is not printed", () => {
    // This used to assert the opposite - that a thinning texture lost no
    // symbols - and rest-merging was held back to keep that true: a rest
    // carrying a symbol was never merged with its neighbours.
    //
    // The cost was paid on the page. Symbols are attached to the top voice
    // whether or not they are being SHOWN, so the merge was refused always, and
    // a soprano resting through a staggered entrance came out as a scatter of
    // quarter and half rests instead of whole-bar rests. Measured over 12
    // exercises: 80 quarters and 30 halves, against 24 whole rests now.
    //
    // So the silence is one rest and the chords under it go unlabelled. What
    // must still hold is that nothing is invented and nothing is reordered -
    // the row is a subsequence of the progression, not a different reading of
    // it - and that with every part singing, nothing is lost at all.
    const out = generate({
      voiceTexture: "staggered",
      measures: 16,
      selectedRhythms: allRhythms.filter((r) =>
        ["whole", "half", "quarter", "halfRest", "quarterRest"].includes(r.name)
      ),
      display: { chordSymbols: true },
    });
    const expected = rootForms(out.chordProgression.map((c) => c.symbol));
    const printed = rootForms(symbolsIn(out.abcString));
    expect(printed.length).toBeGreaterThan(0);
    // An ordered subsequence: walk the expected list once and match in order.
    let at = 0;
    for (const symbol of printed) {
      const found = expected.indexOf(symbol, at);
      expect(found).toBeGreaterThanOrEqual(0);
      at = found + 1;
    }
  });

  test("with every part singing, no symbol is lost", () => {
    // The guarantee that survives: thinning is the only thing that drops one.
    const out = generate({
      voiceTexture: "full",
      measures: 16,
      selectedRhythms: allRhythms.filter((r) =>
        ["whole", "half", "quarter"].includes(r.name)
      ),
      display: { chordSymbols: true },
    });
    const expected = rootForms(out.chordProgression.map((c) => c.symbol));
    expect(rootForms(symbolsIn(out.abcString))).toEqual(expected);
  });

  test("none at all when chord symbols are off", () => {
    expect(symbolsIn(generate({ display: {} }).abcString)).toEqual([]);
  });
});

describe("re-rendering the same exercise", () => {
  test("turning annotations off changes only the annotations", () => {
    const out = generate({ display: { chordSymbols: true, lyrics: "movable" } });
    const plain = out.render({});
    const strip = (abc: string) =>
      abc
        .split("\n")
        .filter((l) => !l.startsWith("w:"))
        .map((l) => (l.startsWith("[V:") ? l.replace(/"[^"]*"/g, "") : l))
        .join("\n");
    // The music must be byte-identical - same notes, same barlines, same header.
    expect(strip(out.abcString)).toBe(strip(plain));
    expect(plain).not.toContain('"^');
    expect(plain).not.toContain("\nw:");
  });

  test("annotations can be turned back on without regenerating", () => {
    const out = generate({ display: {} });
    const annotated = out.render({ chordSymbols: true, lyrics: "movable" });
    expect(symbolsIn(annotated).length).toBeGreaterThan(0);
    expect(annotated).toContain("\nw:");
  });

  test("re-rendering keeps the chosen instrument", () => {
    // Re-assembling from the metadata captured at generation time would quietly
    // reset playback to whatever instrument was picked back then.
    const out = generate({ midiProgram: 0, display: {} });
    expect(out.render({ midiProgram: 52 })).toContain("%%MIDI program 52");
  });
});

describe("a symbol names the inversion the bass actually sings", () => {
  // Reported from a score: "iii" over A in the bass, in D major. That is iii⁶.
  const chord = (symbol: string, root: number, triadNotes: number[]) =>
    ({ symbol, root, triadNotes } as unknown as Chord);
  const bass = (degree: number, rest = false) =>
    ({ degree, rest, pitchValue: 0, name: "x" } as unknown as VoiceNote);

  test("root in the bass leaves it alone", () => {
    expect(labelFor(chord("iii", 2, [2, 4, 6]), bass(2))).toBe("iii");
  });
  test("the third in the bass of a triad is a six", () => {
    expect(labelFor(chord("iii", 2, [2, 4, 6]), bass(4))).toBe("iii⁶");
    expect(labelFor(chord("vii°", 6, [6, 1, 3]), bass(1))).toBe("vii°⁶");
  });
  test("of a seventh chord, a six-five, with the seven gone", () => {
    expect(labelFor(chord("V⁷", 4, [4, 6, 1, 3]), bass(6))).toBe("V⁶₅");
  });
  test("an applied chord keeps what it is applied to", () => {
    expect(labelFor(chord("V/V", 1, [1, 3, 5]), bass(3))).toBe("V⁶/V");
    expect(labelFor(chord("V⁷/IV", 0, [0, 2, 4, 6]), bass(2))).toBe("V⁶₅/IV");
  });
  test("an entry that already names its inversion is not figured twice", () => {
    expect(labelFor(chord("I⁶₄", 4, [0, 2, 4]), bass(4))).toBe("I⁶₄");
  });
  test("a resting bass leaves the entry's own symbol", () => {
    expect(labelFor(chord("IV", 3, [3, 5, 0]), bass(5, true))).toBe("IV");
  });
});
