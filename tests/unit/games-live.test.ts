import { describe, expect, test } from "bun:test";
import { checkAnswer, checkGame, publicGame, rhythmTimes, type LiveGame, type RhythmRound } from "../../src/lib/games/live-game";
import { countInLag, LAG_MAX_MS, roomLag } from "../../src/lib/games/game-lag";
import { addRound, scoreRhythm, scoreTune, shareRight, TUNE_SPEED_BONUS } from "../../src/lib/games/game-score";
import { playerName, playerTag } from "../../src/lib/games/game-names";
import { RHYTHM_LEVELS, roundParams } from "../../src/lib/games/rhythm-levels";
import type { GradeNote } from "../../src/lib/grade";

// 4/4 at 120: a beat is 500 ms, a quarter 8 units (32nds).
const round: RhythmRound = { bpm: 120, meter: "4/4", beatsPerBar: 4, bars: 1, at: 1_000_000 };
const t = rhythmTimes(round);
const note = (startUnits: number, lengthUnits: number): GradeNote => ({ midi: 71, beats: lengthUnits / 8, cursor: 0, startUnits, lengthUnits });
// ta, ti-ti, ta, ta
const schedule = { notes: [note(0, 8), note(8, 4), note(12, 4), note(16, 8), note(24, 8)], rests: [] };
const onsets = schedule.notes.map((n) => t.musicAt + n.startUnits * (t.beatMs / 8));
const play = (lag: number, o: { countIn?: boolean; nudge?: [number, number] } = {}) => [
  ...(o.countIn === false ? [] : t.tapClicks.map((c) => c + lag)),
  ...onsets.map((x, i) => x + lag + (o.nudge?.[0] === i ? o.nudge[1] : 0)),
];

describe("the round's times", () => {
  test("the count-in is the site's own, a bar of 4/4 (1, 2, Ready, Go), every beat tapped with", () => {
    expect(t.beatMs).toBe(500);
    expect(t.musicAt).toBe(round.at + 2000);
    expect(t.tapClicks).toEqual([round.at, round.at + 500, round.at + 1000, round.at + 1500]);
    expect(t.endAt).toBe(t.musicAt + 2000);
  });
  test("2/4 counts in over two bars, as the practice pages do", () => {
    const two = rhythmTimes({ ...round, meter: "2/4", beatsPerBar: 2 });
    expect(two.countBeats).toBe(4);
    expect(two.musicAt).toBe(round.at + 2000);
  });
});

describe("lag", () => {
  test("the count-in's taps give the student's own lag", () => {
    const { lag, used } = countInLag(play(180), t.tapClicks, t.beatMs);
    expect(lag).toBe(180);
    expect(used.size).toBe(4);
  });
  test("the bar's last click never takes the first note's tap", () => {
    // Only the first note tapped, and late: no count-in lag from it.
    expect(countInLag([t.musicAt + 200], t.tapClicks, t.beatMs).lag).toBeNull();
  });
  test("too few taps, no lag; taps further off than any speaker's delay are not the clicks'", () => {
    expect(countInLag([t.tapClicks[0] + 50], t.tapClicks, t.beatMs).lag).toBeNull();
    expect(countInLag(t.tapClicks.map((c) => c + LAG_MAX_MS - 10), t.tapClicks, t.beatMs).lag).toBe(LAG_MAX_MS - 10);
    expect(countInLag(t.tapClicks.map((c) => c + LAG_MAX_MS + 25), t.tapClicks, t.beatMs).lag).toBeNull();
  });
  test("the room's lag is the middle student's", () => {
    expect(roomLag([100, null, 140, 300])).toBe(140);
    expect(roomLag([null, null])).toBeNull();
  });
});

describe("a rhythm round's score", () => {
  for (const lag of [0, 120, 300])
    test(`tapped exactly, ${lag} ms behind the screen: full marks`, () => {
      const s = scoreRhythm({ round, schedule, beatUnits: 8, taps: play(lag), strictness: "standard" });
      expect(s.lagFrom).toBe("count-in");
      expect(s.lag).toBe(lag);
      expect(s.points).toBe(100);
    });
  test("a note a sixteenth late loses its beat", () => {
    const s = scoreRhythm({ round, schedule, beatUnits: 8, taps: play(120, { nudge: [3, 125] }), strictness: "standard" });
    expect(s.points).toBeLessThan(100);
    expect(s.result.beatsRight).toBe(3);
  });
  test("no count-in tapped: the room's lag is used", () => {
    const s = scoreRhythm({ round, schedule, beatUnits: 8, taps: play(200, { countIn: false }), strictness: "standard", roomLagMs: 200 });
    expect(s.lagFrom).toBe("room");
    expect(s.points).toBe(100);
  });
  test("nothing tapped scores nothing", () => {
    expect(scoreRhythm({ round, schedule, beatUnits: 8, taps: [], strictness: "standard" }).points).toBe(0);
  });
});

