import { describe, expect, test } from "bun:test";
import {
  INSTRUMENTS,
  DEFAULT_INSTRUMENT,
  instrumentFor,
  isInstrumentProgram,
  withInstrument,
} from "../../src/lib/instruments";

// abcjs maps a MIDI program to a sample folder name; if our number and its name
// disagree, abcjs fetches a folder that does not exist. It does not raise - it
// skips every note whose sample failed to load, which sounds exactly like the
// audio being broken. So this mapping is worth asserting against abcjs itself.
const instrumentIndexToName = require("abcjs").synth.instrumentIndexToName;

describe("the playback instruments", () => {
  test("every program number matches the sample folder abcjs will fetch", () => {
    for (const instrument of INSTRUMENTS) {
      expect(instrumentIndexToName[instrument.program]).toBe(instrument.samples);
    }
  });

  test("the default is one of the offered instruments", () => {
    expect(INSTRUMENTS.some((i) => i.program === DEFAULT_INSTRUMENT)).toBe(true);
    expect(instrumentFor(DEFAULT_INSTRUMENT).program).toBe(DEFAULT_INSTRUMENT);
  });

  test("an unknown program falls back rather than returning nothing", () => {
    // A stale URL carrying ?sound=127 must not leave playback undefined.
    expect(instrumentFor(127).program).toBe(DEFAULT_INSTRUMENT);
  });

  test("only offered programs are accepted from the URL", () => {
    expect(isInstrumentProgram("52")).toBe(true);
    expect(isInstrumentProgram(52)).toBe(true);
    expect(isInstrumentProgram("127")).toBe(false);
    expect(isInstrumentProgram("choir")).toBe(false);
    expect(isInstrumentProgram(null)).toBe(false);
    expect(isInstrumentProgram(52.5)).toBe(false);
  });
});

describe("swapping the instrument in an assembled tune", () => {
  const abc = ["X:1", "T:t", "M:4/4", "L:1/32", "Q:1/4=72", "%%MIDI program 0", "K:C", "[V:S] c8"].join("\n");

  test("replaces the directive and leaves the music alone", () => {
    const out = withInstrument(abc, 52);
    expect(out).toContain("%%MIDI program 52");
    expect(out).not.toContain("%%MIDI program 0");
    expect(out).toContain("[V:S] c8");
    expect(out.split("\n").length).toBe(abc.split("\n").length);
  });

  test("swapping twice lands on the last instrument, not both", () => {
    expect(withInstrument(withInstrument(abc, 52), 19)).toContain("%%MIDI program 19");
    expect(withInstrument(withInstrument(abc, 52), 19)).not.toContain("program 52");
  });

  test("a tune with no directive is left untouched rather than corrupted", () => {
    const bare = "X:1\nK:C\n[V:S] c8";
    expect(withInstrument(bare, 52)).toBe(bare);
  });
});
