import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  applySyncSnapshot,
  createCard,
  deleteCard,
  getAllCardsWithState,
  getDeckStats,
  getDecks,
  getReviews,
  getSyncSnapshot,
  initDb,
  logReviewAt,
  updateCardState,
} from "./db";
import { makeSyncFile, mergeSync } from "./sync";
import type { SyncCard, SyncReview } from "./types";

function remoteCard(overrides: Partial<SyncCard> = {}): SyncCard {
  const t = new Date().toISOString();
  return {
    uid: "remote-1",
    front: "remote front",
    back: "remote back",
    tags: "remote",
    created_at: t,
    updated_at: t,
    deleted_at: null,
    due_at: t,
    interval: 0,
    ease: 2.5,
    reps: 0,
    state: "new",
    stability: 0,
    difficulty: 5,
    state_updated_at: t,
    ...overrides,
  };
}

describe("indexeddb adapter", () => {
  beforeEach(async () => {
    await initDb();
    await applySyncSnapshot({ cards: [], reviews: [] });
  });

  it("seeds a single deck and round-trips cards with state", async () => {
    const decks = await getDecks();
    expect(decks).toHaveLength(1);
    expect(decks[0].name).toBe("Revision");

    const id = await createCard(decks[0].id, "q1", "a1", "dsa");
    const cards = await getAllCardsWithState();
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ id, front: "q1", back: "a1", tags: "dsa", state: "new" });
    expect(cards[0].uid).toBeTruthy();

    const stats = await getDeckStats();
    expect(stats[0]).toMatchObject({ total: 1, newCount: 1, due: 0 });
  });

  it("soft-deletes cards and excludes them from reads but keeps a tombstone in snapshots", async () => {
    const deck = (await getDecks())[0];
    const id = await createCard(deck.id, "q", "a", "");
    await deleteCard(id);
    expect(await getAllCardsWithState()).toHaveLength(0);
    const snap = await getSyncSnapshot();
    expect(snap.cards).toHaveLength(1);
    expect(snap.cards[0].deleted_at).toBeTruthy();
  });

  it("grades persist state and review log with stable uids", async () => {
    const deck = (await getDecks())[0];
    const id = await createCard(deck.id, "q", "a", "");
    const now = new Date().toISOString();
    await updateCardState({ card_id: id, due_at: now, interval: 3, ease: 2.5, reps: 1, state: "review", stability: 3, difficulty: 5, updated_at: now });
    await logReviewAt(id, 3, new Date());
    const cards = await getAllCardsWithState();
    expect(cards[0].state).toBe("review");
    const reviews = await getReviews();
    expect(reviews).toHaveLength(1);
    expect(reviews[0].uid).toBeTruthy();
    const snap = await getSyncSnapshot();
    expect(snap.reviews[0].card_uid).toBe(cards[0].uid);
  });

  it("merges a remote snapshot into the local store", async () => {
    const deck = (await getDecks())[0];
    await createCard(deck.id, "local q", "local a", "");
    const remote = makeSyncFile({ cards: [remoteCard()], reviews: [] }, "revision-sync");
    const local = makeSyncFile(await getSyncSnapshot(), "revision-sync");
    const { merged, stats } = mergeSync(local, remote);
    await applySyncSnapshot(merged);
    const cards = await getAllCardsWithState();
    expect(cards.map((c) => c.front).sort()).toEqual(["local q", "remote front"]);
    expect(stats.added).toBe(1);
  });

  it("applies tombstoned cards from a merge without resurrecting them", async () => {
    const deck = (await getDecks())[0];
    const id = await createCard(deck.id, "local q", "local a", "");
    const localSnap = await getSyncSnapshot();
    const dead = remoteCard({ uid: localSnap.cards[0].uid, deleted_at: new Date(Date.now() + 60_000).toISOString(), updated_at: new Date(Date.now() + 60_000).toISOString() });
    const remote = makeSyncFile({ cards: [dead], reviews: [] }, "revision-sync");
    const local = makeSyncFile(localSnap, "revision-sync");
    const { merged } = mergeSync(local, remote);
    await applySyncSnapshot(merged);
    expect(await getAllCardsWithState()).toHaveLength(0);
    const snap = await getSyncSnapshot();
    expect(snap.cards[0].deleted_at).toBeTruthy();
    expect(id).toBeGreaterThan(0);
  });

  it("unions remote reviews on merge", async () => {
    const deck = (await getDecks())[0];
    const id = await createCard(deck.id, "q", "a", "");
    const localSnap = await getSyncSnapshot();
    const review: SyncReview = { uid: "r-remote", card_uid: localSnap.cards[0].uid, grade: 2, created_at: new Date().toISOString() };
    const remote = makeSyncFile({ cards: [remoteCard({ uid: localSnap.cards[0].uid })], reviews: [review] }, "revision-sync");
    const { merged } = mergeSync(makeSyncFile(localSnap, "revision-sync"), remote);
    await applySyncSnapshot(merged);
    const reviews = await getReviews();
    expect(reviews).toHaveLength(1);
    expect(reviews[0].card_id).toBe(id);
    expect(reviews[0].uid).toBe("r-remote");
  });
});
