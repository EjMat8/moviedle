// Pure helpers for parsing + validating Claude JSON output.
// Kept Node-free so they can be unit-tested with plain vitest.

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

// Claude often wraps JSON in ```json ... ``` fences or surrounds it with
// preamble. Pull out the first balanced JSON object/array we can find.
export function extractJson(raw: string): ValidationResult<unknown> {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1].trim() : raw.trim();

  const start = candidate.search(/[{\[]/);
  if (start === -1) {
    return { ok: false, error: "no JSON object or array found in response" };
  }

  const open = candidate[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < candidate.length; i++) {
    const c = candidate[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (c === "\\") {
      escape = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) {
        const slice = candidate.slice(start, i + 1);
        try {
          return { ok: true, value: JSON.parse(slice) };
        } catch (e) {
          return {
            ok: false,
            error: `JSON.parse failed: ${(e as Error).message}`,
          };
        }
      }
    }
  }
  return { ok: false, error: "unbalanced JSON braces" };
}

const TIERS = ["mass_appeal", "well_known", "cult_classic"] as const;
export type Tier = (typeof TIERS)[number];

export type MoviePoolEntry = {
  title: string;
  aliases: string[];
  year: number;
  tier: Tier;
  genres: string[];
};

// Each entry self-declares its tier. Pool is now generated per category, with
// Claude tagging each movie's popularity tier inline.
export function validateMoviePoolBatch(
  raw: unknown,
): ValidationResult<MoviePoolEntry[]> {
  if (!Array.isArray(raw)) {
    return { ok: false, error: "expected top-level array" };
  }
  const out: MoviePoolEntry[] = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i] as Record<string, unknown> | undefined;
    if (!item || typeof item !== "object") {
      return { ok: false, error: `entry ${i}: not an object` };
    }
    const title = item.title;
    const year = item.year;
    const aliases = item.aliases;
    const genres = item.genres;
    const tier = item.tier;
    if (typeof title !== "string" || title.length === 0) {
      return { ok: false, error: `entry ${i}: title must be non-empty string` };
    }
    if (typeof year !== "number" || !Number.isFinite(year) || year < 1900 || year > 2100) {
      return { ok: false, error: `entry ${i} (${title}): year out of range` };
    }
    if (!Array.isArray(aliases) || aliases.some((a) => typeof a !== "string")) {
      return { ok: false, error: `entry ${i} (${title}): aliases must be string[]` };
    }
    if (!Array.isArray(genres) || genres.some((g) => typeof g !== "string") || genres.length === 0) {
      return { ok: false, error: `entry ${i} (${title}): genres must be non-empty string[]` };
    }
    if (typeof tier !== "string" || !(TIERS as readonly string[]).includes(tier)) {
      return {
        ok: false,
        error: `entry ${i} (${title}): tier must be one of ${TIERS.join(", ")}, got "${String(tier)}"`,
      };
    }
    out.push({
      title,
      aliases: aliases as string[],
      year,
      tier: tier as Tier,
      genres: genres as string[],
    });
  }
  return { ok: true, value: out };
}

const HINT_TYPES = [
  "emoji",
  "plot_summary",
  "famous_quote",
  "cast_clue",
  "crew_clue",
  "fake_review",
  "object_list",
  "tagline",
  "first_or_last_line",
  "setting",
  "soundtrack",
  "trivia",
] as const;
export type HintType = (typeof HINT_TYPES)[number];

export type Hint = {
  type: HintType;
  content: string;
  order: number;
};

// 5 hints, escalating from vague (level 1) to obvious (level 5).
// The "shape" we ask Claude for: emoji → setting/object → quote/trivia → cast → crew.
export function validateHints(raw: unknown): ValidationResult<Hint[]> {
  const arr = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { hints?: unknown }).hints)
      ? (raw as { hints: unknown[] }).hints
      : null;
  if (!arr) {
    return { ok: false, error: "expected array of hints (or { hints: [...] })" };
  }
  if (arr.length !== 5) {
    return { ok: false, error: `expected exactly 5 hints, got ${arr.length}` };
  }
  const seenOrders = new Set<number>();
  const out: Hint[] = [];
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i] as Record<string, unknown> | undefined;
    if (!item || typeof item !== "object") {
      return { ok: false, error: `hint ${i}: not an object` };
    }
    const type = item.type;
    const content = item.content;
    const order = item.order;
    if (typeof type !== "string" || !(HINT_TYPES as readonly string[]).includes(type)) {
      return { ok: false, error: `hint ${i}: invalid type "${String(type)}"` };
    }
    if (typeof content !== "string" || content.trim().length === 0) {
      return { ok: false, error: `hint ${i}: content must be non-empty string` };
    }
    if (typeof order !== "number" || !Number.isInteger(order) || order < 1 || order > 5) {
      return { ok: false, error: `hint ${i}: order must be 1..5` };
    }
    if (seenOrders.has(order)) {
      return { ok: false, error: `hint ${i}: duplicate order ${order}` };
    }
    seenOrders.add(order);
    out.push({ type: type as HintType, content: content.trim(), order });
  }
  out.sort((a, b) => a.order - b.order);
  return { ok: true, value: out };
}
