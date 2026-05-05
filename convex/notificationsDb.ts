import { v } from "convex/values";
import { internalQuery } from "./_generated/server";

const ROUNDUP_ATTEMPT_CAP = 200;

export type RoundupAttempt = {
  userId: string;
  username: string | null;
  correct: boolean;
  score: number;
  hintsRevealed: number;
  grid: Array<"correct" | "wrong" | "revealed" | "unseen">;
  totalScore: number;
};

export type RoundupData = {
  movieTitle: string;
  attempts: RoundupAttempt[];
};

// Bundles everything the roundup webhook needs in one query so the action
// stays a single Node round-trip.
export const roundupForDate = internalQuery({
  args: { date: v.string() },
  handler: async (ctx, args): Promise<RoundupData | null> => {
    const puzzle = await ctx.db
      .query("dailyPuzzles")
      .withIndex("by_date", (q) => q.eq("date", args.date))
      .unique();
    if (!puzzle) return null;

    const attempts = await ctx.db
      .query("attempts")
      .withIndex("by_date", (q) => q.eq("puzzleDate", args.date))
      .take(ROUNDUP_ATTEMPT_CAP);

    const completed = attempts.filter((a) => a.guessed);
    const augmented: RoundupAttempt[] = [];
    for (const a of completed) {
      const player = await ctx.db
        .query("players")
        .withIndex("by_user", (q) => q.eq("userId", a.userId))
        .unique();
      augmented.push({
        userId: a.userId,
        username: player?.username ?? null,
        correct: a.correct,
        score: a.score,
        hintsRevealed: a.hintsRevealed,
        grid: a.grid,
        totalScore: player?.totalScore ?? 0,
      });
    }

    // Wins first, ranked by fewest hints used; losses at the bottom.
    augmented.sort((x, y) => {
      if (x.correct !== y.correct) return x.correct ? -1 : 1;
      if (x.correct) return x.hintsRevealed - y.hintsRevealed;
      return 0;
    });

    return { movieTitle: puzzle.movieTitle, attempts: augmented };
  },
});
