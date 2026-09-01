// Pure derivation helpers: tag-tree decks, smart filters, study queues,
// heatmap grids, streaks, retention forecasts, queue buckets.

import type { CardWithState, ReviewRow } from "./types";
import { cardRetrievability } from "./fsrs";

export type TagNode = {
  root: string;
  child: string | null;
  full: string;
  total: number;
  due: number;
  newCount: number;
  learning: number;
  rAvg: number | null;
};

/** Build a two-level "deck" tree from card tags (a>b conventions). */
export function buildTagTree(cards: CardWithState[], lastReview: Map<number, string>): TagNode[] {
  const groups = new Map<string, Map<string | null, CardWithState[]>>();
  for (const c of cards) {
    const tags = c.tags.split(",").map((t) => t.trim()).filter((t) => t && !t.includes("suspended"));
    if (!tags.length) continue;
    const [root, ...rest] = tags[0].split(">");
    if (!root) continue;
    if (!groups.has(root)) groups.set(root, new Map());
    const child = rest.length ? rest.join(">") : null;
    if (!groups.get(root)!.has(child)) groups.get(root)!.set(child, []);
    groups.get(root)!.get(child)!.push(c);
  }
  const statsOf = (list: CardWithState[]) => {
    let total = 0;
    let due = 0;
    let newCount = 0;
    let learning = 0;
    const rs: number[] = [];
    for (const c of list) {
      total++;
      if (c.state === "new") {
        newCount++;
        continue;
      }
      if (c.state === "learning") learning++;
      if (new Date(c.due_at).getTime() <= Date.now()) due++;
      const r = cardRetrievability(c, lastReview.get(c.id));
      if (r !== null) rs.push(r);
    }
    return { total, due, newCount, learning, rAvg: rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null };
  };
  const nodes: TagNode[] = [];
  for (const [root, children] of groups) {
    const all: CardWithState[] = [];
    for (const list of children.values()) all.push(...list);
    nodes.push({ root, child: null, full: root, ...statsOf(all) });
    for (const [child, list] of children) {
      if (child === null) continue;
      nodes.push({ root, child, full: `${root}>${child}`, ...statsOf(list) });
    }
  }
  return nodes.sort((a, b) => b.total - a.total);
}

export type SmartFilterId = "due" | "new" | "learning" | "stuck";

export function smartFilterCards(cards: CardWithState[], id: SmartFilterId, lastReview: Map<number, string>): CardWithState[] {
  const now = Date.now();
  return cards.filter((c) => {
    if (c.tags.includes("suspended")) return false;
    switch (id) {
      case "due":
        return c.state !== "new" && new Date(c.due_at).getTime() <= now;
      case "new":
        return c.state === "new";
      case "learning":
        return c.state === "learning" || (c.state === "review" && c.interval < 1);
      case "stuck": {
        if (c.state === "new") return false;
        const r = cardRetrievability(c, lastReview.get(c.id));
        return r !== null && r < 0.8;
      }
    }
  });
}

export function smartFilterCount(cards: CardWithState[], id: SmartFilterId, lastReview: Map<number, string>): number {
  return smartFilterCards(cards, id, lastReview).length;
}

export type StudyScope = { kind: "all" } | { kind: "group"; group: string } | { kind: "smart"; id: SmartFilterId };

export function scopeCards(cards: CardWithState[], scope: StudyScope, lastReview: Map<number, string>): CardWithState[] {
  let pool = cards.filter((c) => !c.tags.includes("suspended"));
  if (scope.kind === "group") {
    const g = scope.group;
    pool = pool.filter((c) => c.tags.split(",").some((t) => t.trim().toLowerCase().startsWith(g.toLowerCase())));
  } else if (scope.kind === "smart") {
    pool = smartFilterCards(pool, scope.id, lastReview);
  }
  const now = Date.now();
  const learning = pool.filter((c) => c.state === "learning").sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime());
  const due = pool.filter((c) => c.state !== "new" && new Date(c.due_at).getTime() <= now).sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime());
  const fresh = pool.filter((c) => c.state === "new").sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()).slice(0, 20);
  return [...learning, ...due, ...fresh];
}

export function lastReviewMap(reviews: ReviewRow[]): Map<number, string> {
  const m = new Map<number, string>();
  for (const r of reviews) {
    const prev = m.get(r.card_id);
    if (!prev || r.created_at > prev) m.set(r.card_id, r.created_at);
  }
  return m;
}

