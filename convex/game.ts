import { v } from "convex/values";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { fuzzyMatchTitle } from "./lib/fuzzyMatch";
import {
  MAX_HINTS,
  scoreForCorrectGuess,
  updateStreak,
  type GridCell,
} from "./lib/scoring";
import { todayUtcDate, yesterdayUtc } from "./lib/dateUtil";
import type { Doc } from "./_generated/dataModel";
import { internal } from "./_generated/api";

// Auth note: Discord OAuth code-exchange is intentionally deferred (see
// project_design_decisions). The client passes the verified Discord user.id
// from the embedded SDK as a function arg until that lands.

async function getPuzzleForDate(
  ctx: QueryCtx | MutationCtx,
  date: string,
): Promise<Doc<"dailyPuzzles"> | null> {
  return ctx.db
    .query("dailyPuzzles")
    .withIndex("by_date", (q) => q.eq("date", date))
    .unique();
}

async function getAttempt(
  ctx: QueryCtx | MutationCtx,
  userId: string,
  date: string,
): Promise<Doc<"attempts"> | null> {
  return ctx.db
    .query("attempts")
    .withIndex("by_user_date", (q) =>
      q.eq("userId", userId).eq("puzzleDate", date),
    )
    .unique();
}

export const getTodaysPuzzle = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const date = todayUtcDate();
    const puzzle = await getPuzzleForDate(ctx, date);
    if (!puzzle) return null;

    const attempt = await getAttempt(ctx, args.userId, date);
    const hintsRevealed = attempt?.hintsRevealed ?? 1;
    const isDone = !!attempt?.guessed;
    const visibleHints = isDone
      ? puzzle.hints
      : puzzle.hints.filter((h) => h.order <= hintsRevealed);

    return {
      date: puzzle.date,
      releasedAt: puzzle.releasedAt,
      hints: visibleHints,
      totalHints: puzzle.hints.length,
      movieTitle: isDone ? puzzle.movieTitle : null,
    };
  },
});

export const getTodaysAttempt = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    return getAttempt(ctx, args.userId, todayUtcDate());
  },
});

// Idempotent username refresh. Called from the activity on load so player
// docs created before username-threading existed (or whose handles changed)
// get a fresh value. No-op when the player has never completed a game.
export const touchUsername = mutation({
  args: {
    userId: v.string(),
    username: v.string(),
  },
  handler: async (ctx, args) => {
    const trimmed = args.username.trim();
    if (!trimmed) return { status: "skipped-empty" as const };
    const player = await ctx.db
      .query("players")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();
    if (!player) return { status: "no-player" as const };
    if (player.username === trimmed) return { status: "unchanged" as const };
    await ctx.db.patch(player._id, { username: trimmed });
    return { status: "updated" as const };
  },
});

async function ensureAttempt(
  ctx: MutationCtx,
  userId: string,
  guildId: string | undefined,
  date: string,
): Promise<Doc<"attempts">> {
  const existing = await getAttempt(ctx, userId, date);
  if (existing) return existing;
  const id = await ctx.db.insert("attempts", {
    userId,
    guildId,
    puzzleDate: date,
    hintsRevealed: 1,
    guessed: false,
    correct: false,
    score: 0,
    grid: ["unseen", "unseen", "unseen", "unseen", "unseen"],
  });
  const created = await ctx.db.get(id);
  if (!created) throw new Error("attempt insert failed");
  return created;
}

