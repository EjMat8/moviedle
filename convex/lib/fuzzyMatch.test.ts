import { describe, expect, test } from "vitest";
import {
  defaultThreshold,
  findSequelNearMiss,
  fuzzyMatchTitle,
  levenshtein,
  normalizeTitle,
} from "./fuzzyMatch";

describe("normalizeTitle", () => {
  test("lowercases and strips non-alphanum", () => {
    expect(normalizeTitle("The Dark Knight")).toBe("darkknight");
  });

  test("strips trailing year in parens", () => {
    expect(normalizeTitle("The Matrix (1999)")).toBe("matrix");
  });

  test("trailing year only at end, not embedded", () => {
    expect(normalizeTitle("Blade Runner 2049")).toBe("bladerunner2049");
  });

  test("strips leading article only", () => {
    expect(normalizeTitle("The Theory of Everything")).toBe("theoryofeverything");
    expect(normalizeTitle("A Quiet Place")).toBe("quietplace");
    expect(normalizeTitle("An American Tail")).toBe("americantail");
  });

  test("does not strip middle 'the'", () => {
    expect(normalizeTitle("Pirates of the Caribbean")).toBe("piratesofthecaribbean");
  });

  test("handles colons, dashes, punctuation", () => {
    expect(normalizeTitle("Spider-Man: Into the Spider-Verse")).toBe(
      "spidermanintothespiderverse",
    );
  });

  test("empty / whitespace input becomes empty", () => {
    expect(normalizeTitle("  ")).toBe("");
  });
});

describe("levenshtein", () => {
  test("identical strings → 0", () => {
    expect(levenshtein("matrix", "matrix")).toBe(0);
  });

  test("single substitution", () => {
    expect(levenshtein("matrix", "matrlx")).toBe(1);
  });

  test("insertion + deletion", () => {
    expect(levenshtein("matrix", "matrx")).toBe(1);
    expect(levenshtein("matrix", "matrixs")).toBe(1);
  });

  test("empty vs nonempty", () => {
    expect(levenshtein("", "abc")).toBe(3);
    expect(levenshtein("abc", "")).toBe(3);
  });
});

describe("defaultThreshold", () => {
  test("very short → exact", () => {
    expect(defaultThreshold(2)).toBe(0);
    expect(defaultThreshold(4)).toBe(0);
  });

  test("medium → 1", () => {
    expect(defaultThreshold(5)).toBe(1);
    expect(defaultThreshold(7)).toBe(1);
  });

  test("long → 2", () => {
    expect(defaultThreshold(8)).toBe(2);
    expect(defaultThreshold(20)).toBe(2);
  });
});

describe("fuzzyMatchTitle", () => {
  test("exact match", () => {
    expect(fuzzyMatchTitle("The Matrix", "The Matrix", [])).toBe(true);
  });

  test("guess with leading article matches canonical without", () => {
    expect(fuzzyMatchTitle("Matrix", "The Matrix", [])).toBe(true);
    expect(fuzzyMatchTitle("The Matrix", "Matrix", [])).toBe(true);
  });

  test("guess with trailing year matches", () => {
    expect(fuzzyMatchTitle("The Matrix (1999)", "The Matrix", [])).toBe(true);
  });

  test("typo within threshold matches long title", () => {
    expect(fuzzyMatchTitle("Inteerstellar", "Interstellar", [])).toBe(true);
  });

  test("typo over threshold misses", () => {
    expect(fuzzyMatchTitle("Intxxxellar", "Interstellar", [])).toBe(false);
  });

  test("matches an alias", () => {
    expect(
      fuzzyMatchTitle("Endgame", "Avengers: Endgame", ["Endgame"]),
    ).toBe(true);
  });

  test("short-title guard: 'us' should not match 'it'", () => {
    expect(fuzzyMatchTitle("us", "It", [])).toBe(false);
  });

  test("short-title guard: still allows exact match", () => {
    expect(fuzzyMatchTitle("It", "It", [])).toBe(true);
  });

  test("punctuation/case differences are ignored", () => {
    expect(
      fuzzyMatchTitle(
        "spider-man into the spiderverse",
        "Spider-Man: Into the Spider-Verse",
        [],
      ),
    ).toBe(true);
  });

  test("empty guess returns false", () => {
    expect(fuzzyMatchTitle("", "The Matrix", [])).toBe(false);
    expect(fuzzyMatchTitle("   ", "The Matrix", [])).toBe(false);
  });

  test("threshold override is respected", () => {
    // "matrxxx" vs "matrix" = distance 3, would normally fail; with threshold 3 it passes.
    expect(fuzzyMatchTitle("matrxxx", "matrix", [], { threshold: 3 })).toBe(true);
  });

  describe("sequel digit collision guard", () => {
    test("franchise name does not match numbered sequel", () => {
      expect(fuzzyMatchTitle("Avengers", "Avengers 2", [])).toBe(false);
      expect(fuzzyMatchTitle("Iron Man", "Iron Man 3", [])).toBe(false);
      expect(fuzzyMatchTitle("Fast", "Fast 5", [])).toBe(false);
    });

    test("numbered sequel still matches itself exactly", () => {
      expect(fuzzyMatchTitle("Avengers 2", "Avengers 2", [])).toBe(true);
      expect(fuzzyMatchTitle("Iron Man 3", "Iron Man 3", [])).toBe(true);
    });

    test("wrong sequel number does not solve the original", () => {
      expect(fuzzyMatchTitle("Avengers 2", "Avengers", [])).toBe(false);
    });

    test("sequel guard also applies through aliases", () => {
      expect(
        fuzzyMatchTitle("Avengers", "Avengers: Age of Ultron", ["Avengers 2"]),
      ).toBe(false);
    });

    test("non-digit suffix unaffected (still matches via threshold rules)", () => {
      // "the matrix" vs "the matrix reloaded" — distance is way beyond threshold,
      // so this still fails, but for the *threshold* reason, not the prefix guard.
      expect(fuzzyMatchTitle("matrix", "Matrix Reloaded", [])).toBe(false);
    });
  });
});

describe("findSequelNearMiss", () => {
  test("guess matches base of numbered canonical", () => {
    const hit = findSequelNearMiss("Avengers", "Avengers 2", []);
    expect(hit?.candidate).toBe("Avengers 2");
    expect(hit?.digits).toBe("2");
  });

  test("guess matches base of numbered alias", () => {
    const hit = findSequelNearMiss("Avengers", "Avengers: Age of Ultron", [
      "Avengers 2",
    ]);
    expect(hit?.candidate).toBe("Avengers 2");
    expect(hit?.digits).toBe("2");
  });

  test("typo within threshold still triggers near miss", () => {
    const hit = findSequelNearMiss("Avengres", "Avengers 3", []);
    expect(hit?.candidate).toBe("Avengers 3");
  });

  test("typing the sequel number when answer has none does NOT trigger", () => {
    expect(findSequelNearMiss("Avengers 2", "Avengers", [])).toBeNull();
  });

  test("candidate without trailing digits does not trigger", () => {
    expect(findSequelNearMiss("Matrix", "Matrix Reloaded", [])).toBeNull();
  });

  test("leading article on guess still resolves", () => {
    const hit = findSequelNearMiss("The Avengers", "Avengers 2", []);
    expect(hit?.candidate).toBe("Avengers 2");
  });

  test("empty guess returns null", () => {
    expect(findSequelNearMiss("", "Avengers 2", [])).toBeNull();
  });

  test("multi-digit sequel number captured", () => {
    const hit = findSequelNearMiss("Rocky", "Rocky 12", []);
    expect(hit?.digits).toBe("12");
  });
});
