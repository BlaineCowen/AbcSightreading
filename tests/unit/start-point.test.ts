import { describe, expect, test } from "bun:test";
import { eventForChar, type TimingEvent } from "../../src/lib/start-point";

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
