"use node";

import { v } from "convex/values";
import { internalAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { generateHints } from "./lib/hintGen";
import { addDaysUtc, todayUtcDate } from "./lib/dateUtil";
import { postWithFallback, type PostResult } from "./lib/discordBot";
import type { Doc, Id } from "./_generated/dataModel";

const MAX_PICK_ATTEMPTS = 3;

function pickRandom<T>(arr: T[]): T | undefined {
  if (arr.length === 0) return undefined;
  return arr[Math.floor(Math.random() * arr.length)];
}

type GenerateResult =
  | { status: "inserted"; puzzleId: Id<"dailyPuzzles"> }
  | { status: "already-exists"; puzzleId: Id<"dailyPuzzles"> };

async function generateForDate(
  ctx: ActionCtx,
  date: string,
): Promise<GenerateResult> {
  const existing: Doc<"dailyPuzzles"> | null = await ctx.runQuery(
    internal.dailyPuzzlesDb.puzzleForDate,
    { date },
  );
  if (existing) {
    return { status: "already-exists", puzzleId: existing._id };
  }

  for (let attempt = 0; attempt < MAX_PICK_ATTEMPTS; attempt++) {
    const candidates: Doc<"moviePool">[] = await ctx.runQuery(
      internal.dailyPuzzlesDb.unusedCandidates,
      {},
    );
    const candidate = pickRandom(candidates);
    if (!candidate) {
      throw new Error(
        "moviePool has no unused entries — re-run generatePool or add more titles.",
      );
    }

    const hints = await generateHints(
      candidate.title,
      candidate.year,
      candidate.aliases,
    );

    const result = await ctx.runMutation(
      internal.dailyPuzzlesDb.commitPuzzle,
      { date, moviePoolId: candidate._id, hints },
    );

    if (result.status !== "candidate-taken") {
      return result;
    }
    // Lost the race on this candidate; loop and pick another.
  }

  throw new Error(
    `generateDailyPuzzle: gave up after ${MAX_PICK_ATTEMPTS} pool-race retries.`,
  );
}

export const generateDailyPuzzle = internalAction({
  args: { date: v.string() },
  handler: async (ctx, args): Promise<GenerateResult> => {
    return generateForDate(ctx, args.date);
  },
});

export const regenerateForDate = internalAction({
  args: { date: v.string() },
  handler: async (ctx, args): Promise<GenerateResult> => {
    await ctx.runMutation(internal.dailyPuzzlesDb.deletePuzzleForDate, {
      date: args.date,
    });
    return generateForDate(ctx, args.date);
  },
});

async function postDailyAnnouncement(
  ctx: ActionCtx,
  date: string,
): Promise<PostResult | "skipped-already-announced"> {
  // Race guard: only one runner gets `marked: true`; everyone else bails.
  const claim = await ctx.runMutation(internal.dailyPuzzlesDb.markAnnounced, {
    date,
  });
  if (!claim.marked) return "skipped-already-announced";

  const content = `🎬 **Moviedle ${date}** is live — tap Play Now and lock in your guess. Hint 1 is intentionally vague, that's the whole point.`;
  return postWithFallback(content, []);
}

// Cron entry point. Pre-generates today + next two days so a single
// Anthropic / quota failure on any given day still leaves the player a puzzle.
// Each call is idempotent; only missing dates do real work.
export const runDailyCron = internalAction({
  args: {},
  handler: async (ctx) => {
    const today = todayUtcDate();
    const dates = [today, addDaysUtc(today, 1), addDaysUtc(today, 2)];
    const results: Array<
      | {
          date: string;
          ok: true;
          status: GenerateResult["status"];
          announcement?: Awaited<ReturnType<typeof postDailyAnnouncement>>;
        }
      | { date: string; ok: false; error: string }
    > = [];
    for (const date of dates) {
      try {
        const r = await generateForDate(ctx, date);
        const isToday = date === today;
        const announcement = isToday
          ? await postDailyAnnouncement(ctx, date)
          : undefined;
        results.push({ date, ok: true, status: r.status, announcement });
      } catch (e) {
        results.push({ date, ok: false, error: (e as Error).message });
      }
    }
    return results;
  },
});

// Manual trigger so the user can fire the announcement on-demand without
// waiting for the cron — useful when first wiring DISCORD_WEBHOOK_URL.
export const announceToday = internalAction({
  args: { date: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const date = args.date ?? todayUtcDate();
    return postDailyAnnouncement(ctx, date);
  },
});
