import { describe, expect, it } from "vitest";
import { formatHotTakesPrompt, type HotTakesInput } from "./hotTakes";
import type { RecentMessage } from "./discordBot";
import type { RoundupAttempt } from "../notificationsDb";

function attempt(over: Partial<RoundupAttempt>): RoundupAttempt {
  return {
    userId: "u1",
    username: "alice",
    correct: true,
    score: 80,
    hintsRevealed: 2,
    grid: ["wrong", "correct", "unseen", "unseen", "unseen"],
    totalScore: 0,
    ...over,
  };
}

function chat(over: Partial<RecentMessage>): RecentMessage {
  return {
    authorId: "1",
    authorUsername: "alice",
    authorIsBot: false,
    content: "hello",
    timestamp: "2026-05-04T10:00:00.000Z",
    ...over,
  };
}

const baseInput: HotTakesInput = {
  date: "2026-05-04",
  movieTitle: "Whiplash",
  attempts: [],
  recentChat: [],
};

describe("formatHotTakesPrompt", () => {
  it("includes the date and movie title in the header", () => {
    const out = formatHotTakesPrompt(baseInput);
    expect(out).toContain("2026-05-04");
    expect(out).toContain("Whiplash");
  });

  it("lists wins before losses", () => {
    const out = formatHotTakesPrompt({
      ...baseInput,
      attempts: [
        attempt({ userId: "u1", username: "alice", correct: false, hintsRevealed: 5 }),
        attempt({ userId: "u2", username: "bob", correct: true, hintsRevealed: 1, score: 100 }),
      ],
    });
    const aliceIdx = out.indexOf("@alice");
    const bobIdx = out.indexOf("@bob");
    expect(bobIdx).toBeGreaterThan(-1);
    expect(aliceIdx).toBeGreaterThan(bobIdx);
    expect(out).toContain("X/5 (bombed)");
    expect(out).toContain("L1 ace");
  });

  it("falls back to a 'nobody played' line when attempts are empty", () => {
    const out = formatHotTakesPrompt(baseInput);
    expect(out).toContain("(nobody played)");
  });

  it("filters bot messages and empty content from chat context", () => {
    const out = formatHotTakesPrompt({
      ...baseInput,
      recentChat: [
        chat({ authorUsername: "moviedle", authorIsBot: true, content: "Daily puzzle ready" }),
        chat({ authorUsername: "alice", content: "" }),
        chat({ authorUsername: "bob", content: "yo i bombed today" }),
      ],
    });
    expect(out).not.toContain("Daily puzzle ready");
    expect(out).toContain("bob: yo i bombed today");
    expect(out).not.toContain("alice: \n");
  });

  it("reverses Discord's newest-first ordering so chat reads chronologically", () => {
    // Discord API returns newest-first; the LLM should see oldest-first.
    const out = formatHotTakesPrompt({
      ...baseInput,
      recentChat: [
        chat({ authorUsername: "alice", content: "third" }),
        chat({ authorUsername: "alice", content: "second" }),
        chat({ authorUsername: "alice", content: "first" }),
      ],
    });
    const firstIdx = out.indexOf("first");
    const secondIdx = out.indexOf("second");
    const thirdIdx = out.indexOf("third");
    expect(firstIdx).toBeLessThan(secondIdx);
    expect(secondIdx).toBeLessThan(thirdIdx);
  });

  it("notes when chat context is unavailable", () => {
    const out = formatHotTakesPrompt(baseInput);
    expect(out).toContain("none accessible");
  });

  it("caps chat lines at 30 to keep the prompt bounded", () => {
    const lots = Array.from({ length: 60 }, (_, i) =>
      chat({ content: `msg-${i}` }),
    );
    const out = formatHotTakesPrompt({ ...baseInput, recentChat: lots });
    const matches = out.match(/msg-\d+/g) ?? [];
    expect(matches.length).toBeLessThanOrEqual(30);
  });
});