describe("a tune's score", () => {
  const tune = [0, 1, 2, 1, 0];
  test("each note after the first", () => {
    const s = scoreTune([0, 1, 2, 2, 0], tune, 10_000, 20_000);
    expect(s.right).toBe(3);
    expect(s.total).toBe(4);
    expect(s.points).toBe(75);
    expect(s.marks).toEqual([true, true, true, false, true]);
  });
  test("all right and quick earns the speed bonus", () => {
    expect(scoreTune(tune, tune, 0, 20_000).points).toBe(100 + TUNE_SPEED_BONUS);
    expect(scoreTune(tune, tune, 20_000, 20_000).points).toBe(100);
  });
  test("the room's share right, note by note", () => {
    expect(shareRight([[0, 1, 2, 1, 0], [0, 2, 2, 1, 0]], tune)).toEqual([1, 0.5, 1, 1, 1]);
  });
});

describe("the board", () => {
  test("totals add up, best first", () => {
    const b1 = addRound([], [{ tag: "a", name: "Mint Fox", points: 80 }, { tag: "b", name: "Sky Owl", points: 100 }]);
    const b2 = addRound(b1, [{ tag: "a", name: "Mint Fox", points: 100 }]);
    expect(b2.map((r) => [r.name, r.points, r.last])).toEqual([["Mint Fox", 180, 100], ["Sky Owl", 100, 0]]);
  });
});

describe("what the room holds", () => {
  const base: LiveGame = { kind: "tune", round: "r-abc1", number: 1, phase: "answering", tune: { steps: [0, 1, 2], length: 5, first: 0, answerBy: 5, tune: [0, 1, 2, 1, 0] } };
  test("a tune is never sent before the results", () => {
    for (const phase of ["lobby", "playing", "answering"] as const) {
      const c = checkGame({ ...base, phase });
      expect(c.ok && c.value.tune?.tune).toBeFalsy();
      expect(publicGame({ ...base, phase }).tune?.tune).toBeUndefined();
    }
    const done = checkGame({ ...base, phase: "results" });
    expect(done.ok && done.value.tune?.tune).toEqual([0, 1, 2, 1, 0]);
  });
  test("nonsense is refused", () => {
    expect(checkGame({ kind: "chess" }).ok).toBe(false);
    expect(checkGame({ ...base, round: "<script>" }).ok).toBe(false);
    expect(checkGame({ kind: "rhythm", round: "r-abc1", phase: "playing", rhythm: { bpm: 5000 } }).ok).toBe(false);
  });
  test("answers", () => {
    expect(checkAnswer("rhythm", { taps: [1.4, 2] })).toEqual({ ok: true, value: { taps: [1, 2] } });
    expect(checkAnswer("rhythm", { taps: Array(500).fill(1) }).ok).toBe(false);
    expect(checkAnswer("tune", { notes: [0, 1, 99], ms: 10 }).ok).toBe(false);
    expect(checkAnswer("tune", { notes: [0, 1, 2], ms: 1200 }).ok).toBe(true);
  });
});

describe("names and levels", () => {
  test("a device keeps its made-up name and its tag; the tag never shows the key", () => {
    expect(playerName("abcdefghijkl")).toBe(playerName("abcdefghijkl"));
    expect(playerName("abcdefghijkl")).toMatch(/^\w+ \w+$/);
    expect(playerTag("abcdefghijkl")).toBe(playerTag("abcdefghijkl"));
    expect(playerTag("abcdefghijkl")).not.toContain("abcdef");
  });
  test("the levels are abcStepByStep's rhythm steps, each one writable", () => {
    expect(RHYTHM_LEVELS.length).toBeGreaterThanOrEqual(10);
    expect(RHYTHM_LEVELS[0].rhythms).toEqual(["quarter", "eighthEighth"]);
    const p = roundParams(RHYTHM_LEVELS[0], { bars: 2, bpm: 90 });
    expect(p.params.rhythms.length).toBe(2);
    expect(p.beatsPerBar).toBe(4);
  });
});

