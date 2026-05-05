import { describe, expect, test } from "vitest";
import { buildGrid, scoreForCorrectGuess, updateStreak } from "./scoring";

describe("scoreForCorrectGuess", () => {
  test("level 1 → 5", () => expect(scoreForCorrectGuess(1)).toBe(5));
  test("level 2 → 4", () => expect(scoreForCorrectGuess(2)).toBe(4));
  test("level 3 → 3", () => expect(scoreForCorrectGuess(3)).toBe(3));
  test("level 4 → 2", () => expect(scoreForCorrectGuess(4)).toBe(2));
  test("level 5 → 1", () => expect(scoreForCorrectGuess(5)).toBe(1));

  test("invalid levels throw", () => {
    expect(() => scoreForCorrectGuess(0)).toThrow();
    expect(() => scoreForCorrectGuess(6)).toThrow();
    expect(() => scoreForCorrectGuess(2.5)).toThrow();
  });
});

describe("buildGrid", () => {
  test("won at L1 leaves remaining cells unseen", () => {
    expect(buildGrid(["correct"])).toEqual([
      "correct",
      "unseen",
      "unseen",
      "unseen",
      "unseen",
    ]);
  });

  test("two wrong then correct", () => {
    expect(buildGrid(["wrong", "wrong", "correct"])).toEqual([
      "wrong",
      "wrong",
      "correct",
      "unseen",
      "unseen",
    ]);
  });

  test("revealed mixed with wrong", () => {
    expect(buildGrid(["revealed", "wrong", "revealed", "correct"])).toEqual([
      "revealed",
      "wrong",
      "revealed",
      "correct",
      "unseen",
    ]);
  });

  test("five wrong = full red row", () => {
    expect(buildGrid(["wrong", "wrong", "wrong", "wrong", "wrong"])).toEqual([
      "wrong",
      "wrong",
      "wrong",
      "wrong",
      "wrong",
    ]);
  });

  test("truncates anything past 5 outcomes", () => {
    expect(
      buildGrid([
        "wrong",
        "wrong",
        "wrong",
        "wrong",
        "wrong",
        "correct",
      ]),
    ).toHaveLength(5);
  });
});

describe("updateStreak", () => {
  test("loss zeroes streak, longest unchanged", () => {
    const r = updateStreak({
      prevStreak: 3,
      prevLongest: 7,
      prevLastPlayedDate: "2026-05-03",
      todayDate: "2026-05-04",
      yesterdayDate: "2026-05-03",
      won: false,
    });
    expect(r).toEqual({ currentStreak: 0, longestStreak: 7 });
  });

  test("win continuing yesterday's streak", () => {
    const r = updateStreak({
      prevStreak: 3,
      prevLongest: 5,
      prevLastPlayedDate: "2026-05-03",
      todayDate: "2026-05-04",
      yesterdayDate: "2026-05-03",
      won: true,
    });
    expect(r).toEqual({ currentStreak: 4, longestStreak: 5 });
  });

  test("win past a skipped day → streak resets to 1", () => {
    const r = updateStreak({
      prevStreak: 3,
      prevLongest: 5,
      prevLastPlayedDate: "2026-05-01",
      todayDate: "2026-05-04",
      yesterdayDate: "2026-05-03",
      won: true,
    });
    expect(r).toEqual({ currentStreak: 1, longestStreak: 5 });
  });

  test("first-ever play, win → streak = 1", () => {
    const r = updateStreak({
      prevStreak: 0,
      prevLongest: 0,
      prevLastPlayedDate: undefined,
      todayDate: "2026-05-04",
      yesterdayDate: "2026-05-03",
      won: true,
    });
    expect(r).toEqual({ currentStreak: 1, longestStreak: 1 });
  });

  test("win extending streak past previous longest", () => {
    const r = updateStreak({
      prevStreak: 5,
      prevLongest: 5,
      prevLastPlayedDate: "2026-05-03",
      todayDate: "2026-05-04",
      yesterdayDate: "2026-05-03",
      won: true,
    });
    expect(r).toEqual({ currentStreak: 6, longestStreak: 6 });
  });
});
