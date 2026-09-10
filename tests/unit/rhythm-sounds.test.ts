import { describe, expect, test } from "bun:test";
import {
  RHYTHM_SOUNDS,
  DEFAULT_RHYTHM_SOUND,
  isRhythmSoundId,
  rhythmSoundFor,
  withRhythmSound,
  volumeMultiplierFor,
} from "../../src/lib/rhythm-sounds";

const abcjs = require("abcjs");
const flatten = require("abcjs/src/synth/abc_midi_flattener");

/**
 * The rhythm staff played claves and nothing else, and claves is a click - a
 * half note sounded exactly like an eighth. These check that a sustained sound
 * really does carry the written length, and that switching cannot corrupt the
 * header, which is where the whole staff is defined.
 */

const RHYTHM_ABC = [
  "X:1 ",
  "M:4/4",
  "L:1/32",
  "%%percmap B claves normal",
  "%%MIDI beat 127 127 127 1",
  "V:U",
  "K:C clef=perc stafflines=1 ",
  "%            End of header, start of tune body: ",
  "B8 B16 B8 |",
].join("\n");

/** What abcjs will actually play: per-note instrument and duration. */
function played(abc: string) {
  const tune = abcjs.parseOnly(abc)[0];
  const f = flatten(abcjs.synth.sequence(tune, {}), {});
  const notes = f.tracks.flat().filter((e: any) => e.cmd === "note");
  const staff = tune.lines?.[0]?.staff?.[0];
  return {
    instruments: [...new Set(notes.map((n: any) => n.instrument))],
    durations: notes.map((n: any) => n.duration),
    clef: staff?.clef?.type,
    stafflines: staff?.clef?.stafflines,
  };
}

describe("the sound list", () => {
  test("every program is the instrument abcjs thinks it is", () => {
    // A program pointing at a folder that does not exist is silent, not an
    // error - the same trap the choral instrument list had to be checked for.
    const names = abcjs.synth.instrumentIndexToName;
    for (const sound of RHYTHM_SOUNDS) {
      if (sound.kind !== "sustained") continue;
      expect(typeof names[sound.program]).toBe("string");
    }
  });

  test("every drum name is one abcjs accepts", () => {
    // %%percmap is rejected outright for a name off its list, which would leave
    // the staff without its mapping.
    for (const sound of RHYTHM_SOUNDS) {
      if (sound.kind !== "click") continue;
      const abc = withRhythmSound(RHYTHM_ABC, sound);
      const tune = abcjs.parseOnly(abc)[0];
      expect(tune.formatting?.percmap ?? tune.lines?.length).toBeTruthy();
      expect(played(abc).durations.length).toBe(3);
    }
  });

  test("an unknown id falls back rather than returning nothing", () => {
    expect(rhythmSoundFor("nonsense").id).toBe(DEFAULT_RHYTHM_SOUND);
    expect(isRhythmSoundId("piano")).toBe(true);
    expect(isRhythmSoundId("nonsense")).toBe(false);
  });

  test("a click is louder than a sustained sound", () => {
    // Claves peaks at 0.16 against a piano note's 0.3-0.5, so the same gain
    // would clip the piano.
    expect(volumeMultiplierFor(rhythmSoundFor("claves"))).toBeGreaterThan(
      volumeMultiplierFor(rhythmSoundFor("piano"))
    );
  });
});

describe("switching the sound", () => {
  test("a sustained sound plays a pitched instrument, not the drum kit", () => {
    const out = played(withRhythmSound(RHYTHM_ABC, rhythmSoundFor("piano")));
    expect(out.instruments).toEqual([0]);
    expect(out.clef).toBe("none"); // a rhythm staff shows no clef
  });

  test("a click keeps the percussion staff", () => {
    const out = played(withRhythmSound(RHYTHM_ABC, rhythmSoundFor("woodblock")));
    expect(out.instruments).toEqual([128]); // the drum kit
    expect(out.clef).toBe("perc");
  });

  test("the staff stays a single line either way", () => {
    // Otherwise a rhythm drill turns into a melody staff.
    for (const id of ["claves", "piano", "organ"]) {
      expect(played(withRhythmSound(RHYTHM_ABC, rhythmSoundFor(id))).stafflines).toBe(1);
    }
  });

  test("written lengths survive the switch", () => {
    for (const id of ["claves", "woodblock", "piano", "marimba", "organ", "voice"]) {
      expect(played(withRhythmSound(RHYTHM_ABC, rhythmSoundFor(id))).durations).toEqual([
        0.25, 0.5, 0.25,
      ]);
    }
  });

  test("no blank line is left behind", () => {
    // A blank line ENDS the tune in ABC. Removing a directive without its
    // newline truncated the exercise to nothing and the staff came back empty
    // with no error at all.
    for (const id of ["claves", "piano"]) {
      const out = withRhythmSound(RHYTHM_ABC, rhythmSoundFor(id));
      expect(out).not.toMatch(/\n\s*\n/);
      expect(played(out).durations.length).toBe(3);
    }
  });

  test("switching back and forth is stable, and applying twice changes nothing", () => {
    const piano = withRhythmSound(RHYTHM_ABC, rhythmSoundFor("piano"));
    const backToClaves = withRhythmSound(piano, rhythmSoundFor("claves"));
    expect(withRhythmSound(backToClaves, rhythmSoundFor("piano"))).toBe(piano);
    expect(withRhythmSound(piano, rhythmSoundFor("piano"))).toBe(piano);
  });

  test("the music itself is never touched", () => {
    const body = (abc: string) => abc.split(/^%.*start of tune body:.*$/m)[1];
    for (const id of ["piano", "woodblock", "organ"]) {
      expect(body(withRhythmSound(RHYTHM_ABC, rhythmSoundFor(id)))).toBe(body(RHYTHM_ABC));
    }
  });
});
