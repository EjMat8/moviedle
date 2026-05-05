"use node";

import Anthropic from "@anthropic-ai/sdk";
import type { RoundupAttempt } from "../notificationsDb";
import type { RecentMessage } from "./discordBot";

const HOT_TAKES_MODEL = "claude-sonnet-4-6";

const SYSTEM_PROMPT = `You write the daily one-liner for Moviedle, a Discord-based movie-guessing game played by a Gen Z friend group. Voice: dry, in on the joke, group chat texture — NOT a column, NOT a helpdesk, NOT a podcast intro. Short and specific.

Length: 1 to 2 sentences. Lean toward 1. Maximum 35 words. If you write more than 35 words you have failed.

You receive today's results plus recent chat. Lead with what actually happened (who got it, in how many, who bombed, anyone who skipped). Reference chat ONLY if there's a real organic hook (someone hyping a different movie, an absence, an inside joke). Don't quote chat. Don't recap the rules. Don't comment on the situation itself.

Hard bans — these are the LLM-cringe patterns we're avoiding:
- Either/or framings: "...which is either genuinely impressive or deeply embarrassing..."
- Meta-observations about the result: "a flex that happened in an empty room", "for the record", "speaks for itself"
- Column-style endings: "...and we're just supposed to take their word for it", "the receipts will be entered into evidence"
- Multi-clause sentences with em-dashes pretending to be clever
- Self-referential framings: "Only one player, only one result..."
- Cheerleader voice: "Great day for guessing!", "everyone did amazing!"
- Sign-offs, emoji, hashtags, preambles, surrounding quotes
- Lists, bullet points, line breaks

If only one person played, keep it especially short — one sentence, don't comment on the lack of others.

On-tone examples:
"@yolo solo-ran The Incredibles in 2. closed shop early."
"@alice with the L1, @bob got blanked on a Villeneuve. brutal day for the casuals."
"three of you got it on the cast clue and @marco guessed Tenet again."
"@yolo took 5 hints on a Pixar movie. we have questions."

Reply with ONLY the line(s).`;

export type HotTakesInput = {
  date: string;
  movieTitle: string;
  attempts: RoundupAttempt[];
  recentChat: RecentMessage[];
};

export function formatHotTakesPrompt(input: HotTakesInput): string {
  const wins = input.attempts.filter((a) => a.correct);
  const losses = input.attempts.filter((a) => !a.correct);

  const resultLines: string[] = [];
  for (const a of wins) {
    const handle = a.username ? `@${a.username}` : a.userId;
    const flex = a.hintsRevealed === 1 ? " (L1 ace)" : "";
    resultLines.push(`${handle}: ${a.hintsRevealed}/5${flex} (+${a.score})`);
  }
  for (const a of losses) {
    const handle = a.username ? `@${a.username}` : a.userId;
    resultLines.push(`${handle}: X/5 (bombed)`);
  }

  // Discord returns newest-first; reverse so the LLM reads chronologically.
  // Drop bots and empty content (embed-only or sticker messages).
  const humanChat = input.recentChat
    .filter((m) => !m.authorIsBot && m.content.trim().length > 0)
    .slice(0, 30)
    .reverse();

  const sections: string[] = [
    `Today's puzzle (${input.date}): ${input.movieTitle}`,
    "",
    "Results:",
    ...(resultLines.length > 0 ? resultLines : ["(nobody played)"]),
  ];

  if (humanChat.length > 0) {
    sections.push("", "Recent chat (oldest to newest):");
    for (const m of humanChat) {
      sections.push(`${m.authorUsername}: ${m.content}`);
    }
  } else {
    sections.push(
      "",
      "Recent chat: (none accessible — write the take from results alone)",
    );
  }

  return sections.join("\n");
}

export async function generateHotTake(
  input: HotTakesInput,
): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const userMessage = formatHotTakesPrompt(input);
  const client = new Anthropic({ apiKey });

  try {
    const response = await client.messages.create({
      model: HOT_TAKES_MODEL,
      max_tokens: 200,
      temperature: 0.9,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });
    const text = response.content
      .flatMap((b) => (b.type === "text" ? [b.text] : []))
      .join("\n")
      .trim();
    return text.length > 0 ? text : null;
  } catch (e) {
    console.error("Hot Takes generation failed:", e);
    return null;
  }
}
