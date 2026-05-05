import { describe, expect, it } from "vitest";
import { formatRoastPrompt, type RoastInput } from "./roastLines";

function input(over: Partial<RoastInput>): RoastInput {
  return {
    username: "alice",
    correct: true,
    hintsRevealed: 2,
    score: 80,
    ...over,
  };
}

describe("formatRoastPrompt", () => {
  it("formats a winning result with the score", () => {
    const out = formatRoastPrompt(input({}));
    expect(out).toContain("@alice");
    expect(out).toContain("2/5 (won)");
    expect(out).toContain("+80");
  });

  it("formats a losing result without a positive score", () => {
    const out = formatRoastPrompt(
      input({ correct: false, hintsRevealed: 5, score: 0 }),
    );
    expect(out).toContain("X/5 (failed all five hints)");
    expect(out).toContain("Score: 0");
    expect(out).not.toContain("+");
  });

  it("falls back to @someone when username is null", () => {
    const out = formatRoastPrompt(input({ username: null }));
    expect(out).toContain("@someone");
    expect(out).not.toContain("@alice");
  });

  it("uses the exact hint count in the result line", () => {
    for (const n of [1, 2, 3, 4, 5]) {
      const out = formatRoastPrompt(input({ hintsRevealed: n }));
      expect(out).toContain(`${n}/5 (won)`);
    }
  });
});
