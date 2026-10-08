import { expect, test } from "bun:test";
import { EXPECTED_CLARITY, PitchTracker } from "../../src/lib/tuner/pitch-tracker";

// A voice a little rough under a room's sound: clear enough to be a note,
// short of the 0.85 a new note needs (pitch-tracker EXPECTED_CLARITY).
const MI = 329.63, FA = 349.23, RE = 293.66;
const run = (t: PitchTracker, freq: number, clarity: number, frames = 6) => {
  let out: number | null = null;
  for (let i = 0; i < frames; i++) out = t.update([{ frequency: freq, clarity }], -30, 1000 + i * 43);
  return out;
};
const fresh = () => {
  const t = new PitchTracker("medium");
  // A room 10 dB under the voice, as in the run that found this (a voice
  // 25 dB over the room is held to a lower bar already: LOUD_ONSET_CLARITY).
  for (let i = 0; i < 20; i++) t.update([], -40, i * 43);
  return t;
};

test("a rough voice is not heard without an expected note, as before", () => {
  expect(run(fresh(), MI, 0.75)).toBeNull();
});

test("on the expected note, in any octave, it is heard", () => {
  const t = fresh();
  t.setExpected([MI]);
  expect(run(t, MI, 0.75)).toBeCloseTo(MI, 0);
  const low = fresh();
  low.setExpected([MI * 2]);
  expect(run(low, MI, 0.75)).toBeCloseTo(MI, 0);
});

test("a wrong note is held to the usual bar: an expectation does not make it heard", () => {
  const t = fresh();
  t.setExpected([MI]);
  expect(run(t, FA, 0.75)).toBeNull();
  expect(run(fresh(), RE, 0.75)).toBeNull();
  // A clear wrong note is heard as itself.
  const c = fresh();
  c.setExpected([MI]);
  expect(run(c, RE, 0.95)).toBeCloseTo(RE, 0);
});

test("below the expected bar nothing is heard, and clearing the expectation restores the old rule", () => {
  const t = fresh();
  t.setExpected([MI]);
  expect(run(t, MI, EXPECTED_CLARITY - 0.05)).toBeNull();
  t.setExpected(null);
  expect(run(fresh(), MI, 0.75)).toBeNull();
});

test("the expected note wins over a clearer-looking candidate only when that one is not clear enough to stand", () => {
  const t = fresh();
  t.setExpected([MI]);
  let out: number | null = null;
  for (let i = 0; i < 6; i++) out = t.update([{ frequency: RE, clarity: 0.8 }, { frequency: MI, clarity: 0.72 }], -30, 1000 + i * 43);
  expect(out).toBeCloseTo(MI, 0);
});
