"use node";

import Anthropic from "@anthropic-ai/sdk";
import { extractJson, type ValidationResult } from "./validators";

// Sonnet 4.6. The user's original spec said "claude-sonnet-4-7" — that's Opus,
// not Sonnet. See locked-in design decisions.
export const HINT_MODEL = "claude-sonnet-4-6";

let cachedClient: Anthropic | null = null;
function getClient(): Anthropic {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY not set. Run: npx convex env set ANTHROPIC_API_KEY <key>",
    );
  }
  cachedClient = new Anthropic({ apiKey });
  return cachedClient;
}

export type RequestJsonOpts = {
  system: string;
  userMessage: string;
  maxTokens: number;
  temperature?: number;
};

// Send a prompt to Claude, expect a JSON response, parse + validate it.
// Retries once on validation failure with the validator's error fed back to Claude.
export async function requestJson<T>(
  opts: RequestJsonOpts,
  validate: (raw: unknown) => ValidationResult<T>,
): Promise<T> {
  const client = getClient();
  const messages: Array<{ role: "user" | "assistant"; content: string }> = [
    { role: "user", content: opts.userMessage },
  ];

  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await client.messages.create({
      model: HINT_MODEL,
      max_tokens: opts.maxTokens,
      temperature: opts.temperature ?? 0.7,
      system: opts.system,
      messages,
    });

    const text = response.content
      .flatMap((b) => (b.type === "text" ? [b.text] : []))
      .join("\n");

    const extracted = extractJson(text);
    if (!extracted.ok) {
      if (attempt === 0) {
        messages.push({ role: "assistant", content: text });
        messages.push({
          role: "user",
          content: `Your previous response could not be parsed: ${extracted.error}. Reply with ONLY valid JSON, no prose, no markdown fences.`,
        });
        continue;
      }
      throw new Error(`Claude response not parseable as JSON: ${extracted.error}`);
    }

    const validated = validate(extracted.value);
    if (!validated.ok) {
      if (attempt === 0) {
        messages.push({ role: "assistant", content: text });
        messages.push({
          role: "user",
          content: `Your previous response failed validation: ${validated.error}. Fix the issue and reply with ONLY valid JSON matching the schema.`,
        });
        continue;
      }
      throw new Error(`Claude response failed validation: ${validated.error}`);
    }

    return validated.value;
  }

  throw new Error("requestJson: unreachable");
}
