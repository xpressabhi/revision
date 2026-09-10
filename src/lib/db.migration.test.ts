import "fake-indexeddb/auto";
import { describe, expect, it, vi } from "vitest";

describe("legacy localStorage migration", () => {
  it("imports old revision_* data into IndexedDB, assigns uids and clears the old keys", async () => {
    const store = new Map<string, string>();
    store.set("revision_decks", JSON.stringify([{ id: 1, name: "Revision", created_at: "2025-01-01T00:00:00.000Z" }]));
    store.set(
      "revision_cards",
      JSON.stringify([
        {
          id: 1,
          deck_id: 1,
          front: "legacy q",
          back: "legacy a",
          tags: "old",
          created_at: "2025-01-01T00:00:00.000Z",
          updated_at: "2025-01-02T00:00:00.000Z",
        },
      ])
    );
    store.set(
      "revision_states",
      JSON.stringify([
        { card_id: 1, due_at: "2025-01-02T00:00:00.000Z", interval: 0, ease: 2.5, reps: 0, state: "new", updated_at: "2025-01-02T00:00:00.000Z" },
      ])
    );
    store.set("revision_reviews", JSON.stringify([{ id: 1, card_id: 1, grade: 3, created_at: "2025-01-02T00:00:00.000Z" }]));
    store.set("revision_seq", JSON.stringify({ decks: 1, cards: 1, reviews: 1, states: 1 }));

    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });

    const db = await import("./db");
    await db.initDb();
    const cards = await db.getAllCardsWithState();
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ front: "legacy q", state: "new" });
    expect(cards[0].uid).toBeTruthy();
    expect(cards[0].stability).toBe(0);
    expect(cards[0].difficulty).toBe(5);
    const reviews = await db.getReviews();
    expect(reviews).toHaveLength(1);
    expect(reviews[0].uid).toBeTruthy();
    expect(store.has("revision_cards")).toBe(false);
    expect(store.has("revision_reviews")).toBe(false);
  });
});
