// Lightweight fuzzy matching for the command bar (subsequence scoring).

export function fuzzyScore(query: string, target: string): number | null {
  const q = query.toLowerCase().trim();
  const t = target.toLowerCase();
  if (!q) return 0;
  if (t.includes(q)) return 100 - t.length + q.length * 2;

  let qi = 0;
  let score = 0;
  let streak = 0;
  let prev = -2;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      const gap = ti - prev;
      if (gap === 1) streak += 4;
      else if (gap === 2) streak += 2;
      streak = Math.max(streak, gap <= 2 ? streak : 1);
      score += 10 + streak;
      if (ti === 0 || t[ti - 1] === " ") score += 12;
      prev = ti;
      qi++;
    }
  }
  if (qi < q.length) return null;
  score -= Math.max(0, t.length - q.length);
  return score;
}

export type FuzzyResult<T> = { item: T; score: number };

export function fuzzySearch<T>(query: string, items: T[], pick: (t: T) => string, limit = 8): FuzzyResult<T>[] {
  const scored: FuzzyResult<T>[] = [];
  for (const item of items) {
    const s = fuzzyScore(query, pick(item));
    if (s !== null) scored.push({ item, score: s });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}