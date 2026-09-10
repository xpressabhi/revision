import { describe, expect, it } from "vitest";
import { makeSyncFile, mergeSync, parseSyncFile } from "./sync";
import type { SyncCard, SyncFile, SyncReview } from "./types";

let seq = 0;
const BASE = Date.UTC(2025, 0, 1);

function at(step: number): string {
  return new Date(BASE + step * 60_000).toISOString();
}

function sc(overrides: Partial<SyncCard> = {}): SyncCard {
  const n = ++seq;
  return {
    uid: `card-${n}`,
    front: `front ${n}`,
    back: `back ${n}`,
    tags: "",
    created_at: at(0),
    updated_at: at(0),
    deleted_at: null,
    due_at: at(0),
    interval: 0,
    ease: 2.5,
    reps: 0,
    state: "new",
    stability: 0,
    difficulty: 5,
    state_updated_at: at(0),
    ...overrides,
  };
}

function sr(cardUid: string, overrides: Partial<SyncReview> = {}): SyncReview {
  const n = ++seq;
  return { uid: `review-${n}`, card_uid: cardUid, grade: 3, created_at: at(n), ...overrides };
}

function file(cards: SyncCard[], reviews: SyncReview[] = []): SyncFile {
  return makeSyncFile({ cards, reviews }, "revision-sync");
}

describe("mergeSync", () => {
  it("adds cards and reviews that only exist remotely", () => {
    const remoteCard = sc();
    const local = file([]);
    const remote = file([remoteCard], [sr(remoteCard.uid)]);
    const { merged, stats } = mergeSync(local, remote);
    expect(merged.cards).toHaveLength(1);
    expect(merged.cards[0].uid).toBe(remoteCard.uid);
    expect(merged.reviews).toHaveLength(1);
    expect(stats.added).toBe(1);
    expect(stats.reviewsAdded).toBe(1);
  });

  it("keeps the newest content edit and the newest scheduling state independently", () => {
    const localCard = sc({ front: "local edit", updated_at: at(10), due_at: at(1), state_updated_at: at(1) });
    const remoteCard = sc({ uid: localCard.uid, front: "remote edit", updated_at: at(5), due_at: at(9), state_updated_at: at(9) });
    const { merged, stats } = mergeSync(file([localCard]), file([remoteCard]));
    expect(merged.cards[0].front).toBe("local edit");
    expect(merged.cards[0].due_at).toBe(at(9));
    expect(stats.updated).toBe(1);
  });

  it("lets the other device's newer edit win", () => {
    const localCard = sc({ front: "old", updated_at: at(1) });
    const remoteCard = sc({ uid: localCard.uid, front: "new", updated_at: at(8) });
    const { merged } = mergeSync(file([localCard]), file([remoteCard]));
    expect(merged.cards[0].front).toBe("new");
  });

  it("propagates deletions when the tombstone is newer than the other side's last edit", () => {
    const localCard = sc({ updated_at: at(2) });
    const remoteCard = sc({ uid: localCard.uid, updated_at: at(9), deleted_at: at(9) });
    const { merged, stats } = mergeSync(file([localCard]), file([remoteCard]));
    expect(merged.cards[0].deleted_at).toBe(at(9));
    expect(stats.deleted).toBe(1);
  });

  it("resurrects a card when the other side edited it after the deletion", () => {
    const localCard = sc({ updated_at: at(9), deleted_at: at(9) });
    const remoteCard = sc({ uid: localCard.uid, front: "back from the dead", updated_at: at(12) });
    const { merged, stats } = mergeSync(file([localCard]), file([remoteCard]));
    expect(merged.cards[0].deleted_at).toBeNull();
    expect(merged.cards[0].front).toBe("back from the dead");
    expect(stats.restored).toBe(1);
  });

  it("keeps a deletion when both sides deleted", () => {
    const localCard = sc({ updated_at: at(4), deleted_at: at(4) });
    const remoteCard = sc({ uid: localCard.uid, updated_at: at(6), deleted_at: at(6) });
    const { merged } = mergeSync(file([localCard]), file([remoteCard]));
    expect(merged.cards[0].deleted_at).toBe(at(6));
  });

  it("unions reviews by uid and skips reviews of deleted or unknown cards", () => {
    const live = sc();
    const tomb = sc({ updated_at: at(20), deleted_at: at(20) });
    const shared = sr(live.uid);
    const remoteExtra = sr(live.uid);
    const orphan = sr("missing-card");
    const forTomb = sr(tomb.uid);
    const { merged, stats } = mergeSync(file([live, tomb], [shared]), file([live, tomb], [shared, remoteExtra, orphan, forTomb]));
    expect(merged.reviews.map((r) => r.uid).sort()).toEqual([shared.uid, remoteExtra.uid].sort());
    expect(stats.reviewsAdded).toBe(1);
  });

  it("counts conflicting edits on both sides", () => {
    const localCard = sc({ front: "left", updated_at: at(5), created_at: at(0) });
    const remoteCard = sc({ uid: localCard.uid, front: "right", updated_at: at(6), created_at: at(0) });
    const { stats } = mergeSync(file([localCard]), file([remoteCard]));
    expect(stats.conflicts).toBe(1);
  });

  it("is idempotent: merging the merged file again changes nothing", () => {
    const a = sc({ front: "a", updated_at: at(3) });
    const b = sc({ front: "b", updated_at: at(1) });
    const first = mergeSync(file([a, b]), file([b])).merged;
    const second = mergeSync(first, file([a, b]));
    expect(second.stats.added).toBe(0);
    expect(second.stats.reviewsAdded).toBe(0);
    expect(second.merged.cards).toEqual(first.cards);
  });
});

describe("parseSyncFile", () => {
  it("normalizes missing fields defensively", () => {
    const parsed = parseSyncFile(JSON.stringify({ version: 2, cards: [{ front: "q" }], reviews: [] }));
    expect(parsed.cards[0].uid).toBeTruthy();
    expect(parsed.cards[0].state).toBe("new");
    expect(parsed.cards[0].deleted_at).toBeNull();
  });
});
