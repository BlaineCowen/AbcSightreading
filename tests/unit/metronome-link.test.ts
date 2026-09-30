import { describe, expect, test } from "bun:test";
import { clickThisTime } from "../../src/lib/tools/metronome-link";

describe("does this playback click", () => {
  test("with the music on, it clicks", () => {
    expect(clickThisTime({ withMusic: true, wasRunning: false })).toBe(true);
  });
  test("with it off, it is silent", () => {
    expect(clickThisTime({ withMusic: false, wasRunning: false })).toBe(false);
  });
  test("a metronome ticking on its own as Play is pressed carries on with the music", () => {
    expect(clickThisTime({ withMusic: false, wasRunning: true })).toBe(true);
    expect(clickThisTime({ withMusic: true, wasRunning: true })).toBe(true);
  });
  test("a drill pass that says On or Off decides", () => {
    expect(clickThisTime({ withMusic: false, wasRunning: false, passOverride: true })).toBe(true);
    expect(clickThisTime({ withMusic: true, wasRunning: true, passOverride: false })).toBe(false);
    expect(clickThisTime({ withMusic: true, wasRunning: false, passOverride: null })).toBe(true);
  });
});
