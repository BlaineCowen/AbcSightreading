import { describe, expect, test } from "bun:test";
import { barStartOf, eventForChar, type TimingEvent } from "../../src/lib/start-point";

// Where Play starts on the practice pages: a tapped note is found again by its
// place in the ABC, in whatever abcjs timed last (a redraw, a new tempo).
describe("eventForChar", () => {
  const timings: TimingEvent[] = [
    { type: "bar", milliseconds: 0 },
    { type: "event", milliseconds: 2000, startCharArray: [40, 90] },
    { type: "event", milliseconds: 2500, startCharArray: [44] },
    // The same note again on a repeat: the first time it is heard counts.
    { type: "event", milliseconds: 9000, startCharArray: [44] },
  ];

  test("finds the event a note starts, any voice", () => {
    expect(eventForChar(timings, 90)?.milliseconds).toBe(2000);
    expect(eventForChar(timings, 40)?.milliseconds).toBe(2000);
  });

  test("takes the first time a repeated note is heard", () => {
    expect(eventForChar(timings, 44)?.milliseconds).toBe(2500);
  });

  test("nothing for an unknown note, no note, or no timings", () => {
    expect(eventForChar(timings, 7)).toBeNull();
    expect(eventForChar(timings, null)).toBeNull();
    expect(eventForChar(null, 40)).toBeNull();
  });
});

// Play from a tapped note counts in to its bar's downbeat, the notes before
// it silent (Blaine, 27 October 2026).
describe("barStartOf", () => {
  const timings: TimingEvent[] = [
    { type: "event", milliseconds: 0, measureStart: true },
    { type: "event", milliseconds: 2000, measureStart: true },
    { type: "event", milliseconds: 2500 },
    { type: "event", milliseconds: 3000 },
    { type: "event", milliseconds: 4000, measureStart: true },
  ];

  test("a note after the downbeat starts from its bar's first event", () => {
    expect(barStartOf(timings, timings[2])).toBe(2000);
    expect(barStartOf(timings, timings[3])).toBe(2000);
  });

  test("a note on the downbeat is its own bar start", () => {
    expect(barStartOf(timings, timings[4])).toBe(4000);
  });

  test("nothing marked: the note's own time", () => {
    const e: TimingEvent = { type: "event", milliseconds: 1500 };
    expect(barStartOf([e], e)).toBe(1500);
  });
});
