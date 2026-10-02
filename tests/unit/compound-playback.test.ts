import { describe, expect, test } from "bun:test";
import abcjs from "abcjs";
import { beatsOf } from "../../src/lib/meter";
import { metronomeClickFor, newMetronomeBeatState } from "../../src/lib/metronome-beats";

describe("compound playback", () => {
  test("abcjs counts qpm in the meter's own beat, so the page passes its BPM unchanged", () => {
    // Dotted quarter = 60: a 6/8 bar is two seconds. qpm = bpm * 1.5 would make it 1.33 s.
    for (const [meter, ms] of [["6/8", 2000], ["9/8", 3000], ["12/8", 4000], ["4/4", 4000], ["3/4", 3000]] as const) {
      const [tune] = abcjs.parseOnly(`X:1\nM:${meter}\nL:1/32\nK:C\nB12|\n`);
      expect([meter, tune.millisecondsPerMeasure(60)]).toEqual([meter, ms]);
    }
  });

  test("the click sounds once a dotted-quarter beat, with beat one of each bar accented", () => {
    for (const [meter, beats] of [["6/8", 2], ["9/8", 3], ["12/8", 4]] as const) {
      const state = newMetronomeBeatState();
      const clicks: boolean[] = [];
      // abcjs calls back 16 times a beat; the click fires once on each whole beat. Two bars.
      for (let tick = 0; tick < 2 * beats * 16; tick++) {
        const c = metronomeClickFor(state, tick / 16, beatsOf(meter));
        if (c.click) clicks.push(c.isDownbeat);
      }
      const oneBar = [true, ...Array(beats - 1).fill(false)];
      expect([meter, clicks]).toEqual([meter, [...oneBar, ...oneBar]]);
    }
  });
});
