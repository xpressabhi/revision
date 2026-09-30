import { readFileSync } from "node:fs";
import { zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { extractCollectionBytes, isZipPackage, readArchiveEntries, type ArchiveEntries } from "./anki-archive";

const enc = new TextEncoder();

function zipBytes(entries: Record<string, Uint8Array>): Uint8Array {
  return zipSync(entries);
}

function zipEntries(entries: Record<string, Uint8Array>): ArchiveEntries {
  return readArchiveEntries(zipBytes(entries))!;
}

const zstFixture = new Uint8Array(readFileSync(new URL("./fixtures/anki21b.zst", import.meta.url)));

describe("isZipPackage", () => {
  it("accepts apkg and zip", () => {
    expect(isZipPackage("apkg")).toBe(true);
    expect(isZipPackage("zip")).toBe(true);
    expect(isZipPackage("anki2")).toBe(false);
    expect(isZipPackage("colpkg")).toBe(false);
  });
});

describe("readArchiveEntries", () => {
  it("unzips a valid archive", () => {
    const entries = readArchiveEntries(zipBytes({ "collection.anki2": enc.encode("db") }));
    expect(entries?.["collection.anki2"]).toEqual(enc.encode("db"));
  });

  it("returns null for broken bytes", () => {
    expect(readArchiveEntries(enc.encode("not a zip"))).toBeNull();
  });
});

describe("extractCollectionBytes", () => {
  it("prefers collection.anki21", () => {
    const out = extractCollectionBytes(
      zipEntries({
        "collection.anki21": enc.encode("new-format"),
        "collection.anki2": enc.encode("old-format"),
      })
    );
    expect(new TextDecoder().decode(out!)).toBe("new-format");
  });

  it("falls back to collection.anki2", () => {
    const out = extractCollectionBytes(zipEntries({ "collection.anki2": enc.encode("old-format") }));
    expect(new TextDecoder().decode(out!)).toBe("old-format");
  });

  it("decompresses collection.anki21b", () => {
    const out = extractCollectionBytes(zipEntries({ "collection.anki21b": zstFixture }));
    expect(new TextDecoder().decode(out!)).toBe("anki21b-smoke-payload-0123456789");
  });

  it("returns null when no collection file exists", () => {
    expect(extractCollectionBytes(zipEntries({ media: enc.encode("x") }))).toBeNull();
  });
});
