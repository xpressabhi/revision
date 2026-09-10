import { isTauriRuntime } from "./platform";
import { applySyncSnapshot, getSyncSnapshot } from "./db";
import { makeSyncFile, mergeSync, parseSyncFile, type MergeStats } from "./sync";
import type { SyncFile } from "./types";

const LS_SYNC_PATH = "recall_sync_path";
const LS_SYNC_AT = "recall_sync_at";
const HANDLE_DB = "revision-sync";
const HANDLE_STORE = "handles";
const HANDLE_KEY = "sync-file";

export type SyncMode = "desktop" | "web-file" | "download";

export type SyncTargetInfo = {
  mode: SyncMode;
  label: string | null;
  canAttach: boolean;
};

type FsFileHandle = {
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
  queryPermission?(opts: { mode: "read" | "readwrite" }): Promise<PermissionState>;
  requestPermission?(opts: { mode: "read" | "readwrite" }): Promise<PermissionState>;
};

type PickerWindow = Window & {
  showSaveFilePicker?: (opts?: unknown) => Promise<FsFileHandle>;
};

function pickerWindow(): PickerWindow | null {
  return typeof window !== "undefined" ? (window as PickerWindow) : null;
}

export function webFilePickerSupported(): boolean {
  return !!pickerWindow()?.showSaveFilePicker;
}

// ── web file handle persistence ────────────────────────────────────
function openHandleDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    const req = indexedDB.open(HANDLE_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(HANDLE_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

async function idbGet<T>(db: IDBDatabase, key: string): Promise<T | null> {
  return new Promise((resolve) => {
    const req = db.transaction(HANDLE_STORE, "readonly").objectStore(HANDLE_STORE).get(key);
    req.onsuccess = () => resolve((req.result as T) ?? null);
    req.onerror = () => resolve(null);
  });
}

async function idbPut(db: IDBDatabase, key: string, value: unknown): Promise<void> {
  return new Promise((resolve) => {
    const tx = db.transaction(HANDLE_STORE, "readwrite");
    tx.objectStore(HANDLE_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

async function idbDelete(db: IDBDatabase, key: string): Promise<void> {
  return new Promise((resolve) => {
    const tx = db.transaction(HANDLE_STORE, "readwrite");
    tx.objectStore(HANDLE_STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

async function getHandle(): Promise<FsFileHandle | null> {
  const db = await openHandleDb();
  if (!db) return null;
  const handle = await idbGet<FsFileHandle>(db, HANDLE_KEY);
  db.close();
  return handle;
}

async function setHandle(handle: FsFileHandle | null): Promise<void> {
  const db = await openHandleDb();
  if (!db) return;
  if (handle) await idbPut(db, HANDLE_KEY, handle);
  else await idbDelete(db, HANDLE_KEY);
  db.close();
}

async function ensurePermission(handle: FsFileHandle, mode: "read" | "readwrite"): Promise<boolean> {
  if (!handle.queryPermission) return true;
  const opts = { mode };
  if ((await handle.queryPermission(opts)) === "granted") return true;
  if (!handle.requestPermission) return false;
  return (await handle.requestPermission(opts)) === "granted";
}

// ── target info / attach / detach ──────────────────────────────────
export async function getSyncTargetInfo(): Promise<SyncTargetInfo> {
  if (isTauriRuntime()) {
    const path = typeof localStorage !== "undefined" ? localStorage.getItem(LS_SYNC_PATH) : null;
    return { mode: "desktop", label: path ? path.split(/[\\/]/).pop() ?? path : null, canAttach: true };
  }
  if (webFilePickerSupported()) {
    const handle = await getHandle();
    return { mode: "web-file", label: handle?.name ?? null, canAttach: true };
  }
  return { mode: "download", label: null, canAttach: false };
}

export async function attachSyncTarget(): Promise<string | null> {
  if (isTauriRuntime()) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const path = await save({
      title: "Choose a sync file shared with the other Revision app",
      defaultPath: "revision-sync.json",
      filters: [{ name: "Revision sync", extensions: ["json"] }],
    });
    if (!path) return null;
    localStorage.setItem(LS_SYNC_PATH, path);
    return path.split(/[\\/]/).pop() ?? path;
  }
  const picker = pickerWindow()?.showSaveFilePicker;
  if (!picker) throw new Error("This browser cannot keep a file attached. Use Download/Import instead.");
  try {
    const handle = await picker({
      suggestedName: "revision-sync.json",
      types: [{ description: "Revision sync", accept: { "application/json": [".json"] } }],
    });
    await setHandle(handle);
    return handle.name;
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return null;
    throw e;
  }
}

export async function detachSyncTarget(): Promise<void> {
  if (isTauriRuntime()) {
    localStorage.removeItem(LS_SYNC_PATH);
    return;
  }
  await setHandle(null);
}

// ── read / write ───────────────────────────────────────────────────
export async function readSyncTarget(): Promise<string | null> {
  if (isTauriRuntime()) {
    const path = localStorage.getItem(LS_SYNC_PATH);
    if (!path) return null;
    const { exists, readTextFile } = await import("@tauri-apps/plugin-fs");
    if (!(await exists(path))) return null;
    return readTextFile(path);
  }
  const handle = await getHandle();
  if (!handle) return null;
  if (!(await ensurePermission(handle, "read"))) throw new Error("Read permission was denied for the sync file");
  try {
    const file = await handle.getFile();
    return await file.text();
  } catch (e) {
    if (e instanceof DOMException && e.name === "NotFoundError") return null;
    throw e;
  }
}

export async function writeSyncTarget(text: string): Promise<void> {
  if (isTauriRuntime()) {
    const path = localStorage.getItem(LS_SYNC_PATH);
    if (!path) throw new Error("Attach a sync file first");
    const { writeTextFile } = await import("@tauri-apps/plugin-fs");
    await writeTextFile(path, text);
    return;
  }
  const handle = await getHandle();
  if (handle) {
    if (!(await ensurePermission(handle, "readwrite"))) throw new Error("Write permission was denied for the sync file");
    const writable = await handle.createWritable();
    await writable.write(text);
    await writable.close();
    return;
  }
  downloadSyncText(text);
}

export function downloadSyncText(text: string, name = "revision-sync"): void {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── merge helpers ──────────────────────────────────────────────────
export async function exportSyncText(): Promise<string> {
  return JSON.stringify(makeSyncFile(await getSyncSnapshot(), "revision-sync"));
}

/** Merge a remote sync/backup file into the local store, persist it, and return the merged snapshot. */
export async function syncWithText(remoteText: string): Promise<{ stats: MergeStats; merged: SyncFile }> {
  const local = makeSyncFile(await getSyncSnapshot(), "revision-sync");
  const remote = parseSyncFile(remoteText);
  const { merged, stats } = mergeSync(local, remote);
  await applySyncSnapshot(merged);
  return { stats, merged };
}

export function lastSyncAt(): string | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage.getItem(LS_SYNC_AT) : null;
  } catch {
    return null;
  }
}

export function markSynced(): string {
  const at = new Date().toISOString();
  try {
    localStorage.setItem(LS_SYNC_AT, at);
  } catch {}
  return at;
}
