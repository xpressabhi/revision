import { describe, expect, it } from "vitest";
import { parseBackupFile } from "./backup";
import type { BackupFile } from "./types";

function emptyBackup(): BackupFile {
  return { version: 1, exported_at: new Date().toISOString(), cards: [], reviews: [] };
}

describe("backup", () => {
  it("parses a valid backup", () => {
    const parsed = parseBackupFile(JSON.stringify(emptyBackup()));
    expect(parsed.version).toBe(1);
    expect(parsed.cards).toEqual([]);
  });

  it("rejects files that are not backups", () => {
    expect(() => parseBackupFile("{}")).toThrow();
    expect(() => parseBackupFile('{"cards": []}')).toThrow();
    expect(() => parseBackupFile("not json")).toThrow();
  });
});
