import { describe, expect, test } from "vitest";
import {
  extractJson,
  validateHints,
  validateMoviePoolBatch,
} from "./validators";

describe("extractJson", () => {
  test("parses bare JSON object", () => {
    const result = extractJson('{"a": 1, "b": "x"}');
    expect(result).toEqual({ ok: true, value: { a: 1, b: "x" } });
  });

  test("parses bare JSON array", () => {
    const result = extractJson("[1, 2, 3]");
    expect(result).toEqual({ ok: true, value: [1, 2, 3] });
  });

  test("strips markdown code fence with json language tag", () => {
    const raw = "Sure! Here's the data:\n```json\n[{\"x\": 1}]\n```\n";
    const result = extractJson(raw);
    expect(result).toEqual({ ok: true, value: [{ x: 1 }] });
  });

  test("strips bare ``` fence", () => {
    const result = extractJson("```\n{\"x\": 1}\n```");
    expect(result).toEqual({ ok: true, value: { x: 1 } });
  });

  test("ignores prose before JSON object", () => {
    const result = extractJson('Here it is: {"x": 1, "y": [1,2,3]} done.');
    expect(result).toEqual({ ok: true, value: { x: 1, y: [1, 2, 3] } });
  });

  test("handles braces inside strings without breaking balance", () => {
    const result = extractJson('{"msg": "this } is { fine"}');
    expect(result).toEqual({ ok: true, value: { msg: "this } is { fine" } });
  });

  test("handles escaped quotes", () => {
    const result = extractJson('{"msg": "say \\"hi\\""}');
    expect(result).toEqual({ ok: true, value: { msg: 'say "hi"' } });
  });

  test("returns error on no JSON found", () => {
    const result = extractJson("just prose, no JSON");
    expect(result.ok).toBe(false);
  });

  test("returns error on unbalanced braces", () => {
    const result = extractJson('{"a": 1');
    expect(result.ok).toBe(false);
  });
});

describe("validateMoviePoolBatch", () => {
  const validEntry = {
    title: "The Matrix",
    aliases: ["Matrix"],
    year: 1999,
    genres: ["sci-fi", "action"],
    tier: "mass_appeal",
  };

  test("accepts a valid batch with tier per entry", () => {
    const result = validateMoviePoolBatch([validEntry]);
    expect(result).toEqual({ ok: true, value: [validEntry] });
  });

  test("rejects non-array", () => {
    const result = validateMoviePoolBatch({ entries: [validEntry] });
    expect(result.ok).toBe(false);
  });

  test("rejects missing title", () => {
    const result = validateMoviePoolBatch([{ ...validEntry, title: "" }]);
    expect(result.ok).toBe(false);
  });

  test("rejects out-of-range year", () => {
    const result = validateMoviePoolBatch([{ ...validEntry, year: 1800 }]);
    expect(result.ok).toBe(false);
  });

  test("rejects empty genres array", () => {
    const result = validateMoviePoolBatch([{ ...validEntry, genres: [] }]);
    expect(result.ok).toBe(false);
  });

  test("rejects non-string in aliases", () => {
    const result = validateMoviePoolBatch([
      { ...validEntry, aliases: ["x", 5] },
    ]);
    expect(result.ok).toBe(false);
  });

  test("rejects unknown tier", () => {
    const result = validateMoviePoolBatch([
      { ...validEntry, tier: "blockbuster" },
    ]);
    expect(result.ok).toBe(false);
  });

  test("rejects missing tier", () => {
    const noTier: Record<string, unknown> = { ...validEntry };
    delete noTier.tier;
    const result = validateMoviePoolBatch([noTier]);
    expect(result.ok).toBe(false);
  });
});

describe("validateHints", () => {
  const fiveValid = [
    { type: "emoji", content: "🦁👑🌅", order: 1 },
    { type: "setting", content: "Animated savanna kingdom.", order: 2 },
    { type: "trivia", content: "Largely inspired by a Shakespeare play.", order: 3 },
    { type: "cast_clue", content: "Stars Matthew Broderick.", order: 4 },
    { type: "crew_clue", content: "Directed by Roger Allers and Rob Minkoff.", order: 5 },
  ];

  test("accepts 5 valid hints", () => {
    const result = validateHints(fiveValid);
    expect(result.ok).toBe(true);
  });

  test("accepts wrapped { hints: [...] } shape", () => {
    const result = validateHints({ hints: fiveValid });
    expect(result.ok).toBe(true);
  });

  test("sorts hints by order ascending", () => {
    const shuffled = [fiveValid[2], fiveValid[0], fiveValid[4], fiveValid[1], fiveValid[3]];
    const result = validateHints(shuffled);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.map((h) => h.order)).toEqual([1, 2, 3, 4, 5]);
    }
  });

  test("rejects wrong count", () => {
    const result = validateHints(fiveValid.slice(0, 4));
    expect(result.ok).toBe(false);
  });

  test("rejects unknown type", () => {
    const bad = fiveValid.map((h, i) =>
      i === 0 ? { ...h, type: "weird_new_type" } : h,
    );
    const result = validateHints(bad);
    expect(result.ok).toBe(false);
  });

  test("rejects duplicate order", () => {
    const bad = fiveValid.map((h, i) => (i === 4 ? { ...h, order: 1 } : h));
    const result = validateHints(bad);
    expect(result.ok).toBe(false);
  });

  test("rejects empty content", () => {
    const bad = fiveValid.map((h, i) => (i === 0 ? { ...h, content: "  " } : h));
    const result = validateHints(bad);
    expect(result.ok).toBe(false);
  });

  test("rejects out-of-range order", () => {
    const bad = fiveValid.map((h, i) => (i === 0 ? { ...h, order: 0 } : h));
    const result = validateHints(bad);
    expect(result.ok).toBe(false);
  });
});
