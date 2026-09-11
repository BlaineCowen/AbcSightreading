import { describe, expect, test } from "bun:test";
import abcjs from "abcjs";
import {
  clampTranspose,
  soundingKey,
  transposeLabel,
  MIN_TRANSPOSE,
  MAX_TRANSPOSE,
} from "../../src/lib/transpose";

/**
 * Playback in a different key from the one on the page.
 *
 * The notation never moves - only the sound - so everything here is about
 * naming the result correctly for the control's label. The transposition itself
 * is a semitone count handed to abcjs.
 */

describe("sounding key", () => {
  test("the case this was built for: written in F, sounds in C", () => {
    expect(soundingKey("F", -5)).toBe("C");
  });

  test("up and down reach the same name an octave apart", () => {
    // Which is exactly why the control counts semitones rather than offering a
    // key to pick: the name alone cannot say which octave you meant.
    expect(soundingKey("F", 7)).toBe(soundingKey("F", -5));
  });

  test("no transposition leaves the key alone", () => {
    for (const k of ["C", "F", "Bb", "Eb", "G", "D", "Am", "Dm", "F#m"]) {
      expect(soundingKey(k, 0)).toBe(k);
    }
  });

  test("an octave either way is the same key", () => {
    for (const k of ["C", "Bb", "E", "Gm"]) {
      expect(soundingKey(k, 12)).toBe(k);
      expect(soundingKey(k, -12)).toBe(k);
    }
  });

  test("minor stays minor", () => {
    expect(soundingKey("Am", 2)).toBe("Bm");
    expect(soundingKey("Dm", -2)).toBe("Cm");
  });

  test("spelling follows the written key rather than always sharpening", () => {
    // Bb up two is C; F up two is G, not the same pitch spelled oddly. A flat
    // key that lands on a black note keeps flats.
    expect(soundingKey("Bb", 2)).toBe("C");
    expect(soundingKey("F", 2)).toBe("G");
    expect(soundingKey("F", 3)).toBe("Ab");
    expect(soundingKey("D", 3)).toBe("F");
    expect(soundingKey("D", 1)).toBe("D#");
  });

  test("an unknown key yields no name rather than a wrong one", () => {
    expect(soundingKey("H", 3)).toBe("");
  });
});

describe("the control's range", () => {
  test("clamps to an octave either way", () => {
    expect(clampTranspose(99)).toBe(MAX_TRANSPOSE);
    expect(clampTranspose(-99)).toBe(MIN_TRANSPOSE);
    expect(clampTranspose(5)).toBe(5);
  });

  test("a non-number means no transposition, not NaN semitones", () => {
    // This arrives from a URL parameter, so it can be anything at all.
    expect(clampTranspose(NaN)).toBe(0);
    expect(clampTranspose(Number("frog") as number)).toBe(0);
  });

  test("only whole semitones", () => {
    expect(clampTranspose(2.6)).toBe(3);
  });
});

describe("the label", () => {
  test("says so plainly when nothing is shifted", () => {
    expect(transposeLabel("F", 0)).toBe("Sounds as written.");
  });

  test("names both keys and the direction", () => {
    expect(transposeLabel("F", -5)).toContain("Written in F, sounds in C");
    expect(transposeLabel("F", -5)).toContain("down 5 semitones");
    expect(transposeLabel("C", 1)).toContain("up 1 semitone");
    expect(transposeLabel("C", 1)).not.toContain("1 semitones");
  });
});

/**
 * That abcjs still honours `midiTranspose`.
 *
 * The whole feature is one option handed to the synth, so if an upgrade stopped
 * reading it the failure would be **silent and convincing**: the control would
 * still move, the label would still say "sounds in C", and the audio simply
 * would not shift. Nothing else in the app would notice.
 *
 * Asserted at the FLATTENED stage, which is what CreateSynth actually plays
 * from. The sequencer only inserts a `transpose` element into the stream; the
 * flattener is what adds it to real MIDI numbers - reading the sequence instead
 * shows unchanged pitches and looks like the option being ignored.
 */
describe("abcjs applies midiTranspose to the audio, not the notation", () => {
  const ABC = `X:1
M:4/4
L:1/32
%%score (S B)
V:S clef=treble octave=-1 name="Soprano"
V:B clef=bass octave=-1 name="Bass"
K:F
% End of header, start of tune body:
[V:S] c16 d16 | e16 f16 |]
[V:B] F,16 G,16 | A,16 B,16 |]
`;

  const midiPitches = (semitones: number): number[] => {
    const tune = abcjs.parseOnly(ABC)[0] as any;
    const flattened = tune.setUpAudio({ midiTranspose: semitones });
    const out: number[] = [];
    for (const track of flattened.tracks) {
      for (const ev of track) if (typeof ev.pitch === "number") out.push(ev.pitch);
    }
    return out;
  };

  test("every note moves by exactly the requested amount", () => {
    const plain = midiPitches(0);
    expect(plain.length).toBeGreaterThan(0);
    for (const semitones of [-12, -7, -5, -1, 1, 5, 7, 12]) {
      const shifted = midiPitches(semitones);
      expect(shifted.length).toBe(plain.length);
      expect(shifted).toEqual(plain.map((p) => p + semitones));
    }
  });

  test("the case this was built for: written in F, sounding in C", () => {
    // The soprano's written c is middle C; down a fourth it is the G below.
    expect(midiPitches(0)[0]).toBe(60);
    expect(midiPitches(-5)[0]).toBe(55);
    expect(soundingKey("F", -5)).toBe("C");
  });

  test("zero leaves the pitches exactly as written", () => {
    expect(midiPitches(0)).toEqual(midiPitches(0));
    expect(midiPitches(0)).not.toEqual(midiPitches(1));
  });
});