async function recordCompletion(
  ctx: MutationCtx,
  userId: string,
  username: string | undefined,
  date: string,
  score: number,
  won: boolean,
): Promise<void> {
  const existing = await ctx.db
    .query("players")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
  const yesterday = yesterdayUtc(date);
  const prev = existing
    ? {
        prevStreak: existing.currentStreak,
        prevLongest: existing.longestStreak,
        prevLastPlayedDate: existing.lastPlayedDate,
      }
    : {
        prevStreak: 0,
        prevLongest: 0,
        prevLastPlayedDate: undefined as string | undefined,
      };
  const { currentStreak, longestStreak } = updateStreak({
    ...prev,
    todayDate: date,
    yesterdayDate: yesterday,
    won,
  });
  if (existing) {
    await ctx.db.patch(existing._id, {
      totalScore: existing.totalScore + score,
      currentStreak,
      longestStreak,
      gamesPlayed: existing.gamesPlayed + 1,
      lastPlayedDate: date,
      ...(username ? { username } : {}),
    });
  } else {
    await ctx.db.insert("players", {
      userId,
      username,
      totalScore: score,
      currentStreak,
      longestStreak,
      gamesPlayed: 1,
      lastPlayedDate: date,
    });
  }
}

export const submitGuess = mutation({
  args: {
    userId: v.string(),
    guildId: v.optional(v.string()),
    username: v.optional(v.string()),
    guess: v.string(),
  },
  handler: async (ctx, args) => {
    const date = todayUtcDate();
    const puzzle = await getPuzzleForDate(ctx, date);
    if (!puzzle) {
      throw new Error("No puzzle exists for today yet. Try again shortly.");
    }

    const attempt = await ensureAttempt(ctx, args.userId, args.guildId, date);
    if (attempt.guessed) {
      return { status: "already-played" as const, attempt };
    }

    const level = attempt.hintsRevealed;
    const matched = fuzzyMatchTitle(
      args.guess,
      puzzle.movieTitle,
      puzzle.movieAliases,
    );

    const newGrid: GridCell[] = [...attempt.grid];

    if (matched) {
      newGrid[level - 1] = "correct";
      const score = scoreForCorrectGuess(level);
      await ctx.db.patch(attempt._id, {
        guessed: true,
        correct: true,
        score,
        grid: newGrid,
        completedAt: Date.now(),
      });
      await recordCompletion(ctx, args.userId, args.username, date, score, true);
      await ctx.scheduler.runAfter(0, internal.notifications.postPlayResult, {
        date,
        userId: args.userId,
        username: args.username,
        correct: true,
        score,
        hintsRevealed: level,
        grid: newGrid,
      });
      const updated = await ctx.db.get(attempt._id);
      return { status: "correct" as const, score, attempt: updated };
    }

    newGrid[level - 1] = "wrong";
    if (level >= MAX_HINTS) {
      await ctx.db.patch(attempt._id, {
        guessed: true,
        correct: false,
        score: 0,
        grid: newGrid,
        completedAt: Date.now(),
      });
      await recordCompletion(ctx, args.userId, args.username, date, 0, false);
      await ctx.scheduler.runAfter(0, internal.notifications.postPlayResult, {
        date,
        userId: args.userId,
        username: args.username,
        correct: false,
        score: 0,
        hintsRevealed: level,
        grid: newGrid,
      });
      const updated = await ctx.db.get(attempt._id);
      return { status: "lost" as const, score: 0, attempt: updated };
    }

    await ctx.db.patch(attempt._id, {
      hintsRevealed: level + 1,
      grid: newGrid,
    });
    const updated = await ctx.db.get(attempt._id);
    return { status: "wrong" as const, attempt: updated };
  },
});

export const revealHint = mutation({
  args: {
    userId: v.string(),
    guildId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const date = todayUtcDate();
    const puzzle = await getPuzzleForDate(ctx, date);
    if (!puzzle) {
      throw new Error("No puzzle exists for today yet.");
    }

    const attempt = await ensureAttempt(ctx, args.userId, args.guildId, date);
    if (attempt.guessed) {
      return { status: "already-played" as const, attempt };
    }

    const level = attempt.hintsRevealed;
    if (level >= MAX_HINTS) {
      throw new Error("No more hints to reveal — guess or fail at level 5.");
    }

    const newGrid: GridCell[] = [...attempt.grid];
    newGrid[level - 1] = "revealed";
    await ctx.db.patch(attempt._id, {
      hintsRevealed: level + 1,
      grid: newGrid,
    });
    const updated = await ctx.db.get(attempt._id);
    return { status: "revealed" as const, attempt: updated };
  },
});
