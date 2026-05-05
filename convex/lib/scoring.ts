// Pure scoring + grid helpers. Kept Node-free.

export type GridCell = "correct" | "wrong" | "revealed" | "unseen";

export const MAX_HINTS = 5;

// Score: 5/4/3/2/1 by hint level the player guessed on. 0 if they failed all 5.
export function scoreForCorrectGuess(hintLevel: number): number {
  if (!Number.isInteger(hintLevel) || hintLevel < 1 || hintLevel > MAX_HINTS) {
    throw new Error(`hint level must be 1..${MAX_HINTS}, got ${hintLevel}`);
  }
  return MAX_HINTS + 1 - hintLevel;
}

// Per-level outcome captured during the run. Model A allows at most one
// outcome per level: a correct guess, a wrong guess (which burns the hint), or
// an explicit reveal (no penalty, just burns the hint).
export type LevelOutcome = "correct" | "wrong" | "revealed";

// Build the 5-cell grid from the run history. Levels not yet reached stay
// "unseen" (only happens when the game ended on a correct guess before level 5).
export function buildGrid(outcomes: LevelOutcome[]): GridCell[] {
  const grid: GridCell[] = Array.from({ length: MAX_HINTS }, () => "unseen");
  for (let i = 0; i < Math.min(outcomes.length, MAX_HINTS); i++) {
    grid[i] = outcomes[i];
  }
  return grid;
}

// Streak update on game completion. New streak = previous + 1 if the player
// won AND yesterday was their last play; otherwise reset rules:
//   - won, but skipped a day (or first game): currentStreak = 1
//   - lost: currentStreak = 0
export function updateStreak(args: {
  prevStreak: number;
  prevLongest: number;
  prevLastPlayedDate: string | undefined;
  todayDate: string;
  yesterdayDate: string;
  won: boolean;
}): { currentStreak: number; longestStreak: number } {
  if (!args.won) {
    return { currentStreak: 0, longestStreak: args.prevLongest };
  }
  const continued = args.prevLastPlayedDate === args.yesterdayDate;
  const currentStreak = continued ? args.prevStreak + 1 : 1;
  const longestStreak = Math.max(args.prevLongest, currentStreak);
  return { currentStreak, longestStreak };
}
