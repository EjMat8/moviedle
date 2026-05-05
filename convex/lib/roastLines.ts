"use node";

import Anthropic from "@anthropic-ai/sdk";

const ROAST_MODEL = "claude-haiku-4-5";

const SYSTEM_PROMPT = `You write a single one-line headline for a Discord movie-guessing game (Moviedle) when a friend completes their daily puzzle. Voice: dry, slightly cocky, in on the joke — like a regular in the group chat, NOT a help-desk assistant. Closer to Letterboxd-but-cocky.

You receive:
- player handle (e.g. @yolo)
- result: hints used 1-5 (lower = better) or X (failed)
- score points (0 on a fail)

Output exactly ONE line, 8-16 words. Reference the @handle exactly as given. Match energy to the result:
- 1/5: top-tier flex, "what a genius" energy
- 2-3/5: respectable win, light cocky compliment
- 4/5: scraped by, gentle ribbing
- 5/5: needed the full reveal, embarrassing
- X/5: total blank, dignified roast — no mercy

NO emoji. NO hashtags. NO sign-off. NO preamble. NO surrounding quotes. Just the line.

Off-tone (don't write like this):
"@yolo did awesome with 2/5 hints! 🎉"
"@yolo solved it in 2 hints! What a champion!"

On-tone (write like this):
"@yolo locked in at 2/5 like they had inside info, +60 banked"
"@yolo with the L1 ace, the rest of us look slow today"
"@yolo bombed with five hints in front of them and still couldn't connect the dots"
"@yolo needed every single hint and the giveaway to limp across the line"`;

export type RoastInput = {
  username: string | null;
  correct: boolean;
  hintsRevealed: number;
  score: number;
};

export function formatRoastPrompt(input: RoastInput): string {
  const handle = input.username ? `@${input.username}` : "@someone";
  if (input.correct) {
    return `Player: ${handle}\nResult: ${input.hintsRevealed}/5 (won)\nScore: +${input.score}`;
  }
  return `Player: ${handle}\nResult: X/5 (failed all five hints)\nScore: 0`;
}

export async function generateRoastLine(
  input: RoastInput,
): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const client = new Anthropic({ apiKey });
  try {
    const response = await client.messages.create({
      model: ROAST_MODEL,
      max_tokens: 120,
      temperature: 0.9,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: formatRoastPrompt(input) }],
    });
    const text = response.content
      .flatMap((b) => (b.type === "text" ? [b.text] : []))
      .join("\n")
      .trim();
    const cleaned = text.replace(/^["']|["']$/g, "").trim();
    return cleaned.length > 0 ? cleaned : null;
  } catch (e) {
    console.error("Roast line generation failed:", e);
    return null;
  }
}
