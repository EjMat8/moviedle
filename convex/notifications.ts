"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { todayUtcDate, yesterdayUtc } from "./lib/dateUtil";
import {
  fetchRecentChannelMessages,
  postWithFallback,
  discordMention,
  pingableUserId,
  applyMentions,
  type PostResult,
} from "./lib/discordBot";
import { generateHotTake } from "./lib/hotTakes";
import { generateRoastLine } from "./lib/roastLines";

const GRID_EMOJI: Record<string, string> = {
  correct: "🟩",
  wrong: "🟥",
  revealed: "⬛",
  unseen: "⬜",
};

type NotificationResult = PostResult;

function gridString(grid: string[]): string {
  return grid.map((c) => GRID_EMOJI[c] ?? "⬜").join("");
}

function formatPoints(n: number): string {
  return n.toLocaleString("en-US");
}

// Per-play completion notification — fired by `submitGuess` on win or loss.
export const postPlayResult = internalAction({
  args: {
    date: v.string(),
    userId: v.string(),
    username: v.optional(v.string()),
    correct: v.boolean(),
    score: v.number(),
    hintsRevealed: v.number(),
    grid: v.array(
      v.union(
        v.literal("correct"),
        v.literal("wrong"),
        v.literal("revealed"),
        v.literal("unseen"),
      ),
    ),
  },
  handler: async (_ctx, args): Promise<NotificationResult> => {
    const emoji = args.correct ? "🎬" : "💀";
    const username = args.username ?? null;
    const mention = discordMention(args.userId, username);

    const roast = await generateRoastLine({
      username,
      correct: args.correct,
      hintsRevealed: args.hintsRevealed,
      score: args.score,
    });

    let headline: string;
    if (roast) {
      // Roast LLM emits `@username`; rewrite to a real ping.
      const pinged = applyMentions(roast, [
        { userId: args.userId, username },
      ]);
      headline = `${emoji} ${pinged}`;
    } else {
      // LLM unavailable — keep the channel unblocked with the static format.
      const handle = username ? `**${mention}**` : "Someone";
      headline = args.correct
        ? `${emoji} ${handle} got Moviedle ${args.date} in ${args.hintsRevealed}/5 · +${args.score}`
        : `${emoji} ${handle} got blanked on Moviedle ${args.date} (X/5)`;
    }

    const pingId = pingableUserId(args.userId);
    return postWithFallback(
      `${headline}\n${gridString(args.grid)}`,
      pingId ? [pingId] : [],
    );
  },
});

// End-of-day roundup at 00:10 UTC for the puzzle that just closed. Reveals
// the movie, groups players by hints used, and (when bot + Anthropic envs
// are configured) appends a Hot Takes Wall paragraph riffing on results +
// recent channel chat. All players who completed get pinged.
export const postDailyRoundup = internalAction({
  args: { date: v.optional(v.string()) },
  handler: async (
    ctx,
    args,
  ): Promise<NotificationResult | "no-puzzle" | "no-attempts"> => {
    const date = args.date ?? yesterdayUtc(todayUtcDate());
    const data = await ctx.runQuery(internal.notificationsDb.roundupForDate, {
      date,
    });
    if (!data) return "no-puzzle";
    if (data.attempts.length === 0) return "no-attempts";

    type Row = { mention: string; totalScore: number };
    const groups = new Map<string, Row[]>();
    for (const a of data.attempts) {
      const line = a.correct ? `${a.hintsRevealed}/5` : "X/5";
      const arr = groups.get(line) ?? [];
      arr.push({
        mention: discordMention(a.userId, a.username),
        totalScore: a.totalScore,
      });
      groups.set(line, arr);
    }

    const order = ["1/5", "2/5", "3/5", "4/5", "5/5", "X/5"];
    const grouped: string[] = [];
    for (const key of order) {
      const rows = groups.get(key);
      if (!rows || rows.length === 0) continue;
      // Highest career total first within each line — makes the season's
      // pecking order legible at a glance.
      rows.sort((x, y) => y.totalScore - x.totalScore);
      const prefix = key === "1/5" ? "👑 " : "";
      const rendered = rows
        .map((r) => `${r.mention} (${formatPoints(r.totalScore)} pts)`)
        .join(" · ");
      grouped.push(`${prefix}**${key}** — ${rendered}`);
    }

    const total = data.attempts.length;
    const solved = data.attempts.filter((a) => a.correct).length;
    const baseLines = [
      `🎞️ **Moviedle ${date} results**`,
      `Movie: **${data.movieTitle}** · ${solved}/${total} got it`,
      "",
      ...grouped,
    ];

    // Hot Takes Wall — best-effort. If anything fails (no bot, no API key,
    // chat fetch errors, LLM error), the roundup posts without the take.
    const recentChat = await fetchRecentChannelMessages(20);
    const hotTake = await generateHotTake({
      date,
      movieTitle: data.movieTitle,
      attempts: data.attempts,
      recentChat,
    });

    // LLM emits `@username`; rewrite to real Discord pings.
    const pingedTake = hotTake
      ? applyMentions(hotTake, data.attempts)
      : null;

    const message = pingedTake
      ? [...baseLines, "", `🪦 *${pingedTake}*`].join("\n")
      : baseLines.join("\n");

    const mentionIds = data.attempts
      .map((a) => pingableUserId(a.userId))
      .filter((id): id is string => id !== null);

    return postWithFallback(message, mentionIds);
  },
});
