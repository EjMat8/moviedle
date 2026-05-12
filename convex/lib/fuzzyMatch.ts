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

// Splits a trailing digit run off a normalized title. Returns null when
// the string is all digits or has no trailing digits — neither case is
// meaningful for sequel-base matching.
function stripTrailingDigits(s: string): { base: string; digits: string } | null {
  const m = s.match(/^(.+?)(\d+)$/);
  if (!m) return null;
  return { base: m[1], digits: m[2] };
}

// Detect a "sequel near miss": the guess fuzzy-matches the *base* portion
// of a numbered candidate (canonical or alias) — e.g. guess "Avengers"
// vs candidate "Avengers 2". Only fires when the candidate has a trailing
// digit run; typing the numbered sequel for a base title never triggers.
// Caller should check this only when fuzzyMatchTitle already returned
// false, so a real exact/typo match isn't shadowed by a sibling alias.
export function findSequelNearMiss(
  guess: string,
  canonical: string,
  aliases: string[] = [],
): { candidate: string; digits: string } | null {
  const ng = normalizeTitle(guess);
  if (ng.length === 0) return null;

  for (const cand of [canonical, ...aliases]) {
    const nc = normalizeTitle(cand);
    const stripped = stripTrailingDigits(nc);
    if (!stripped) continue;
    if (stripped.base.length === 0) continue;
    const threshold = defaultThreshold(
      Math.min(ng.length, stripped.base.length),
    );
    if (levenshtein(ng, stripped.base) <= threshold) {
      return { candidate: cand, digits: stripped.digits };
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
