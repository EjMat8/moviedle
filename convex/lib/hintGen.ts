"use node";

import { requestJson } from "./anthropic";
import { validateHints, type Hint } from "./validators";

const HINT_SPEC = `
Generate exactly 5 hints, one per "order" 1..5, escalating from vague to obvious.

Audience: Gen Z casual movie watchers (not film-school cinephiles). Calibrate accordingly.

Per-level rules (these "type" values are required):

- order 1, type "emoji": EXACTLY 3-4 unicode emoji that hint at the movie's vibe, themes, mood, or atmosphere. ABSTRACT/THEMATIC, not literal.

  Follow this algorithm strictly:
  1. INTERNALLY (do not output) brainstorm a "forbidden list" of 3-6 emoji that would be giveaways for THIS specific movie — i.e. the emojis a fan would draw if asked to represent the movie in a single icon. This includes: the title character or any named protagonist, the protagonist's signature weapon/symbol/vehicle/prop, any defining single visual icon of the film, any creature/animal/mascot the film is built around. Be honest with yourself — include the obvious ones.
  2. Then choose 3-4 emoji for the actual hint that have ZERO overlap with your forbidden list. Lean only on mood, emotion, atmosphere, broad setting cue (forest/city/ocean is OK if it's not the film's signature), color, or thematic concept.
  3. Sanity check: would a player seeing only your 3-4 emojis think "hmm, this could plausibly be several different movies"? If they would think "oh that's obviously X" — restart and pick different emojis.
  4. Output ONLY the chosen 3-4 emojis in the "content" field. Do NOT include the forbidden list or any prose.

  The L1 hint should be HARD. Landing the answer at L1 should feel like a genuine read on vibes — not a giveaway.

- order 2, type "setting": one short sentence describing era/place/world/situation. No character names, no actor names, no franchise names, no quotes from the film.

- order 3, type EITHER "famous_quote" OR "trivia":
  - Use "famous_quote" only if you are 95%+ confident the quote is verbatim from the film. Quote it with surrounding double quotes, no attribution.
  - Otherwise use "trivia": a notable production or behind-the-scenes fact that doesn't give away the title.

- order 4, type "cast_clue": name 1-2 notable cast members WITHOUT mentioning their character names from this film. Phrase as "Stars X" or "Stars X and Y".

- order 5, type "crew_clue": this is the most revealing hint and should make the answer nearly guessable for the target audience. Format: name the director, then add ONE piece of supporting context to actually help them place it. Pick whichever supporting context is most useful for THIS specific film:
  - another well-known directing/writing credit of theirs, e.g. "Directed by Jordan Peele, who also made Get Out."
  - the studio + a recognizable production fact, e.g. "A Sony Pictures Animation film with Phil Lord and Chris Miller producing."
  - the composer/songwriter, e.g. "Directed by Roger Allers and Rob Minkoff; original songs by Elton John and Tim Rice."
  - release year + notable awards/accolades, e.g. "Directed by Bong Joon-ho — won Best Picture at the 2020 Oscars."
  Pick ONE supporting fact, not multiple. Don't name the title or any character.

Hard constraints (all levels):
- The movie's title, its sequels, franchise names, and any character names from this film must NEVER appear in any hint.
- "content" is a non-empty string.
- Reply with ONLY a JSON array of 5 objects, no prose, no markdown fences.

Schema:
[{ "type": string, "content": string, "order": number }]
`.trim();

export async function generateHints(
  title: string,
  year: number,
  aliases: string[],
): Promise<Hint[]> {
  const aliasNote =
    aliases.length > 0
      ? `Also avoid these alternate titles in hints: ${aliases.join(", ")}.`
      : "";
  const userMessage = [
    `Movie: "${title}" (${year})`,
    aliasNote,
    "",
    HINT_SPEC,
  ]
    .filter(Boolean)
    .join("\n");

  return requestJson(
    {
      system:
        "You design escalating hints for a daily movie-guessing game. Hints must escalate from vague to obvious, never reveal the title or character names, and reply only in valid JSON matching the requested schema.",
      userMessage,
      maxTokens: 2000,
      temperature: 0.6,
    },
    validateHints,
  );
}
