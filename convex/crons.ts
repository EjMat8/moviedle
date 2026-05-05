import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Daily at 00:05 UTC. Pre-generates today + next two days; idempotent on
// existing puzzles, so partial failures recover on the next run.
crons.cron(
  "daily puzzle generation",
  "5 0 * * *",
  internal.dailyPuzzles.runDailyCron,
  {},
);

// 00:10 UTC — runs just after the puzzle has rolled over so the recap always
// targets the *previous* UTC day. This avoids spoiling the answer for anyone
// still mid-game in the final minutes of the puzzle window. No-op if
// `DISCORD_WEBHOOK_URL` isn't set or no one played that day.
crons.cron(
  "daily moviedle roundup",
  "10 0 * * *",
  internal.notifications.postDailyRoundup,
  {},
);

export default crons;
