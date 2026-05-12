// Fuzzy match for movie title guesses. Pure helper, kept Node-free.
//
// Pipeline: lowercase → strip optional trailing year `(YYYY)` → strip leading
// "the/a/an" → strip non-alphanumeric → Levenshtein vs canonical AND aliases.
//
// Default threshold scales with normalized length so very short titles (e.g.
// "It", "Up") don't match unrelated guesses purely by edit distance.

const TRAILING_YEAR_RE = /\s*\(\d{4}\)\s*$/;
const LEADING_ARTICLE_RE = /^(the|a|an)\s+/;

export function normalizeTitle(s: string): string {
  let out = s.trim().toLowerCase();
  out = out.replace(TRAILING_YEAR_RE, "");
  out = out.replace(LEADING_ARTICLE_RE, "");
  out = out.replace(/[^a-z0-9]/g, "");
  return out;
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const m = a.length;
  const n = b.length;
  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

// Length-scaled default so short titles aren't trivially matchable.
export function defaultThreshold(normalizedLen: number): number {
  if (normalizedLen <= 4) return 0;
  if (normalizedLen <= 7) return 1;
  return 2;
}

// Sequel collision guard: when one normalized string is a strict prefix of the
// other and the trailing difference is only digits (e.g. "avengers" vs
// "avengers2"), reject the match. Without this, the length-scaled threshold
// would let "avengers" solve "Avengers 2" and vice versa.
export function isSequelDigitCollision(a: string, b: string): boolean {
  if (a === b) return false;
  const [shorter, longer] = a.length < b.length ? [a, b] : [b, a];
  if (shorter.length === 0) return false;
  if (!longer.startsWith(shorter)) return false;
  const tail = longer.slice(shorter.length);
  return /^\d+$/.test(tail);
}

export type FuzzyMatchOpts = {
  // Override the default length-scaled threshold.
  threshold?: number;
};

// Extracts the "near miss base" from a candidate's original title. Two
// patterns count as a franchise/extension split:
//   - Subtitle after a colon: "Avengers: Endgame" → base "Avengers".
//     Also handles "Pirates of the Caribbean: Dead Man's Chest".
//   - Trailing digit run with a space: "Avengers 2" → base "Avengers".
// Returns null when neither pattern is present — those candidates can't
// produce a near miss because there's no natural franchise boundary.
function extractNearMissBase(
  candidate: string,
): { base: string; subtitle: string } | null {
  const colonIdx = candidate.indexOf(":");
  if (colonIdx > 0) {
    const base = candidate.slice(0, colonIdx).trim();
    const subtitle = candidate.slice(colonIdx + 1).trim();
    if (base.length > 0 && subtitle.length > 0) {
      return { base, subtitle };
    }
  }
  const trailingDigit = candidate.match(/^(.+?)\s+(\d+)\s*$/);
  if (trailingDigit) {
    const base = trailingDigit[1].trim();
    if (base.length > 0) {
      return { base, subtitle: trailingDigit[2] };
    }
  }
  return null;
}

// Detect a "near miss": the guess fuzzy-matches the *franchise base* of a
// candidate (canonical or alias) — e.g. guess "Avengers" vs "Avengers 2",
// or guess "Pirates of the Caribbean" vs "Pirates of the Caribbean: Dead
// Man's Chest". Caller should check this only when fuzzyMatchTitle already
// returned false, so a real match isn't shadowed by a sibling alias.
export function findSequelNearMiss(
  guess: string,
  canonical: string,
  aliases: string[] = [],
): { candidate: string; subtitle: string } | null {
  const ng = normalizeTitle(guess);
  if (ng.length === 0) return null;

  for (const cand of [canonical, ...aliases]) {
    const extracted = extractNearMissBase(cand);
    if (!extracted) continue;
    const nb = normalizeTitle(extracted.base);
    if (nb.length === 0) continue;
    const threshold = defaultThreshold(Math.min(ng.length, nb.length));
    if (levenshtein(ng, nb) <= threshold) {
      return { candidate: cand, subtitle: extracted.subtitle };
    }
  }
  return null;
}

export function fuzzyMatchTitle(
  guess: string,
  canonical: string,
  aliases: string[] = [],
  opts: FuzzyMatchOpts = {},
): boolean {
  const ng = normalizeTitle(guess);
  if (ng.length === 0) return false;

  const candidates = [canonical, ...aliases]
    .map(normalizeTitle)
    .filter((c) => c.length > 0);

  for (const c of candidates) {
    if (isSequelDigitCollision(ng, c)) continue;
    const threshold =
      opts.threshold ?? defaultThreshold(Math.min(ng.length, c.length));
    if (levenshtein(ng, c) <= threshold) return true;
  }
  return false;
}
