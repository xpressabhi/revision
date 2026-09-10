import { getAllCardsWithState, getReviews } from "./db";
import type { BackupFile } from "./types";

const LS_AUTOBACKUP = "recall_autobackup";

export async function buildBackup(): Promise<BackupFile> {
  const [cards, reviews] = await Promise.all([getAllCardsWithState(), getReviews()]);
  return { version: 1, exported_at: new Date().toISOString(), cards, reviews };
}

export function downloadBackup(backup: BackupFile): void {
  const blob = new Blob([JSON.stringify(backup)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `revision-backup-${backup.exported_at.slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Snapshot before destructive actions (clear, dedupe, restore). */
export async function saveAutoBackup(): Promise<void> {
  try {
    const backup = await buildBackup();
    localStorage.setItem(LS_AUTOBACKUP, JSON.stringify(backup));
  } catch {}
}

export function autoBackupAt(): string | null {
  try {
    const raw = localStorage.getItem(LS_AUTOBACKUP);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BackupFile;
    return parsed.exported_at ?? null;
  } catch {
    return null;
  }
}

export function loadAutoBackup(): BackupFile | null {
  try {
    const raw = localStorage.getItem(LS_AUTOBACKUP);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BackupFile;
    if (!Array.isArray(parsed.cards) || !Array.isArray(parsed.reviews)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function parseBackupFile(text: string): BackupFile {
  const parsed = JSON.parse(text) as BackupFile;
  if (!parsed || !Array.isArray(parsed.cards) || !Array.isArray(parsed.reviews)) {
    throw new Error("Not a Revision backup file");
  }
  return parsed;
}