/** GitHub-style 7×53 grid; level 0..4. */
export type HeatCell = { date: Date; count: number; level: 0 | 1 | 2 | 3 | 4 };
export function heatGrid(reviews: ReviewRow[], weeks = 53): { cells: HeatCell[]; counts: Map<string, number> } {
  const counts = new Map<string, number>();
  for (const r of reviews) {
    const d = new Date(r.created_at);
    if (d.getTime() < Date.now() - weeks * 7 * 86_400_000) continue;
    if (d.getTime() > Date.now()) continue;
    const key = d.toISOString().slice(0, 10);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  const start = new Date(end.getTime() - (weeks * 7 - 1) * 86_400_000);
  const cells: HeatCell[] = [];
  for (let i = 0; i < weeks * 7; i++) {
    const date = new Date(start.getTime() + i * 86_400_000);
    const key = date.toISOString().slice(0, 10);
    const count = counts.get(key) ?? 0;
    const level: HeatCell["level"] = count === 0 ? 0 : count < 5 ? 1 : count < 13 ? 2 : count < 25 ? 3 : 4;
    cells.push({ date, count, level });
  }
  return { cells, counts };
}

export function streakLength(reviews: ReviewRow[]): number {
  const days = new Set(reviews.map((r) => new Date(r.created_at).toISOString().slice(0, 10)));
  let streak = 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  if (!days.has(cursor.toISOString().slice(0, 10))) cursor.setDate(cursor.getDate() - 1);
  while (days.has(cursor.toISOString().slice(0, 10))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/** Average projected retrievability of all cards over the next `days` days. */
export function retentionForecast(cards: CardWithState[], lastReview: Map<number, string>, days = 30): { day: number; r: number | null }[] {
  const tracked = cards.filter((c) => c.state !== "new" && c.stability > 0 && !c.tags.includes("suspended"));
  const out: { day: number; r: number | null }[] = [];
  for (let d = 0; d <= days; d++) {
    const sums: number[] = [];
    for (const c of tracked) {
      const anchor = lastReview.get(c.id) ?? c.updated_at;
      const t = Math.max(0, (Date.now() + d * 86_400_000 - new Date(anchor).getTime()) / 86_400_000);
      const factor = Math.pow(1 + (19 / 81) * (t / c.stability), -0.5);
      sums.push(factor);
    }
    out.push({ day: d, r: sums.length ? sums.reduce((a, b) => a + b, 0) / sums.length : null });
  }
  return out;
}

/** Due-queue buckets for the forecast chart. */
export function queueBuckets(cards: CardWithState[]): { label: string; count: number; days: number }[] {
  const now = Date.now();
  const bounds = [0, 1, 3, 7, 14, 30, 90, Infinity];
  const labels = ["Today", "1d", "3d", "7d", "14d", "30d", "90d", "90d+"];
  const active = cards.filter((c) => c.state !== "new" && !c.tags.includes("suspended"));
  return bounds.slice(0, -1).map((b, i) => {
    const count = active.filter((c) => {
      const t = new Date(c.due_at).getTime() - now;
      const d = Math.max(0, t / 86_400_000);
      return d < bounds[i + 1] && d >= b;
    }).length;
    return { label: labels[i], count, days: bounds[i + 1] };
  });
}

export function reviewsPerDay(reviews: ReviewRow[], days: number): { label: string; count: number; date: Date }[] {
  const out: { label: string; count: number; date: Date }[] = [];
  const counts = new Map<string, number>();
  for (const r of reviews) {
    const d = new Date(r.created_at);
    if (d.getTime() < Date.now() - (days - 1) * 86_400_000) continue;
    const key = d.toISOString().slice(0, 10);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - i);
    const key = date.toISOString().slice(0, 10);
    out.push({ label: date.toLocaleDateString(undefined, { month: "short", day: "numeric" }), count: counts.get(key) ?? 0, date });
  }
  return out;
}

export function gradeShare(reviews: ReviewRow[]): { grade: number; count: number }[] {
  const counts = new Map<number, number>();
  for (const r of reviews) counts.set(r.grade, (counts.get(r.grade) ?? 0) + 1);
  return [1, 2, 3, 4].map((g) => ({ grade: g, count: counts.get(g) ?? 0 }));
}

export function recentReviews(reviews: ReviewRow[], limit = 10): ReviewRow[] {
  return [...reviews].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit);
}

export function firstTag(card: CardWithState): string {
  const t = card.tags.split(",")[0]?.trim() ?? "";
  return t.split(">")[0] ?? t;
}