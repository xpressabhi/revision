import { Database } from "tjs:sqlite";
import { extractCollectionBytes, isZipPackage, readArchiveEntries } from "./anki-archive";
import { queryAll } from "./sql";

export const COLLECTION_ENTRY = "collection.anki21";

/**
 * Extract (or stage) an Anki deck file into the app data dir and return the
 * path relative to it. Mirrors the old Tauri `stage_anki_db` command.
 */
export async function stageAnkiFile(srcPath: string, dataDir: string): Promise<string> {
  const ext = (srcPath.split(".").pop() ?? "").toLowerCase();
  let bytes: Uint8Array;
  if (isZipPackage(ext)) {
    const archiveBytes = await tjs.readFile(srcPath);
    const entries = readArchiveEntries(archiveBytes);
    if (!entries) throw new Error("Could not read the .apkg archive");
    const collection = extractCollectionBytes(entries);
    if (!collection) throw new Error("No collection database found in the .apkg");
    bytes = collection;
  } else {
    bytes = await tjs.readFile(srcPath);
  }
  const outDir = dataDir + "/anki-import";
  await tjs.makeDir(outDir, { recursive: true });
  await tjs.writeFile(outDir + "/" + COLLECTION_ENTRY, bytes);
  return "anki-import/" + COLLECTION_ENTRY;
}

let staged: Database | null = null;

export function openStaged(dataDir: string, rel: string): void {
  closeStaged();
  staged = new Database(dataDir + "/" + rel);
}

export function selectStaged(sql: string, params: unknown[]): Record<string, unknown>[] {
  if (!staged) throw new Error("no Anki database is open");
  return queryAll(staged, sql, params);
}

export function closeStaged(): void {
  if (staged) {
    try {
      staged.close();
    } catch {}
    staged = null;
  }
}

export async function cleanupStaged(dataDir: string): Promise<void> {
  closeStaged();
  try {
    await tjs.remove(dataDir + "/anki-import/" + COLLECTION_ENTRY);
  } catch {}
  try {
    await tjs.remove(dataDir + "/anki-import");
  } catch {}
}
