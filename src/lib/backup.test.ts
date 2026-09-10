import { describe, expect, it } from "vitest";
import { parseBackupFile } from "./backup";
import { makeSyncFile, parseSyncFile } from "./sync";
import type { CardWithState, SyncFile } from "./types";

function currentBackup(): SyncFile {
  return makeSyncFile({ cards: [], reviews: [] }, "revision-backup");
}

const legacyCard: CardWithState = {
  id: 7,
  uid: "ignored",
  deck_id: 1,
  front: "q",
  back: "a",
  tags: "dsa",
  created_at: "2025-01-01T00:00:00.000Z",
  updated_at: "2025-01-02T00:00:00.000Z",
  deleted_at: null,
  state: "review",
  due_at: "2025-01-10T00:00:00.000Z",
  interval: 3,
  ease: 2.5,
  reps: 2,
  stability: 3,
  difficulty: 5,
};

describe("backup", () => {
  it("parses a current v2 backup", () => {
    const parsed = parseBackupFile(JSON.stringify(currentBackup()));
    expect(parsed.version).toBe(2);
    expect(parsed.cards).toEqual([]);
    expect(parsed.kind).toBe("revision-backup");
  });

  it("upgrades legacy v1 backups: cards get uids, reviews map to card uids", () => {
    const legacy = {
      version: 1,
      exported_at: "2025-01-03T00:00:00.000Z",
      cards: [{ ...legacyCard, uid: undefined }],
      reviews: [{ id: 1, card_id: 7, grade: 3, created_at: "2025-01-02T10:00:00.000Z" }],
    };
    const parsed = parseSyncFile(JSON.stringify(legacy));
    expect(parsed.version).toBe(2);
    expect(parsed.cards).toHaveLength(1);
    expect(parsed.cards[0].uid).toBeTruthy();
    expect(parsed.cards[0].deleted_at).toBeNull();
    expect(parsed.cards[0].state_updated_at).toBe(legacyCard.updated_at);
    expect(parsed.reviews).toHaveLength(1);
    expect(parsed.reviews[0].card_uid).toBe(parsed.cards[0].uid);
    expect(parsed.reviews[0].uid).toBeTruthy();
  });

  it("rejects files that are not backups", () => {
    expect(() => parseBackupFile("{}")).toThrow();
    expect(() => parseBackupFile('{"cards": []}')).toThrow();
    expect(() => parseBackupFile("not json")).toThrow();
  });
});
