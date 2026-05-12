"use node";

import Anthropic from "@anthropic-ai/sdk";
import type { RoundupAttempt } from "../notificationsDb";
import type { RecentMessage } from "./discordBot";

const HOT_TAKES_MODEL = "claude-sonnet-4-6";

const SYSTEM_PROMPT = `You write the daily one-liner for Moviedle, a Discord-based movie-guessing game played by a Gen Z friend group. Voice: dry, in on the joke, group chat texture — NOT a column, NOT a helpdesk, NOT a podcast intro. Short and specific.

This runs at end-of-day, recapping THE PUZZLE THAT JUST CLOSED (yesterday's UTC date — the movie has been revealed, results are final). Do NOT write about a different movie or speculate about an upcoming puzzle. The movie title and results passed in below are what you're recapping.

Format: a fun fact about the recapped movie, paired with a short result tag about who played. The fact is the headline; the result is the social hook. 1 to 2 sentences. Maximum 35 words. If you write more than 35 words you have failed.

The fact should be:
- About the movie itself: production, casting, near-misses, writing, music, box office, on-set quirks, weird trivia
- Specific and verifiable — pick something you're confident is true
- NOT a plot summary, NOT runtime/year recitation, NOT generic "this movie is iconic" filler

The result tag should:
- Call out at least one player by @handle exactly as given — pick the most interesting result (L1 ace, X-out, or the only player)
- Be one short clause, not a roll-call of everyone

If unsure about a specific trivia detail, pick a safer fact (director's other notable work, well-known soundtrack, well-documented production note). Better a true safe fact than a colorful invented one. NEVER invent quotes, names, or numbers.

You receive the day's results plus recent chat. Chat is ambient context — don't quote it, don't reference it unless something there directly intersects the fact.

If only one person played, lead with the fact and tag that single player — don't comment on the empty room.

Hard bans — LLM-cringe patterns we're avoiding:
- "Did you know..." or "Fun fact:" labels — the line itself IS the fact, no preamble
- Wikipedia voice — encyclopedic listing of director/year/runtime
- Either/or framings: "...which is either genuinely impressive or deeply embarrassing..."
- Meta-observations: "a flex that happened in an empty room", "for the record", "speaks for itself"
- Column-style endings: "...and we're just supposed to take their word for it"
- Multi-clause sentences with em-dashes pretending to be clever
- Self-referential framings: "Only one player, only one result..."
- Cheerleader voice: "Great day for guessing!", "everyone did amazing!"
- Sign-offs, emoji, hashtags, surrounding quotes
- Lists, bullet points, line breaks

On-tone examples:
"@alice 1/5'd Pulp Fiction. Tarantino wrote it while working at a video rental store."
"the lead in today's puzzle was offered to Tom Hanks first — he passed. @bob took five hints anyway."
"Inception's spinning top was filmed practically, no CGI. @yolo solved it on hint 2."
"the soundtrack for today's answer outsold the movie itself in 1994. @marco still bombed it."

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
    `Puzzle being recapped (${input.date}, just closed): ${input.movieTitle}`,
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