describe("typed names", () => {
  const { nameProblem } = require("../../src/lib/games/game-names");
  test("real names pass, however they are spelled", () => {
    for (const n of ["Bob", "Cassidy", "Nigel", "Essex", "Dickens", "Analise", "Hellen", "Titus", "Shiitake", "Scunthorpe", "Grape", "Cumberbatch", "José", "Zoë", "O'Neil", "Anne-Marie", "Kai 2", "Mr. Bean", "Sussex"])
      expect({ n, problem: nameProblem(n) }).toEqual({ n, problem: null });
  });
  test("rude ones are caught through the usual disguises", () => {
    for (const n of ["fuck", "Fuuuck", "f.u.c.k", "sh1t", "a$$", "Big Booty", "boobs", "Dick", "Pu55y", "n1gga", "ass hat", "SEX", "hitler"])
      expect({ n, caught: !!nameProblem(n) }).toEqual({ n, caught: true });
  });
  test("too short, too long, or symbols", () => {
    expect(nameProblem("A")).toBeTruthy();
    expect(nameProblem("A very long name indeed")).toBeTruthy();
    expect(nameProblem("<script>")).toBeTruthy();
  });
});

describe("teams and removed names", () => {
  const { dealTeams, joinTeam, teamStandings } = require("../../src/lib/games/game-score");
  const { afterRound, blockName, teamsForStart } = require("../../src/lib/games/host-game");
  test("players are dealt evenly; a latecomer joins the smallest team", () => {
    const teams = dealTeams(["A", "B", "C", "D", "E"], 2, () => 0.5);
    expect(teams.map((t: any) => t.members.length).sort()).toEqual([2, 3]);
    const { team } = joinTeam(teams, "F");
    expect(team.members).toContain("F");
    expect(teams.find((t: any) => t.id === team.id).members.length).toBe(2);
  });
  test("a team's standing is per player, so a bigger team does not win by size", () => {
    const teams = [{ id: "mint", name: "Mint", members: ["A", "B", "C"] }, { id: "sky", name: "Sky", members: ["D"] }];
    const board = [
      { tag: "a", name: "A", points: 100, last: 0, team: "mint" }, { tag: "b", name: "B", points: 50, last: 0, team: "mint" },
      { tag: "c", name: "C", points: 0, last: 0, team: "mint" }, { tag: "d", name: "D", points: 90, last: 0, team: "sky" },
    ];
    expect(teamStandings(board, teams).map((t: any) => [t.id, t.average])).toEqual([["sky", 90], ["mint", 50]]);
  });
  test("a removed name shows as the device's made-up one, now and after", () => {
    const game: any = { kind: "tune", round: "r-1111", number: 1, phase: "results" };
    let { board } = afterRound(game, [], [{ tag: "x", name: "Rude", fallback: "Mint Otter", points: 100 }]);
    const removed = blockName(game, board, "rude", new Map([["x", "Mint Otter"]]));
    expect(removed.board[0].name).toBe("Mint Otter");
    expect(removed.blocked).toEqual(["rude"]);
    const next = afterRound({ ...game, blocked: removed.blocked }, removed.board, [{ tag: "x", name: "RUDE", fallback: "Mint Otter", points: 50 }]);
    expect(next.board[0]).toMatchObject({ name: "Mint Otter", points: 150 });
  });
  test("teams are dealt once, from players not removed", () => {
    const teams = teamsForStart({ blocked: ["rude"] } as any, ["A", "B", "Rude", "C"], 2);
    expect(teams.flatMap((t: any) => t.members).sort()).toEqual(["A", "B", "C"]);
    expect(teamsForStart(null, ["A"], 0)).toBeUndefined();
  });
  test("a round's scores join players to teams", () => {
    const game: any = { kind: "tune", round: "r-1111", number: 1, phase: "results", teams: [{ id: "mint", name: "Mint", members: ["A"] }, { id: "sky", name: "Sky", members: [] }] };
    const { board, teams } = afterRound(game, [], [{ tag: "a", name: "A", fallback: "x", points: 10 }, { tag: "n", name: "New", fallback: "y", points: 20 }]);
    expect(board.find((r: any) => r.name === "New").team).toBe("sky");
    expect(teams.find((t: any) => t.id === "sky").members).toEqual(["New"]);
  });
});
