import { describe, expect, test } from "bun:test";
import {
  DAILY_SLOWDOWN, currentStreak, exerciseTraits, gradePoints, levelFrom, nextStreak, recommendedGoal, repeatFactor, scaled, tierOf, timePoints, weekOf,
} from "../../src/lib/points";
import { BADGE_TOTAL, earnedLevels, type BadgeStats } from "../../src/lib/badges";

describe("diminishing returns", () => {
  test("an exercise's points follow how hard it is for the student", () => {
    expect(tierOf({ kind: "step", step: 14 }, 14)).toBe("level");
    expect(tierOf({ kind: "step", step: 20 }, 14)).toBe("level");
    expect(tierOf({ kind: "step", step: 11 }, 14)).toBe("review");
    expect(tierOf({ kind: "step", step: 6 }, 14)).toBe("easy");
    expect(tierOf({ kind: "own", step: null }, 14)).toBe("own");
    expect(tierOf({ kind: "assigned", step: null }, 14)).toBe("assigned");
    expect(tierOf({ kind: "preset", step: null }, 14)).toBe("level");
  });
  test("the same choice: full 3 times, then half, a quarter, nothing after 10", () => {
    expect([1, 2, 3, 4, 6, 7, 10, 11].map(repeatFactor)).toEqual([1, 1, 1, 0.5, 0.5, 0.25, 0.25, 0]);
  });
  test("past the day's slowdown everything counts half; never zero while anything is left", () => {
    expect(scaled(10, 1, 0)).toBe(10);
    expect(scaled(10, 1, DAILY_SLOWDOWN)).toBe(5);
    expect(scaled(2, 0.25, 0)).toBe(1);
    expect(scaled(10, 0, 0)).toBe(0);
  });
  test("grade bonuses only at the student's level", () => {
    expect(gradePoints(86, "level")).toBe(20);
    expect(gradePoints(100, "assigned")).toBe(35);
    expect(gradePoints(100, "easy")).toBe(10);
    expect(gradePoints(50, "level")).toBe(10);
  });
  test("practice time: a point a minute, 30 a day", () => {
    expect(timePoints(0, 59)).toBe(0);
    expect(timePoints(50, 70)).toBe(1);
    expect(timePoints(1790, 2000)).toBe(1);
    expect(timePoints(1800, 2400)).toBe(0);
  });
  test("the level is the highest step practised 3 times", () => {
    expect(levelFrom({ "4": 9, "12": 3, "30": 1 })).toBe(12);
    expect(levelFrom({})).toBe(0);
  });
  test("the recommended goal is 100 a student, at least 300", () => {
    expect(recommendedGoal(27)).toBe(2700);
    expect(recommendedGoal(1)).toBe(300);
  });
});

describe("school-day streaks", () => {
  const s = (streak: number, streakDay: string | null) => ({ streak, streakDay });
  test("weeks start on Monday", () => {
    expect(weekOf("2026-11-16")).toBe("2026-11-16");
    expect(weekOf("2026-11-22")).toBe("2026-11-16");
    expect(weekOf("2026-11-23")).toBe("2026-11-23");
  });
  test("Friday then Monday keeps going; the weekend adds nothing", () => {
    expect(nextStreak(s(5, "2026-11-13"), "2026-11-16")).toEqual(s(6, "2026-11-16"));
    expect(nextStreak(s(5, "2026-11-13"), "2026-11-14")).toEqual(s(5, "2026-11-13"));
  });
  test("a missed school day starts over", () => {
    expect(nextStreak(s(5, "2026-11-12"), "2026-11-16")).toEqual(s(1, "2026-11-16"));
  });
  test("a class break does not count against it", () => {
    expect(nextStreak(s(8, "2026-11-20"), "2026-11-30", "2026-11-27")).toEqual(s(9, "2026-11-30"));
    expect(currentStreak(s(8, "2026-11-20"), "2026-11-30", "2026-11-27")).toBe(8);
    expect(currentStreak(s(8, "2026-11-20"), "2026-11-30")).toBe(0);
  });
  test("the same day twice counts once", () => {
    expect(nextStreak(s(3, "2026-11-16"), "2026-11-16")).toEqual(s(3, "2026-11-16"));
  });
});

describe("exercise traits and badges", () => {
  test("key, minor, compound meter and bass clef from the ABC", () => {
    expect(exerciseTraits("X:1\nM:6/8\nL:1/32\nK:F#m clef=bass\nabc")).toEqual({ keySig: "F#m", minor: true, compound: true, bass: true });
    expect(exerciseTraits("X:1\nM:4/4\nK:Bb\nabc")).toEqual({ keySig: "Bb", minor: false, compound: false, bass: false });
  });
  const zero: BadgeStats = { seconds: 0, exercises: 0, graded: 0, tries90: 0, tries100: 0, onTime: 0, weeklyTop3: 0, ensembles: 0, bestStreak: 0, level: 0, keys: [], flags: [] };
  test("nothing earned at the start", () => {
    expect(earnedLevels(zero)).toEqual([]);
  });
  test("levels climb with the counts, one row a level", () => {
    const got = earnedLevels({ ...zero, bestStreak: 8, exercises: 12, flags: ["minor"] });
    expect(got).toContainEqual(["streak", 1]);
    expect(got).toContainEqual(["streak", 2]);
    expect(got).not.toContainEqual(["streak", 3]);
    expect(got).toContainEqual(["exercises", 1]);
    expect(got).toContainEqual(["first-note", 1]);
    expect(got).toContainEqual(["minor", 1]);
  });
  test("there are around 55 to collect", () => {
    expect(BADGE_TOTAL).toBeGreaterThan(50);
    expect(BADGE_TOTAL).toBeLessThan(65);
  });
});
