import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

const hintType = v.union(
  v.literal("emoji"),
  v.literal("plot_summary"),
  v.literal("famous_quote"),
  v.literal("cast_clue"),
  v.literal("crew_clue"),
  v.literal("fake_review"),
  v.literal("object_list"),
  v.literal("tagline"),
  v.literal("first_or_last_line"),
  v.literal("setting"),
  v.literal("soundtrack"),
  v.literal("trivia"),
);

const hint = v.object({
  type: hintType,
  content: v.string(),
  order: v.number(),
});

export const puzzleForDate = internalQuery({
  args: { date: v.string() },
  handler: async (ctx, args) => {
    return ctx.db
      .query("dailyPuzzles")
      .withIndex("by_date", (q) => q.eq("date", args.date))
      .unique();
  },
});

// Up to `limit` unused pool entries; daily generator picks one at random.
export const unusedCandidates = internalQuery({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    return ctx.db
      .query("moviePool")
      .withIndex("by_used", (q) => q.eq("used", false))
      .take(args.limit ?? 200);
  },
});

// Race-safe commit: in a single transaction, verify no puzzle exists for this
// date and the picked pool entry is still unused, then mark + insert.
// The caller retries with a fresh pick on "candidate-taken".
export const commitPuzzle = internalMutation({
  args: {
    date: v.string(),
    moviePoolId: v.id("moviePool"),
    hints: v.array(hint),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("dailyPuzzles")
      .withIndex("by_date", (q) => q.eq("date", args.date))
      .unique();
    if (existing) {
      return { status: "already-exists" as const, puzzleId: existing._id };
    }

    const pool = await ctx.db.get(args.moviePoolId);
    if (!pool) {
      throw new Error(`moviePool row ${args.moviePoolId} not found`);
    }
    if (pool.used) {
      return { status: "candidate-taken" as const };
    }

    await ctx.db.patch(pool._id, { used: true, usedOnDate: args.date });
    const puzzleId = await ctx.db.insert("dailyPuzzles", {
      date: args.date,
      movieTitle: pool.title,
      movieAliases: pool.aliases,
      moviePoolId: pool._id,
      hints: args.hints,
      releasedAt: Date.now(),
    });
    return { status: "inserted" as const, puzzleId };
  },
});

// Marks a puzzle's announcement as posted so cron retries don't double-post.
// Returns false if the puzzle was already announced or doesn't exist.
export const markAnnounced = internalMutation({
  args: { date: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("dailyPuzzles")
      .withIndex("by_date", (q) => q.eq("date", args.date))
      .unique();
    if (!existing) return { marked: false as const, reason: "no-puzzle" };
    if (existing.announcedAt !== undefined) {
      return { marked: false as const, reason: "already-announced" };
    }
    await ctx.db.patch(existing._id, { announcedAt: Date.now() });
    return { marked: true as const };
  },
});

// Wipe all daily puzzles and reset every moviePool row to unused. Keeps the
// 100-movie pool intact (only flips the `used` flag + clears `usedOnDate`).
// All in one transaction — either every row resets or none do.
// Does NOT touch `attempts` or `players`; if you want a clean slate including
// scores/streaks, run `resetGameHistory` after this.
export const resetPuzzleState = internalMutation({
  args: {},
  handler: async (ctx) => {
    const puzzles = await ctx.db.query("dailyPuzzles").collect();
    for (const p of puzzles) {
      await ctx.db.delete(p._id);
    }

    const pool = await ctx.db.query("moviePool").collect();
    let poolReset = 0;
    for (const m of pool) {
      if (m.used || m.usedOnDate !== undefined) {
        await ctx.db.patch(m._id, { used: false, usedOnDate: undefined });
        poolReset++;
      }
    }

    return {
      puzzlesDeleted: puzzles.length,
      poolReset,
      poolTotal: pool.length,
    };
  },
});

// Optional companion to `resetPuzzleState` — wipes attempts + players too.
// Use when you want a true clean slate (no scores, no streaks, no leaderboard
// rows). Separate function so you don't nuke history by accident.
export const resetGameHistory = internalMutation({
  args: {},
  handler: async (ctx) => {
    const attempts = await ctx.db.query("attempts").collect();
    for (const a of attempts) {
      await ctx.db.delete(a._id);
    }
    const players = await ctx.db.query("players").collect();
    for (const p of players) {
      await ctx.db.delete(p._id);
    }
    return {
      attemptsDeleted: attempts.length,
      playersDeleted: players.length,
    };
  },
});

// Manual override path: delete the puzzle for this date and free its pool
// entry so a fresh generation can pick again.
export const deletePuzzleForDate = internalMutation({
  args: { date: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("dailyPuzzles")
      .withIndex("by_date", (q) => q.eq("date", args.date))
      .unique();
    if (!existing) return { deleted: false as const };

    const pool = await ctx.db.get(existing.moviePoolId);
    if (pool) {
      await ctx.db.replace(pool._id, {
        title: pool.title,
        aliases: pool.aliases,
        year: pool.year,
        tier: pool.tier,
        genres: pool.genres,
        used: false,
      });
    }
    await ctx.db.delete(existing._id);
    return { deleted: true as const };
  },
});
