import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

const DEFAULT_LIMIT = 10;
const GUILD_SCAN_CAP = 500;

export type LeaderboardRow = {
  userId: string;
  username: string | null;
  totalScore: number;
  currentStreak: number;
  longestStreak: number;
  gamesPlayed: number;
};

// Top players by totalScore. If `guildId` is given, restricts to users who
// have at least one attempt in that guild and sums only that guild's scores.
// Without `guildId`, ranks by the global `players` aggregate.
export const getLeaderboard = query({
  args: {
    guildId: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<LeaderboardRow[]> => {
    const limit = Math.max(1, Math.min(args.limit ?? DEFAULT_LIMIT, 50));

    if (!args.guildId) {
      const top = await ctx.db
        .query("players")
        .withIndex("by_total_score")
        .order("desc")
        .take(limit);
      return top.map(toRow);
    }

    // Per-guild leaderboard: aggregate completed attempts by user, then look
    // up player docs for streak/username. Bounded by GUILD_SCAN_CAP attempts —
    // this is a Discord activity used by friend groups, not an open ladder.
    const attempts = await ctx.db
      .query("attempts")
      .withIndex("by_guild_date", (q) => q.eq("guildId", args.guildId))
      .take(GUILD_SCAN_CAP);

    const totals = new Map<string, number>();
    for (const a of attempts) {
      if (!a.guessed) continue;
      totals.set(a.userId, (totals.get(a.userId) ?? 0) + a.score);
    }

    const ranked = [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);

    const rows: LeaderboardRow[] = [];
    for (const [userId, guildScore] of ranked) {
      const player = await ctx.db
        .query("players")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .unique();
      rows.push({
        userId,
        username: player?.username ?? null,
        totalScore: guildScore,
        currentStreak: player?.currentStreak ?? 0,
        longestStreak: player?.longestStreak ?? 0,
        gamesPlayed: player?.gamesPlayed ?? 0,
      });
    }
    return rows;
  },
});

function toRow(p: Doc<"players">): LeaderboardRow {
  return {
    userId: p.userId,
    username: p.username ?? null,
    totalScore: p.totalScore,
    currentStreak: p.currentStreak,
    longestStreak: p.longestStreak,
    gamesPlayed: p.gamesPlayed,
  };
}
