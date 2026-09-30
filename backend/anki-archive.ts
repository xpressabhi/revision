import { unzipSync } from "fflate";
import { decompress } from "fzstd";

export type ArchiveEntries = Record<string, Uint8Array>;

export function isZipPackage(ext: string): boolean {
  return ext === "apkg" || ext === "zip";
}

/** Unzip an .apkg archive; null when the bytes are not a readable zip. */
export function readArchiveEntries(archiveBytes: Uint8Array): ArchiveEntries | null {
  try {
    return unzipSync(archiveBytes) as ArchiveEntries;
  } catch {
    return null;
  }
}

/**
 * Pick the collection database out of an Anki archive, newest format first.
 * `.anki21b` is zstd-compressed; the older two are plain SQLite files.
 */
export function extractCollectionBytes(entries: ArchiveEntries): Uint8Array | null {
  if (entries["collection.anki21"]) return entries["collection.anki21"];
  if (entries["collection.anki2"]) return entries["collection.anki2"];
  if (entries["collection.anki21b"]) return decompress(entries["collection.anki21b"]);
  return null;
}
