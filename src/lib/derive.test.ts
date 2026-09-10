import { describe, expect, it } from "vitest";
import { heatGrid, lapseMap, localDateKey, queueBuckets, scopeCards, smartFilterCards, smartFilterCount, streakLength } from "./derive";
import { nextState } from "./fsrs";
import type { CardWithState, ReviewRow } from "./types";

let nextId = 1;

function card(overrides: Partial<CardWithState> = {}): CardWithState {
  const now = new Date().toISOString();
  return {
    id: nextId++,
    deck_id: 1,
    front: `card ${nextId}`,
    back: "a",
    tags: "dsa",
    created_at: now,
    updated_at: now,
    deck_name: "Revision",
    state: "review",
    due_at: now,
    interval: 3,
    ease: 2.5,
    reps: 2,
    stability: 3,
    difficulty: 5,
    ...overrides,
  };
}

describe("derive", () => {
  it("does not list a due learning card twice in the queue", () => {
    const learning = card({ state: "learning", due_at: new Date(Date.now() - 60_000).toISOString() });
    const due = card({ state: "review" });
    const fresh = card({ state: "new" });
    const queue = scopeCards([learning, due, fresh], { kind: "all" }, new Map());
    const ids = queue.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe(learning.id);
  });

  it("excludes suspended cards from study queues and smart filters", () => {
    const suspended = card({ tags: "dsa, suspended" });
    const normal = card();
    expect(smartFilterCards([suspended, normal], "due", new Map())).toHaveLength(1);
    expect(scopeCards([suspended, normal], { kind: "all" }, new Map())).toHaveLength(1);
  });

  it("filters stuck cards below 80% retrievability", () => {
    const stale = card({ stability: 1, updated_at: new Date(Date.now() - 10 * 86_400_000).toISOString() });
    const strong = card({ stability: 1000 });
    expect(smartFilterCards([stale, strong], "stuck", new Map())).toEqual([stale]);
  });

  it("detects leeches from repeated lapses", () => {
    const a = card();
    const b = card();
    const reviews = [
      ...Array.from({ length: 6 }, () => ({ id: 0, card_id: a.id, grade: 1, created_at: new Date().toISOString() })),
      ...Array.from({ length: 2 }, () => ({ id: 0, card_id: b.id, grade: 1, created_at: new Date().toISOString() })),
    ];
    const lapses = lapseMap(reviews);
    expect(smartFilterCards([a, b], "leeches", new Map(), lapses)).toEqual([a]);
    expect(smartFilterCount([a, b], "leeches", new Map(), lapses)).toBe(1);
  });

  it("applies daily limits to due and new when scoping", () => {
    const dueCards = [card(), card(), card()];
    const newCards = [card({ state: "new" }), card({ state: "new" })];
    const queue = scopeCards([...dueCards, ...newCards], { kind: "all" }, new Map(), { newLimit: 1, reviewLimit: 2 });
    expect(queue.filter((c) => c.state === "review")).toHaveLength(2);
    expect(queue.filter((c) => c.state === "new")).toHaveLength(1);
  });

  it("can scope an explicit card list", () => {
    const a = card();
    const b = card();
    const queue = scopeCards([a, b], { kind: "cards", ids: [b.id] }, new Map());
    expect(queue.map((c) => c.id)).toEqual([b.id]);
  });

  it("uses local calendar days for heatmap and streaks", () => {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 86_400_000);
    const reviews: ReviewRow[] = [
      { id: 1, card_id: 1, grade: 3, created_at: now.toISOString() },
      { id: 2, card_id: 1, grade: 3, created_at: yesterday.toISOString() },
    ];
    const { cells, counts } = heatGrid(reviews, 4);
    expect(counts.get(localDateKey(now))).toBe(1);
    expect(counts.get(localDateKey(yesterday))).toBe(1);
    const today = cells.find((c) => localDateKey(c.date) === localDateKey(now));
    expect(today?.count).toBe(1);
    expect(streakLength(reviews)).toBe(2);
  });

  it("breaks the streak on a missing day", () => {
    const twoDaysAgo: ReviewRow[] = [
      { id: 1, card_id: 1, grade: 3, created_at: new Date(Date.now() - 2 * 86_400_000).toISOString() },
    ];
    expect(streakLength(twoDaysAgo)).toBe(0);
  });

  it("counts overdue cards in the today bucket", () => {
    const overdue = card({ due_at: new Date(Date.now() - 3 * 86_400_000).toISOString() });
    const soon = card({ due_at: new Date(Date.now() + 5 * 86_400_000).toISOString() });
    const buckets = queueBuckets([overdue, soon]);
    expect(buckets[0].count).toBe(1);
    expect(buckets.find((b) => b.label === "≤7d")?.count).toBe(1);
  });

  it("produces growing intervals through the scheduler for queue ordering", () => {
    const first = nextState({ ...card(), card_id: 1, state: "new", reps: 0, stability: 0, interval: 0 }, 3);
    const second = nextState({ ...first, card_id: 1, updated_at: new Date(Date.now() - 5 * 86_400_000).toISOString() }, 3);
    expect(second.stability).toBeGreaterThan(first.stability);
  });
});
