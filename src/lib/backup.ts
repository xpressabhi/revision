import { getSyncSnapshot } from "./db";
import { makeSyncFile, parseSyncFile } from "./sync";
import type { BackupFile } from "./types";

const LS_AUTOBACKUP = "recall_autobackup";

export async function buildBackup(): Promise<BackupFile> {
  return makeSyncFile(await getSyncSnapshot(), "revision-backup");
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
    return parseSyncFile(raw);
  } catch {
    return null;
  }
}

/** Accepts current files and legacy v1 backups; returns the normalized v2 shape. */
export function parseBackupFile(text: string): BackupFile {
  return parseSyncFile(text);
}
